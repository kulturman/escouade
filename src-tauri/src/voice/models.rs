//! The speech models offered, and their download.

use anyhow::{bail, Result};
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tokio::io::AsyncWriteExt;

/// One of the Whisper models offered.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Model {
    pub id: &'static str,
    pub file: &'static str,
    pub bytes: u64,
    pub sha256: &'static str,
}

/// Sizes and checksums read from Hugging Face's API on 2026-10-15, smallest first.
pub const MODELS: [Model; 4] = [
    Model {
        id: "tiny",
        file: "ggml-tiny.bin",
        bytes: 77_691_713,
        sha256: "be07e048e1e599ad46341c8d2a135645097a538221678b7acdd1b1919c6e1b21",
    },
    Model {
        id: "base",
        file: "ggml-base.bin",
        bytes: 147_951_465,
        sha256: "60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe",
    },
    Model {
        id: "small-q5_1",
        file: "ggml-small-q5_1.bin",
        bytes: 190_085_487,
        sha256: "ae85e4a935d7a567bd102fe55afc16bb595bdb618e11b2fc7591bc08120411bb",
    },
    Model {
        id: "large-v3-turbo-q5_0",
        file: "ggml-large-v3-turbo-q5_0.bin",
        bytes: 574_041_195,
        sha256: "394221709cd5ad1f40c46e6031ca61bce88931e6e088c188294c6d5a55ffa7e2",
    },
];

pub const DEFAULT_MODEL: &str = "small-q5_1";

const BASE_URL: &str = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

pub fn find(id: &str) -> Option<&'static Model> {
    MODELS.iter().find(|m| m.id == id)
}

/// Where the models are downloaded from: Hugging Face; in a debug build,
/// `ESCOUADE_VOICE_MODELS_URL` when set (end-to-end tests, demos).
pub fn base_url() -> String {
    if cfg!(debug_assertions) {
        if let Ok(url) = std::env::var("ESCOUADE_VOICE_MODELS_URL") {
            return url;
        }
    }
    BASE_URL.into()
}

pub fn path(dir: &Path, m: &Model) -> PathBuf {
    dir.join(m.file)
}

/// Downloaded: its file is there, whole (the checksum is only computed while downloading).
pub fn is_installed(dir: &Path, m: &Model) -> bool {
    std::fs::metadata(path(dir, m)).is_ok_and(|md| md.len() == m.bytes)
}

/// A model as the window shows it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ModelState {
    pub id: String,
    pub bytes: u64,
    pub installed: bool,
}

pub fn states(dir: &Path) -> Vec<ModelState> {
    MODELS
        .iter()
        .map(|m| ModelState {
            id: m.id.into(),
            bytes: m.bytes,
            installed: is_installed(dir, m),
        })
        .collect()
}

/// Downloads `m` from `base` into `dir`: to `<file>.part`, its checksum computed on the way,
/// renamed once whole and right. `progress` gets (received, total) at most ten times a second,
/// and once at the end. `cancel` stops it; a stopped or failed download leaves nothing.
pub async fn download(
    client: &reqwest::Client,
    base: &str,
    dir: &Path,
    m: &Model,
    cancel: &AtomicBool,
    mut progress: impl FnMut(u64, u64),
) -> Result<()> {
    tokio::fs::create_dir_all(dir).await?;
    let part = dir.join(format!("{}.part", m.file));
    let result = async {
        let mut resp = client
            .get(format!("{base}/{}", m.file))
            .send()
            .await?
            .error_for_status()?;
        let mut file = tokio::fs::File::create(&part).await?;
        let mut hasher = Sha256::new();
        let mut got = 0u64;
        let mut last: Option<Instant> = None;
        while let Some(chunk) = resp.chunk().await? {
            if cancel.load(Ordering::Acquire) {
                bail!(tr!("téléchargement annulé", "download cancelled"));
            }
            got += chunk.len() as u64;
            if got > m.bytes {
                break;
            }
            hasher.update(&chunk);
            file.write_all(&chunk).await?;
            if last.is_none_or(|t| t.elapsed() >= Duration::from_millis(100)) {
                progress(got, m.bytes);
                last = Some(Instant::now());
            }
        }
        file.flush().await?;
        drop(file);
        if got != m.bytes {
            bail!(tr!(
                "le modèle reçu n’a pas la taille attendue ({got} octets sur {})",
                "the model received is not the expected size ({got} bytes of {})",
                m.bytes
            ));
        }
        if format!("{:x}", hasher.finalize()) != m.sha256 {
            bail!(tr!(
                "le modèle reçu est corrompu (somme de contrôle)",
                "the model received is corrupt (checksum)"
            ));
        }
        progress(got, m.bytes);
        tokio::fs::rename(&part, path(dir, m)).await?;
        Ok(())
    }
    .await;
    if result.is_err() {
        let _ = tokio::fs::remove_file(&part).await;
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Arc;
    use tokio::io::AsyncReadExt;
    use tokio::net::TcpListener;

    /// A folder of its own for each test.
    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("escouade-voice-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        d
    }

    /// A server answering every request with `body`, in two halves 100 ms apart.
    async fn serve(body: Vec<u8>) -> String {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(async move {
            while let Ok((mut sock, _)) = listener.accept().await {
                let body = body.clone();
                tokio::spawn(async move {
                    let mut buf = [0u8; 4096];
                    let _ = sock.read(&mut buf).await;
                    let head = format!(
                        "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                        body.len()
                    );
                    let half = body.len() / 2;
                    let _ = sock.write_all(head.as_bytes()).await;
                    let _ = sock.write_all(&body[..half]).await;
                    let _ = sock.flush().await;
                    tokio::time::sleep(Duration::from_millis(100)).await;
                    let _ = sock.write_all(&body[half..]).await;
                });
            }
        });
        format!("http://{addr}")
    }

    fn model_of(body: &[u8]) -> Model {
        let sum = format!("{:x}", Sha256::digest(body));
        Model {
            id: "t",
            file: "t.bin",
            bytes: body.len() as u64,
            sha256: Box::leak(sum.into_boxed_str()),
        }
    }

    #[test]
    fn the_catalog_is_whole() {
        let mut ids: Vec<_> = MODELS.iter().map(|m| m.id).collect();
        ids.dedup();
        assert_eq!(ids.len(), MODELS.len());
        assert!(find(DEFAULT_MODEL).is_some());
        assert!(MODELS.windows(2).all(|w| w[0].bytes < w[1].bytes));
        for m in MODELS {
            assert_eq!(m.sha256.len(), 64, "{}", m.id);
            assert!(m
                .sha256
                .chars()
                .all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        }
    }

    #[tokio::test]
    async fn installs_a_model_whole_and_right() {
        let body = vec![7u8; 300_000];
        let m = model_of(&body);
        let base = serve(body).await;
        let dir = scratch("ok");
        let mut seen = Vec::new();
        download(
            &reqwest::Client::new(),
            &base,
            &dir,
            &m,
            &AtomicBool::new(false),
            |g, t| seen.push((g, t)),
        )
        .await
        .unwrap();
        assert!(is_installed(&dir, &m));
        assert!(!dir.join("t.bin.part").exists());
        assert_eq!(seen.last(), Some(&(300_000, 300_000)));
        assert!(seen.windows(2).all(|w| w[0].0 <= w[1].0));
    }

    #[tokio::test]
    async fn a_wrong_checksum_leaves_nothing() {
        let body = vec![7u8; 1_000];
        let mut m = model_of(&body);
        m.sha256 = "0000000000000000000000000000000000000000000000000000000000000000";
        let base = serve(body).await;
        let dir = scratch("sum");
        let e = download(
            &reqwest::Client::new(),
            &base,
            &dir,
            &m,
            &AtomicBool::new(false),
            |_, _| {},
        )
        .await
        .unwrap_err();
        assert!(e.to_string().contains("somme de contrôle"), "{e}");
        assert!(!dir.join("t.bin").exists());
        assert!(!dir.join("t.bin.part").exists());
    }

    #[tokio::test]
    async fn a_short_or_long_file_is_refused() {
        let body = vec![7u8; 1_000];
        for bytes in [999, 1_001] {
            let mut m = model_of(&body);
            m.bytes = bytes;
            let base = serve(body.clone()).await;
            let dir = scratch(&format!("size{bytes}"));
            let e = download(
                &reqwest::Client::new(),
                &base,
                &dir,
                &m,
                &AtomicBool::new(false),
                |_, _| {},
            )
            .await
            .unwrap_err();
            assert!(e.to_string().contains("taille"), "{e}");
            assert!(!dir.join("t.bin.part").exists());
        }
    }

    #[tokio::test]
    async fn cancelling_stops_and_leaves_nothing() {
        let body = vec![7u8; 200_000];
        let m = model_of(&body);
        let base = serve(body).await;
        let dir = scratch("cancel");
        let cancel = Arc::new(AtomicBool::new(false));
        let flag = cancel.clone();
        let e = download(
            &reqwest::Client::new(),
            &base,
            &dir,
            &m,
            &cancel,
            move |_, _| flag.store(true, Ordering::Release),
        )
        .await
        .unwrap_err();
        assert!(e.to_string().contains("annulé"), "{e}");
        assert!(!dir.join("t.bin").exists());
        assert!(!dir.join("t.bin.part").exists());
    }

    #[test]
    fn lists_the_models_with_what_is_installed() {
        let dir = scratch("states");
        std::fs::create_dir_all(&dir).unwrap();
        let tiny = find("tiny").unwrap();
        std::fs::write(path(&dir, tiny), b"too short").unwrap();
        let s = states(&dir);
        assert_eq!(s.len(), 4);
        assert!(s.iter().all(|m| !m.installed));
        assert_eq!(
            serde_json::to_value(&s[2]).unwrap(),
            serde_json::json!({ "id": "small-q5_1", "bytes": 190_085_487u64, "installed": false })
        );
    }
}
