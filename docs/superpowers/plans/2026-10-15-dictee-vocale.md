# Dictée vocale des prompts — plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** dicter un prompt (bouton micro ou `Ctrl+Shift+M`), transcrit en local par Whisper, inséré au curseur du compositeur ou collé dans le terminal en vue Claude Code, jamais envoyé seul (issue #8, ESC-96).

**Architecture :** un module Rust `src-tauri/src/voice/` capte le micro (cpal, dans un fil à lui), le ramène en 16 kHz mono, le transcrit (whisper-rs, modèle chargé à la demande puis libéré) et télécharge les modèles (catalogue figé, SHA-256 vérifié). Sept commandes Tauri l'exposent ; côté fenêtre, une machine d'états unique (`src/lib/voice.svelte.ts`) pilote le bouton micro du compositeur, celui de l'en-tête en vue Claude Code, le raccourci, la fenêtre du premier usage et le groupe « Dictée » des réglages.

**Tech Stack :** Rust 1.98 (épinglé), Tauri 2, cpal 0.18, whisper-rs 0.16 (whisper.cpp, compilé par cmake), reqwest 0.12, sha2 ; Svelte 5, TypeScript, Vitest + Testing Library.

**Spec :** `docs/superpowers/specs/2026-10-15-dictee-vocale-design.md` — à lire avant chaque tâche.

## Global Constraints

- Branche `feat/dictee-vocale`. Messages de commit en français, `type(scope): … [ESC-96]`, corps qui dit ce qui a été essayé, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Node : utiliser `~/.nvm/versions/node/v22.22.1/bin` en tête du `PATH` (le `node` 22.15 de `/usr/local/bin` fait échouer `attachments.test.ts`). Lancer les scripts npm avec `rtk proxy npm …` (le hook RTK réécrit mal `npm run`).
- Commandes de vérification, depuis la racine : `rtk proxy npm run check`, `rtk proxy npx vitest run <fichiers>`, `cd src-tauri && cargo test <filtre>`, `cd src-tauri && cargo clippy --all-targets -- -D warnings`, `cd src-tauri && cargo fmt`, `rtk proxy npx prettier --check <fichiers>`.
- Aucun texte d'interface en dur : tout passe par `t('zone.clé')` (front, vérifié par `hardcoded.test.ts`) ou `tr!("français", "English")` (Rust). Français : tutoiement, apostrophe ’, guillemets « » avec espaces insécables. Anglais : même ton, majuscule au premier mot seulement.
- Dépendances ajoutées : `cpal = "0.18"`, `whisper-rs = { version = "0.16", features = ["log_backend"] }`. Rien d'autre (le téléchargement lit le corps par `Response::chunk()`, sans la feature `stream`).
- Pas de feature Cargo : `tauri dev` compile avec `--no-default-features`.
- Modèle par défaut `small-q5_1` ; réglages `voiceModel` (défaut `"small-q5_1"`) et `voiceLanguage` (défaut `"ui"`, sinon `"auto"` ou `fr`, `en`, `es`, `de`, `it`, `pt`, `nl`).
- Raccourci `Ctrl+Shift+M` (`⌘⇧M` sous macOS). Une dictée s'arrête seule au bout de 5 minutes.
- Les fichiers des modèles vivent dans `<dossier de données>/voice/` (`DataDir::voice_dir()`).
- Le son n'est jamais écrit sur le disque ni envoyé ; aucun événement de télémétrie ajouté.

## Review Focus

1. **Fenêtre rechargée pendant l'écoute** (rechargement de la webview, `Ctrl+R` en dev) : le micro resterait ouvert et la dictée suivante serait refusée. Attendu : `voice_start` arrête la dictée restée ouverte et en ouvre une neuve. → Tâche 4, test `a_dictation_left_open_is_handed_back_to_be_stopped` et usage de `put_capture` dans `voice_start`.
2. **Changement d'agent pendant la transcription** : attendu, le texte va dans le brouillon de l'agent de départ, pas dans le compositeur de l'agent affiché. → Tâche 5 (`voice.svelte.test.ts`, « goes to the draft of the agent it was started for ») et tâche 6 (`Composer.voice.test.ts`).
3. **Terminal de la vue Claude Code fermé ou relancé quand la transcription finit** : attendu, le texte n'est pas perdu (copié dans le presse-papiers, toast qui le dit). → Tâche 5, test « copies the text when the terminal is gone ».
4. **Insertion au milieu d'un mot, avant une ponctuation, après une espace, sur une sélection** : attendu, une espace avant si le caractère précédent n'en est pas une, une espace après seulement avant une lettre ou un chiffre, la sélection remplacée. → Tâche 5, tests de `insertDictation`.
5. **Deux téléchargements du même modèle** (fenêtre du premier usage puis réglages, ou double clic) : attendu, un seul téléchargement, le second refusé sans casser le premier. → Tâche 2 (refus côté Rust dans `voice_download`, tâche 4) et tâche 5 (« downloads a model once at a time »).

---

## Structure des fichiers

Créés :
- `src-tauri/src/voice/mod.rs` — état `Voice` du cœur, langue de Whisper.
- `src-tauri/src/voice/audio.rs` — mono, rééchantillonnage, niveau, silence (fonctions pures).
- `src-tauri/src/voice/text.rs` — nettoyage du texte de Whisper.
- `src-tauri/src/voice/models.rs` — catalogue, état installé, téléchargement vérifié.
- `src-tauri/src/voice/capture.rs` — micro (cpal) dans son fil, `Recorder` testable.
- `src-tauri/src/voice/transcribe.rs` — Whisper chargé, gardé, libéré.
- `src-tauri/Entitlements.plist`, `src-tauri/macos/fr.lproj/InfoPlist.strings` — micro sous macOS.
- `src/lib/voice-text.ts` (+ test) — insertion du texte dicté.
- `src/lib/voice.svelte.ts` (+ test) — machine d'états, téléchargements, livraison du texte.
- `src/lib/i18n/fr/voice.ts`, `src/lib/i18n/en/voice.ts` — textes de la dictée.
- `src/components/MicButton.svelte` — le bouton micro (compositeur et en-tête).
- `src/components/modals/VoiceSetupModal.svelte` (+ test) — premier usage.
- `src/components/settings/VoiceSettings.svelte` (+ test) — groupe « Dictée ».

Modifiés : `src-tauri/Cargo.toml`, `src-tauri/src/lib.rs`, `src-tauri/src/paths.rs`, `src-tauri/src/usage.rs`, `src-tauri/src/model.rs`, `src-tauri/src/core.rs`, `src-tauri/src/commands.rs`, `src-tauri/Info.plist`, `src-tauri/tauri.macos.conf.json`, `.github/workflows/ci.yml`, `.github/workflows/release.yml`, `src/lib/types.ts`, `src/lib/ipc.ts`, `src/test/ipc.ts`, `src/lib/i18n/{fr,en}/index.ts`, `src/lib/state.svelte.ts`, `src/lib/shortcuts.ts` (+ test), `src/lib/settings.svelte.ts`, `src/components/Composer.svelte`, `src/components/Conversation.svelte`, `src/components/AgentTerminal.svelte`, `src/components/settings/ApplicationTab.svelte`, `src/App.svelte`, `src/lib/i18n/GLOSSARY.md`, docs et site.

Le code Rust des tâches 1 à 4 a été compilé et testé le 2026-10-15 hors du dépôt (crate jetable, toolchain 1.98, clippy `-D warnings` propre, 23 tests verts, plus le test ignoré avec `ggml-small-q5_1.bin` sur un prompt français). Les seules différences dans Escouade : `tr!` et `Lang` sont ceux du crate (`crate::i18n::Lang`).

---

### Task 1 : traitement du signal et du texte (Rust)

**Files :**
- Create : `src-tauri/src/voice/mod.rs` (provisoire, complété en tâche 4), `src-tauri/src/voice/audio.rs`, `src-tauri/src/voice/text.rs`
- Modify : `src-tauri/src/lib.rs` (liste des `mod`)

**Interfaces :**
- Produces : `voice::audio::{RATE: u32, to_mono(&[f32], u16) -> Vec<f32>, resample(&[f32], u32) -> Vec<f32>, level(&[f32]) -> f32, is_silent(&[f32]) -> bool}` ; `voice::text::clean_text<S: AsRef<str>>(&[S]) -> String`.

- [ ] **Step 1 : déclarer le module.** Dans `src-tauri/src/lib.rs`, ajouter `mod voice;` à sa place alphabétique (après `mod usage;`… ordre actuel : `… mod updates; mod usage; mod which; mod worktrees; mod wsl;` → insérer `mod voice;` entre `mod usage;` et `mod which;`). Créer `src-tauri/src/voice/mod.rs` provisoire :

```rust
//! « Dictée » (ESC-96): a prompt said rather than typed.

pub mod audio;
pub mod text;
```

- [ ] **Step 2 : écrire les tests (ils échouent faute de code).** Créer `audio.rs` et `text.rs` avec seulement leur module `#[cfg(test)] mod tests` (celui des fichiers complets ci-dessous) et des signatures `todo!()` :

```rust
pub const RATE: u32 = 16_000;
pub fn to_mono(_samples: &[f32], _channels: u16) -> Vec<f32> { todo!() }
pub fn resample(_samples: &[f32], _from_hz: u32) -> Vec<f32> { todo!() }
pub fn level(_samples: &[f32]) -> f32 { todo!() }
pub fn is_silent(_samples: &[f32]) -> bool { todo!() }
fn rms(_samples: &[f32]) -> f32 { todo!() }
```

```rust
pub fn clean_text<S: AsRef<str>>(_segments: &[S]) -> String { todo!() }
```

- [ ] **Step 3 : vérifier l'échec.** Run : `cd src-tauri && cargo test voice::` — Expected : les tests compilent et échouent (`not yet implemented`). `#[allow(dead_code)]` n'est pas nécessaire : les tests utilisent tout ; si `cargo build` hors tests avertit de code mort, c'est normal jusqu'à la tâche 4.

- [ ] **Step 4 : implémenter.** Remplacer les deux fichiers par leur version complète.

`src-tauri/src/voice/audio.rs` :

```rust
//! The microphone's sound made into what Whisper reads: mono, 16 kHz, `f32`.

/// The rate Whisper reads.
pub const RATE: u32 = 16_000;

/// The channels of interleaved frames, averaged into one.
pub fn to_mono(samples: &[f32], channels: u16) -> Vec<f32> {
    let n = channels.max(1) as usize;
    if n == 1 {
        return samples.to_vec();
    }
    samples
        .chunks_exact(n)
        .map(|frame| frame.iter().sum::<f32>() / n as f32)
        .collect()
}

/// `samples` at `from_hz` brought to 16 kHz: a moving average over one output step first (what
/// lies above 8 kHz would fold back into the voice), then linear interpolation. Enough for speech.
pub fn resample(samples: &[f32], from_hz: u32) -> Vec<f32> {
    if from_hz == RATE || samples.is_empty() || from_hz == 0 {
        return samples.to_vec();
    }
    let ratio = from_hz as f64 / RATE as f64;
    let smoothed = if ratio > 1.0 {
        smooth(samples, ratio.round() as usize)
    } else {
        samples.to_vec()
    };
    let out_len = (samples.len() as f64 / ratio).floor() as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let j = pos.floor() as usize;
            let frac = (pos - j as f64) as f32;
            let a = smoothed[j];
            let b = smoothed.get(j + 1).copied().unwrap_or(a);
            a + (b - a) * frac
        })
        .collect()
}

/// The mean over a window of `width` samples centered on each one.
fn smooth(samples: &[f32], width: usize) -> Vec<f32> {
    if width <= 1 {
        return samples.to_vec();
    }
    let mut prefix = Vec::with_capacity(samples.len() + 1);
    prefix.push(0.0f64);
    for &s in samples {
        prefix.push(prefix[prefix.len() - 1] + s as f64);
    }
    let half = width / 2;
    (0..samples.len())
        .map(|i| {
            let lo = i.saturating_sub(half);
            let hi = (i + width - half).min(samples.len());
            ((prefix[hi] - prefix[lo]) / (hi - lo) as f64) as f32
        })
        .collect()
}

fn rms(samples: &[f32]) -> f32 {
    if samples.is_empty() {
        return 0.0;
    }
    (samples.iter().map(|s| s * s).sum::<f32>() / samples.len() as f32).sqrt()
}

/// How loud `samples` are, between 0 (-60 dB or less) and 1 (0 dB): the gauge under the button.
pub fn level(samples: &[f32]) -> f32 {
    let r = rms(samples);
    if r <= 0.0 {
        return 0.0;
    }
    ((20.0 * r.log10() + 60.0) / 60.0).clamp(0.0, 1.0)
}

/// Nothing worth transcribing: Whisper makes up sentences out of silence.
pub fn is_silent(samples: &[f32]) -> bool {
    let r = rms(samples);
    r <= 0.0 || 20.0 * r.log10() < -50.0
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f32::consts::PI;

    fn sine(freq: f32, rate: u32, seconds: f32, amp: f32) -> Vec<f32> {
        let n = (rate as f32 * seconds) as usize;
        (0..n)
            .map(|i| amp * (2.0 * PI * freq * i as f32 / rate as f32).sin())
            .collect()
    }

    fn crossings(s: &[f32]) -> usize {
        s.windows(2)
            .filter(|w| (w[0] < 0.0) != (w[1] < 0.0))
            .count()
    }

    #[test]
    fn averages_the_channels_of_each_frame() {
        assert_eq!(
            to_mono(&[1.0, 0.0, 0.5, 0.5, -1.0, 1.0], 2),
            vec![0.5, 0.5, 0.0]
        );
        assert_eq!(to_mono(&[0.25, 0.5], 1), vec![0.25, 0.5]);
    }

    #[test]
    fn brings_48_and_44_1_khz_to_16_khz_keeping_the_pitch() {
        for rate in [48_000, 44_100] {
            let out = resample(&sine(440.0, rate, 1.0, 0.5), rate);
            assert!(
                (out.len() as i64 - 16_000).abs() <= 1,
                "{rate}: {}",
                out.len()
            );
            let c = crossings(&out) as i64;
            assert!((c - 880).abs() <= 4, "{rate}: {c} crossings");
        }
    }

    #[test]
    fn leaves_16_khz_as_it_is_and_stretches_8_khz() {
        let s = sine(440.0, 16_000, 0.1, 0.5);
        assert_eq!(resample(&s, 16_000), s);
        assert_eq!(resample(&sine(440.0, 8_000, 1.0, 0.5), 8_000).len(), 16_000);
    }

    #[test]
    fn damps_a_tone_above_8_khz_rather_than_folding_it_into_the_voice() {
        let input = sine(12_000.0, 48_000, 1.0, 0.5);
        let out = resample(&input, 48_000);
        assert!(
            rms(&out) < 0.4 * rms(&input),
            "{} vs {}",
            rms(&out),
            rms(&input)
        );
    }

    #[test]
    fn measures_the_level_in_decibels() {
        assert_eq!(level(&[]), 0.0);
        assert_eq!(level(&[0.0; 100]), 0.0);
        assert!((level(&[1.0, -1.0]) - 1.0).abs() < 1e-6);
        // -20 dB.
        assert!((level(&[0.1, -0.1]) - 40.0 / 60.0).abs() < 1e-3);
    }

    #[test]
    fn tells_silence_from_a_voice() {
        assert!(is_silent(&[]));
        assert!(is_silent(&[0.0; 1000]));
        assert!(is_silent(&sine(200.0, 16_000, 1.0, 0.002)));
        assert!(!is_silent(&sine(200.0, 16_000, 1.0, 0.1)));
    }
}
```

`src-tauri/src/voice/text.rs` :

```rust
//! What Whisper hands back, made into the text inserted.

/// The segments put end to end, spaces normalized, the marks Whisper writes alone
/// (`[Musique]`, `(silence)`, `[BLANK_AUDIO]`) left out.
pub fn clean_text<S: AsRef<str>>(segments: &[S]) -> String {
    segments
        .iter()
        .map(|s| s.as_ref().trim())
        .filter(|s| !is_mark(s))
        .flat_map(|s| s.split_whitespace())
        .collect::<Vec<_>>()
        .join(" ")
}

fn is_mark(s: &str) -> bool {
    s.is_empty()
        || (s.starts_with('[') && s.ends_with(']'))
        || (s.starts_with('(') && s.ends_with(')'))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn joins_the_segments_with_single_spaces() {
        assert_eq!(
            clean_text(&[" Ajoute un test", "  puis lance\n npm test. "]),
            "Ajoute un test puis lance npm test."
        );
    }

    #[test]
    fn leaves_out_the_marks_whisper_writes_alone() {
        assert_eq!(
            clean_text(&["[Musique]", " Bonjour.", "(silence)", "[BLANK_AUDIO]"]),
            "Bonjour."
        );
        assert_eq!(clean_text::<&str>(&[]), "");
        assert_eq!(clean_text(&["   "]), "");
    }

    #[test]
    fn keeps_brackets_inside_a_sentence() {
        assert_eq!(
            clean_text(&["Ouvre src/[id].ts (le routeur)"]),
            "Ouvre src/[id].ts (le routeur)"
        );
    }
}
```

- [ ] **Step 5 : vérifier.** Run : `cd src-tauri && cargo test voice:: && cargo clippy --all-targets -- -D warnings && cargo fmt --check` — Expected : 9 tests verts. Clippy peut signaler `dead_code` sur ces fonctions pas encore appelées hors tests : ajouter alors en tête de `voice/mod.rs` un `#![allow(dead_code)]` **provisoire**, retiré en tâche 4 (le noter dans le message de commit).

- [ ] **Step 6 : commit.**

```bash
git add src-tauri/src/lib.rs src-tauri/src/voice
git commit -m "feat(voice): son ramené en 16 kHz mono, niveau, silence et texte de Whisper nettoyé [ESC-96]"
```

---

### Task 2 : catalogue des modèles et téléchargement vérifié (Rust)

**Files :**
- Create : `src-tauri/src/voice/models.rs`
- Modify : `src-tauri/src/voice/mod.rs` (`pub mod models;`), `src-tauri/src/paths.rs` (`DataDir::voice_dir`), `src-tauri/src/usage.rs` (`download_client`)

**Interfaces :**
- Consumes : rien des tâches précédentes.
- Produces : `voice::models::{Model, MODELS: [Model; 4], DEFAULT_MODEL: &str, find(&str) -> Option<&'static Model>, base_url() -> String, path(&Path, &Model) -> PathBuf, is_installed(&Path, &Model) -> bool, ModelState { id: String, bytes: u64, installed: bool } (Serialize camelCase), states(&Path) -> Vec<ModelState>, download(&reqwest::Client, &str, &Path, &Model, &AtomicBool, impl FnMut(u64, u64)) -> anyhow::Result<()>}` ; `DataDir::voice_dir(&self) -> PathBuf` ; `usage::download_client(&Settings) -> anyhow::Result<reqwest::Client>`.

- [ ] **Step 1 : le dossier des modèles.** Dans `src-tauri/src/paths.rs`, `impl DataDir`, après `conversations()` :

```rust
    /// The dictation's speech models (`voice::models`), downloaded on demand.
    pub fn voice_dir(&self) -> PathBuf {
        self.0.join("voice")
    }
```

- [ ] **Step 2 : un client pour les gros téléchargements.** `usage::http_client` coupe toute requête au bout de 15 s : un modèle de 190 Mo n'y arriverait pas. Dans `src-tauri/src/usage.rs`, remplacer `http_client` par :

```rust
/// The app's own requests (quotas, ticket systems): through the proxy, trusting the certificates
/// the system trusts as well as the usual ones, or none checked when TLS verification is off.
fn client_builder(settings: &Settings) -> Result<reqwest::ClientBuilder> {
    let mut b = reqwest::Client::builder().danger_accept_invalid_certs(settings.insecure_tls);
    let url = settings.proxy_url.trim();
    if !url.is_empty() {
        let proxy =
            reqwest::Proxy::all(url)?.no_proxy(reqwest::NoProxy::from_string(&settings.no_proxy));
        b = b.proxy(proxy);
    }
    Ok(b)
}

pub fn http_client(settings: &Settings) -> Result<reqwest::Client> {
    Ok(client_builder(settings)?
        .timeout(Duration::from_secs(15))
        .build()?)
}

/// Large downloads (the dictation's models): no limit on the whole, only on connecting and on
/// a silence of the server.
pub fn download_client(settings: &Settings) -> Result<reqwest::Client> {
    Ok(client_builder(settings)?
        .connect_timeout(Duration::from_secs(15))
        .read_timeout(Duration::from_secs(30))
        .build()?)
}
```

Et dans son `mod tests` :

```rust
    #[test]
    fn the_download_client_takes_the_proxy_of_the_settings() {
        let mut s = Settings::default();
        assert!(download_client(&s).is_ok());
        s.proxy_url = "not a url".into();
        assert!(download_client(&s).is_err());
        assert!(http_client(&s).is_err());
    }
```

- [ ] **Step 3 : écrire les tests de `models.rs`.** Créer `src-tauri/src/voice/models.rs` avec le module de tests ci-dessous (fin du fichier complet) et des corps `todo!()` pour `find`, `base_url`, `path`, `is_installed`, `states`, `download`. Ajouter `pub mod models;` à `voice/mod.rs`.

- [ ] **Step 4 : vérifier l'échec.** Run : `cd src-tauri && cargo test voice::models usage::tests::the_download_client` — Expected : les tests de `models` échouent (`not yet implemented`) ; celui de `usage` passe.

- [ ] **Step 5 : implémenter.** `src-tauri/src/voice/models.rs` complet :

```rust
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
```

- [ ] **Step 6 : vérifier.** Run : `cd src-tauri && cargo test voice:: usage:: && cargo clippy --all-targets -- -D warnings && cargo fmt --check` — Expected : 6 tests de `models` verts (dont téléchargement juste, somme fausse, taille fausse, annulation), ceux de `usage` aussi.

- [ ] **Step 7 : commit.**

```bash
git add src-tauri/src/voice src-tauri/src/paths.rs src-tauri/src/usage.rs
git commit -m "feat(voice): catalogue des modèles Whisper et téléchargement vérifié par SHA-256 [ESC-96]"
```

---

### Task 3 : le micro (Rust, cpal) et ses autorisations

**Files :**
- Create : `src-tauri/src/voice/capture.rs`, `src-tauri/Entitlements.plist`, `src-tauri/macos/fr.lproj/InfoPlist.strings`
- Modify : `src-tauri/Cargo.toml`, `src-tauri/src/voice/mod.rs` (`pub mod capture;`), `src-tauri/Info.plist`, `src-tauri/tauri.macos.conf.json`, `.github/workflows/ci.yml:132`, `.github/workflows/release.yml:87`

**Interfaces :**
- Consumes : `voice::audio::{to_mono, resample, level}` (tâche 1).
- Produces : `voice::capture::{MAX_SECONDS: usize, EndReason {Device, Limit, Muted}, VoiceEvent {Level { value: f32 }, Ended { reason: EndReason }} (Serialize : {"type":"level","value"} / {"type":"ended","reason":"device"|"limit"|"muted"}), Recorder, Capture { start(impl Fn(VoiceEvent) + Send + 'static) -> Result<Capture>, finish(self) -> Vec<f32>, #[cfg(test)] fake(Vec<f32>) -> Capture }}`.

- [ ] **Step 1 : dépendance.** Dans `src-tauri/Cargo.toml`, `[dependencies]`, à l'ordre alphabétique : `cpal = "0.18"`. Run : `cd src-tauri && cargo build` — Expected : compile (sous Linux il faut `libasound2-dev`, voir step 6).

- [ ] **Step 2 : écrire les tests.** Créer `capture.rs` avec les types `EndReason`, `VoiceEvent`, `MAX_SECONDS`, la struct `Recorder` aux méthodes `todo!()`, et le module `#[cfg(test)] mod tests` du fichier complet ci-dessous. Ajouter `pub mod capture;` à `voice/mod.rs`.

- [ ] **Step 3 : vérifier l'échec.** Run : `cd src-tauri && cargo test voice::capture` — Expected : `events_read_as_the_window_expects` passe, les 4 autres échouent.

- [ ] **Step 4 : implémenter.** `src-tauri/src/voice/capture.rs` complet :

```rust
//! The microphone, through cpal. Its stream may not change threads: it lives in a thread of its
//! own, which the window's calls reach through channels.

use super::audio;
use anyhow::{anyhow, bail, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{FromSample, Sample, SampleFormat, SizedSample};
use serde::Serialize;
use std::sync::mpsc::{self, RecvTimeoutError, Sender, TryRecvError};
use std::time::{Duration, Instant};

/// A dictation stops by itself after this long.
pub const MAX_SECONDS: usize = 300;
/// How often the window gets the level.
const LEVEL_EVERY: Duration = Duration::from_millis(50);

/// Why a dictation ended without being asked to.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EndReason {
    /// The microphone went away (unplugged).
    Device,
    /// `MAX_SECONDS` reached.
    Limit,
    /// One second of exact zeros from the start: the system denies the microphone (macOS).
    Muted,
}

/// What the window hears from a dictation under way.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum VoiceEvent {
    Level { value: f32 },
    Ended { reason: EndReason },
}

/// What the device gave, kept as mono at its own rate. Apart from the device, to be tested.
pub struct Recorder {
    rate: u32,
    channels: u16,
    mono: Vec<f32>,
    heard: bool,
}

impl Recorder {
    pub fn new(rate: u32, channels: u16) -> Self {
        Self {
            rate,
            channels,
            mono: Vec::new(),
            heard: false,
        }
    }

    /// One chunk of interleaved frames: its level, or why the dictation must end.
    pub fn push(&mut self, interleaved: &[f32]) -> Result<f32, EndReason> {
        let mono = audio::to_mono(interleaved, self.channels);
        if !self.heard && mono.iter().any(|&s| s != 0.0) {
            self.heard = true;
        }
        self.mono.extend_from_slice(&mono);
        let second = self.rate as usize;
        if !self.heard && self.mono.len() >= second {
            return Err(EndReason::Muted);
        }
        if self.mono.len() >= second * MAX_SECONDS {
            return Err(EndReason::Limit);
        }
        Ok(audio::level(&mono))
    }

    /// The sound at 16 kHz.
    pub fn finish(self) -> Vec<f32> {
        audio::resample(&self.mono, self.rate)
    }
}

/// A dictation under way.
pub struct Capture {
    stop: Sender<()>,
    done: mpsc::Receiver<Vec<f32>>,
}

impl Capture {
    /// Opens the default microphone; `on_event` gets the level and an end not asked for.
    pub fn start(on_event: impl Fn(VoiceEvent) + Send + 'static) -> Result<Self> {
        let (ready_tx, ready_rx) = mpsc::channel::<Result<()>>();
        let (stop_tx, stop_rx) = mpsc::channel::<()>();
        let (done_tx, done_rx) = mpsc::channel::<Vec<f32>>();
        std::thread::Builder::new()
            .name("voice-capture".into())
            .spawn(move || {
                let (chunk_tx, chunk_rx) = mpsc::channel::<Vec<f32>>();
                let (err_tx, err_rx) = mpsc::channel::<()>();
                let (stream, rate, channels) = match open(chunk_tx, err_tx) {
                    Ok(opened) => {
                        let _ = ready_tx.send(Ok(()));
                        opened
                    }
                    Err(e) => {
                        let _ = ready_tx.send(Err(e));
                        return;
                    }
                };
                let mut rec = Recorder::new(rate, channels);
                let mut peak = 0f32;
                let mut last = Instant::now();
                loop {
                    match stop_rx.try_recv() {
                        Ok(()) | Err(TryRecvError::Disconnected) => break,
                        Err(TryRecvError::Empty) => {}
                    }
                    if err_rx.try_recv().is_ok() {
                        on_event(VoiceEvent::Ended {
                            reason: EndReason::Device,
                        });
                        break;
                    }
                    match chunk_rx.recv_timeout(Duration::from_millis(20)) {
                        Ok(chunk) => match rec.push(&chunk) {
                            Ok(level) => peak = peak.max(level),
                            Err(reason) => {
                                on_event(VoiceEvent::Ended { reason });
                                break;
                            }
                        },
                        Err(RecvTimeoutError::Timeout) => {}
                        Err(RecvTimeoutError::Disconnected) => break,
                    }
                    if last.elapsed() >= LEVEL_EVERY {
                        on_event(VoiceEvent::Level { value: peak });
                        peak = 0.0;
                        last = Instant::now();
                    }
                }
                drop(stream);
                let _ = done_tx.send(rec.finish());
            })?;
        ready_rx
            .recv()
            .map_err(|_| anyhow!("voice capture thread gone"))??;
        Ok(Self {
            stop: stop_tx,
            done: done_rx,
        })
    }

    /// A dictation that already heard `samples` (16 kHz), without a microphone.
    #[cfg(test)]
    pub fn fake(samples: Vec<f32>) -> Self {
        let (stop, _) = mpsc::channel();
        let (done_tx, done) = mpsc::channel();
        let _ = done_tx.send(samples);
        Self { stop, done }
    }

    /// Stops listening: the sound at 16 kHz (blocks until the thread is done).
    pub fn finish(self) -> Vec<f32> {
        let _ = self.stop.send(());
        self.done.recv().unwrap_or_default()
    }
}

fn open(chunks: Sender<Vec<f32>>, errors: Sender<()>) -> Result<(cpal::Stream, u32, u16)> {
    let device = cpal::default_host()
        .default_input_device()
        .ok_or_else(|| anyhow!(tr!("Aucun micro trouvé", "No microphone found")))?;
    let supported = device.default_input_config()?;
    let rate = supported.sample_rate();
    let channels = supported.channels();
    let format = supported.sample_format();
    let config: cpal::StreamConfig = supported.into();
    let on_error = move |e: cpal::Error| {
        log::warn!("voice: input stream: {e}");
        let _ = errors.send(());
    };
    let stream = match format {
        SampleFormat::F32 => build::<f32>(&device, config, chunks, on_error)?,
        SampleFormat::I16 => build::<i16>(&device, config, chunks, on_error)?,
        SampleFormat::I32 => build::<i32>(&device, config, chunks, on_error)?,
        SampleFormat::U16 => build::<u16>(&device, config, chunks, on_error)?,
        other => bail!("unsupported microphone format {other}"),
    };
    stream.play()?;
    Ok((stream, rate, channels))
}

fn build<T>(
    device: &cpal::Device,
    config: cpal::StreamConfig,
    chunks: Sender<Vec<f32>>,
    on_error: impl FnMut(cpal::Error) + Send + 'static,
) -> Result<cpal::Stream>
where
    T: SizedSample,
    f32: FromSample<T>,
{
    // The audio callback only copies its samples to the capture thread.
    let stream = device.build_input_stream(
        config,
        move |data: &[T], _: &cpal::InputCallbackInfo| {
            let _ = chunks.send(data.iter().map(|&s| f32::from_sample(s)).collect());
        },
        on_error,
        None,
    )?;
    Ok(stream)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn says_the_microphone_is_denied_after_a_second_of_exact_zeros() {
        let mut rec = Recorder::new(1_000, 1);
        assert!(rec.push(&[0.0; 600]).is_ok());
        assert_eq!(rec.push(&[0.0; 400]), Err(EndReason::Muted));
    }

    #[test]
    fn a_quiet_microphone_is_not_a_denied_one() {
        let mut rec = Recorder::new(1_000, 1);
        let mut chunk = vec![0.0; 1_500];
        chunk[10] = 0.0001;
        assert!(rec.push(&chunk).is_ok());
        assert!(rec.push(&[0.0; 1_000]).is_ok());
    }

    #[test]
    fn stops_after_five_minutes() {
        let mut rec = Recorder::new(100, 2);
        let minute = vec![0.1f32; 100 * 2 * 60];
        for _ in 0..4 {
            assert!(rec.push(&minute).is_ok());
        }
        assert_eq!(rec.push(&minute), Err(EndReason::Limit));
    }

    #[test]
    fn hands_back_mono_16_khz_with_each_chunk_s_level() {
        let mut rec = Recorder::new(48_000, 2);
        let level = rec.push(&vec![0.1f32; 48_000 * 2]).unwrap();
        assert!((level - 40.0 / 60.0).abs() < 1e-3);
        assert_eq!(rec.finish().len(), 16_000);
    }

    #[test]
    fn events_read_as_the_window_expects() {
        assert_eq!(
            serde_json::to_value(VoiceEvent::Level { value: 0.5 }).unwrap(),
            serde_json::json!({ "type": "level", "value": 0.5 })
        );
        assert_eq!(
            serde_json::to_value(VoiceEvent::Ended {
                reason: EndReason::Muted
            })
            .unwrap(),
            serde_json::json!({ "type": "ended", "reason": "muted" })
        );
    }
}
```

- [ ] **Step 5 : vérifier.** Run : `cd src-tauri && cargo test voice:: && cargo clippy --all-targets -- -D warnings && cargo fmt --check` — Expected : 5 tests de `capture` verts.

- [ ] **Step 6 : CI Linux.** cpal a besoin d'ALSA. Dans `.github/workflows/ci.yml` (ligne 132) et `.github/workflows/release.yml` (ligne 87), ajouter `libasound2-dev` à la fin de la ligne `sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev patchelf`. Ajouter aussi au README, section « Développement », une phrase : « Sous Linux, les en-têtes d'ALSA (`libasound2-dev`) et cmake sont nécessaires (la dictée) ; sous macOS et Windows, cmake. » (cmake : whisper.cpp, tâche 4).

- [ ] **Step 7 : autorisation macOS.**

`src-tauri/Info.plist`, dans le `<dict>` après `CFBundleLocalizations` :

```xml
  <key>NSMicrophoneUsageDescription</key>
  <string>Escouade uses the microphone to dictate prompts; the sound is transcribed on your Mac.</string>
```

`src-tauri/macos/fr.lproj/InfoPlist.strings` (UTF-8) :

```
"NSMicrophoneUsageDescription" = "Escouade utilise le micro pour dicter les prompts ; le son est transcrit sur ton Mac.";
```

`src-tauri/Entitlements.plist` (sans lui, l'app notarisée avec le runtime durci n'a pas le micro) :

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.device.audio-input</key>
  <true/>
</dict>
</plist>
```

`src-tauri/tauri.macos.conf.json`, dans `bundle.macOS` :

```json
    "macOS": {
      "minimumSystemVersion": "11.0",
      "signingIdentity": "-",
      "entitlements": "./Entitlements.plist",
      "files": {
        "Resources/fr.lproj/InfoPlist.strings": "./macos/fr.lproj/InfoPlist.strings"
      }
    }
```

- [ ] **Step 8 : vérifier le bundle macOS.** Run : `rtk proxy npx tauri build --debug --bundles app` puis :

```bash
APP=src-tauri/target/debug/bundle/macos/Escouade.app
/usr/libexec/PlistBuddy -c "Print :NSMicrophoneUsageDescription" "$APP/Contents/Info.plist"
cat "$APP/Contents/Resources/fr.lproj/InfoPlist.strings"
codesign -d --entitlements - "$APP" 2>&1 | grep audio-input
```

Expected : la phrase anglaise, la phrase française, `com.apple.security.device.audio-input`. Si `files` n'est pas reconnu par la version de Tauri du dépôt (`npx tauri build` le dit), consulter la doc de config Tauri 2 (`bundle.macOS.files`) avant tout contournement, et le signaler dans le commit.

- [ ] **Step 9 : commit.**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/voice src-tauri/Info.plist src-tauri/Entitlements.plist src-tauri/macos src-tauri/tauri.macos.conf.json .github/workflows README.md
git commit -m "feat(voice): micro capté par cpal dans son fil, autorisation macOS et ALSA en CI [ESC-96]"
```

---

### Task 4 : Whisper, réglages et commandes Tauri

**Files :**
- Create : `src-tauri/src/voice/transcribe.rs`
- Modify : `src-tauri/Cargo.toml`, `src-tauri/src/voice/mod.rs` (version finale), `src-tauri/src/model.rs` (`Settings`), `src-tauri/src/core.rs` (champ `voice`), `src-tauri/src/commands.rs`, `src-tauri/src/lib.rs` (`generate_handler!`)

**Interfaces :**
- Consumes : tâches 1 à 3.
- Produces (commandes Tauri, arguments en camelCase côté JS) :
  - `voice_models() -> Vec<ModelState>`
  - `voice_download(model: String, on_progress: Channel<DownloadProgress { received: u64, total: u64 }>) -> Res<()>`
  - `voice_cancel_download(model: String)`
  - `voice_delete_model(model: String) -> Res<()>`
  - `voice_start(on_event: Channel<VoiceEvent>) -> Res<()>`
  - `voice_stop() -> Res<String>` (vide : silence)
  - `voice_cancel()`
  - `voice_open_privacy() -> Res<()>` (macOS : Réglages Système › Confidentialité › Micro ; ailleurs, rien)
  - `Settings.voice_model: String` (`voiceModel`, défaut `"small-q5_1"`), `Settings.voice_language: String` (`voiceLanguage`, défaut `"ui"`).

- [ ] **Step 1 : dépendance.** `src-tauri/Cargo.toml` : `whisper-rs = { version = "0.16", features = ["log_backend"] }` (ordre alphabétique). Run : `cd src-tauri && cargo build` — Expected : compile whisper.cpp (cmake requis : `brew install cmake` s'il manque), une minute environ.

- [ ] **Step 2 : test des réglages (échoue).** Dans `src-tauri/src/model.rs`, `mod tests`, ajouter :

```rust
    #[test]
    fn the_dictation_uses_the_small_model_in_the_interface_s_language_unless_told_otherwise() {
        // Settings saved before the dictation have neither field.
        let s: Settings = serde_json::from_value(json!({ "sound": false })).unwrap();
        assert_eq!((s.voice_model.as_str(), s.voice_language.as_str()), ("small-q5_1", "ui"));
        let d = Settings::default();
        assert_eq!((d.voice_model.as_str(), d.voice_language.as_str()), ("small-q5_1", "ui"));
        let v = serde_json::to_value(Settings {
            voice_model: "base".into(),
            voice_language: "auto".into(),
            ..Default::default()
        })
        .unwrap();
        assert_eq!((&v["voiceModel"], &v["voiceLanguage"]), (&json!("base"), &json!("auto")));
    }
```

Run : `cd src-tauri && cargo test the_dictation_uses` — Expected : erreur de compilation (`no field voice_model`).

- [ ] **Step 3 : les réglages.** Dans `pub struct Settings` (après `telemetry`) :

```rust
    /// « Dictée › Modèle »: the speech model of the dictation (`voice::models`), downloaded on
    /// first use.
    pub voice_model: String,
    /// « Dictée › Langue parlée »: `ui` (the interface's), `auto` (detected) or a language code.
    pub voice_language: String,
```

Dans `impl Default for Settings`, après `telemetry: None,` :

```rust
            voice_model: crate::voice::models::DEFAULT_MODEL.into(),
            voice_language: "ui".into(),
```

Run : `cd src-tauri && cargo test the_dictation_uses` — Expected : PASS. Corriger toute construction littérale de `Settings { … }` sans `..Default::default()` que le compilateur signale.

- [ ] **Step 4 : `transcribe.rs`.** Créer `src-tauri/src/voice/transcribe.rs` :

```rust
//! Whisper, kept loaded between dictations, then let go of.

use super::text;
use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Once};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

/// Segments Whisper itself thinks are not speech are left out.
const NO_SPEECH: f32 = 0.6;

#[derive(Default)]
pub struct Whisper {
    loaded: Mutex<Option<(PathBuf, Arc<WhisperContext>)>>,
    /// Counts the dictations: the model is let go of when none came since (`unload_if`).
    uses: AtomicU64,
}

impl Whisper {
    /// The text of `audio` (16 kHz mono), in `language` (`None`: detected). Blocks: run it off
    /// the async threads.
    pub fn transcribe(
        &self,
        model: &Path,
        audio: &[f32],
        language: Option<&str>,
    ) -> Result<String> {
        // A file Whisper cannot read is no model: removed, the next dictation downloads it again.
        let ctx = self.context(model).map_err(|e| {
            log::warn!("voice: {} unreadable: {e:#}", model.display());
            let _ = std::fs::remove_file(model);
            anyhow!(tr!(
                "le modèle de dictée est illisible : il a été supprimé, la prochaine dictée le téléchargera de nouveau",
                "the dictation model can’t be read: it was removed, the next dictation will download it again"
            ))
        })?;
        let mut state = ctx.create_state()?;
        let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
        params.set_language(Some(language.unwrap_or("auto")));
        params.set_n_threads(threads());
        params.set_print_special(false);
        params.set_print_progress(false);
        params.set_print_realtime(false);
        params.set_print_timestamps(false);
        params.set_suppress_blank(true);
        params.set_no_speech_thold(NO_SPEECH);
        state.full(params, audio)?;
        let segments: Vec<String> = (0..state.full_n_segments())
            .filter_map(|i| state.get_segment(i))
            .filter(|s| s.no_speech_probability() < NO_SPEECH)
            .filter_map(|s| s.to_str_lossy().ok().map(|t| t.into_owned()))
            .collect();
        Ok(text::clean_text(&segments))
    }

    /// One more dictation: what `unload_if` compares with.
    pub fn touch(&self) -> u64 {
        self.uses.fetch_add(1, Ordering::AcqRel) + 1
    }

    /// Lets the model go, unless a dictation came after `generation`.
    pub fn unload_if(&self, generation: u64) {
        if self.uses.load(Ordering::Acquire) == generation {
            self.unload();
        }
    }

    pub fn unload(&self) {
        if self.loaded.lock().take().is_some() {
            log::info!("voice: model unloaded");
        }
    }

    fn context(&self, model: &Path) -> Result<Arc<WhisperContext>> {
        let mut loaded = self.loaded.lock();
        if let Some((path, ctx)) = &*loaded {
            if path == model {
                return Ok(ctx.clone());
            }
        }
        static HOOKS: Once = Once::new();
        HOOKS.call_once(whisper_rs::install_logging_hooks);
        let p = model
            .to_str()
            .ok_or_else(|| anyhow!("model path is not UTF-8"))?;
        let ctx = Arc::new(WhisperContext::new_with_params(
            p,
            WhisperContextParameters::default(),
        )?);
        log::info!("voice: model loaded from {}", model.display());
        *loaded = Some((model.to_path_buf(), ctx.clone()));
        Ok(ctx)
    }
}

/// The threads Whisper runs on: the machine's, at most 8 (more does not go faster).
fn threads() -> i32 {
    std::thread::available_parallelism().map_or(4, |n| n.get().min(8) as i32)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A real model and a recording, given by hand: `ESCOUADE_TEST_WHISPER_MODEL` (a `ggml-*.bin`)
    /// and `ESCOUADE_TEST_WHISPER_AUDIO` (16 kHz mono `f32` little-endian, no header).
    #[test]
    #[ignore = "needs a Whisper model and a recording, given through the environment"]
    fn transcribes_a_recording() {
        let model = std::env::var("ESCOUADE_TEST_WHISPER_MODEL").unwrap();
        let bytes = std::fs::read(std::env::var("ESCOUADE_TEST_WHISPER_AUDIO").unwrap()).unwrap();
        let audio: Vec<f32> = bytes
            .as_chunks::<4>()
            .0
            .iter()
            .map(|c| f32::from_le_bytes(*c))
            .collect();
        let w = Whisper::default();
        let text = w.transcribe(Path::new(&model), &audio, Some("fr")).unwrap();
        println!("{text}");
        assert!(text.to_lowercase().contains("test"), "{text}");
        // Loaded once, kept, then let go of.
        let g = w.touch();
        assert!(w.loaded.lock().is_some());
        w.touch();
        w.unload_if(g);
        assert!(w.loaded.lock().is_some());
        w.unload_if(g + 1);
        assert!(w.loaded.lock().is_none());
    }

    #[test]
    fn an_unreadable_model_is_an_error_not_a_crash() {
        let bad =
            std::env::temp_dir().join(format!("escouade-voice-bad-{}.bin", std::process::id()));
        std::fs::write(&bad, b"not a model").unwrap();
        assert!(Whisper::default()
            .transcribe(&bad, &[0.0; 16_000], Some("fr"))
            .is_err());
    }
}
```

- [ ] **Step 5 : `voice/mod.rs` final.** Remplacer `src-tauri/src/voice/mod.rs` (retirer l'éventuel `#![allow(dead_code)]` de la tâche 1) :

```rust
//! « Dictée » (ESC-96): a prompt said rather than typed. The microphone is heard here (cpal),
//! transcribed here too (Whisper, a model downloaded on demand): neither the sound nor the text
//! leaves the machine.

pub mod audio;
pub mod capture;
pub mod models;
pub mod text;
pub mod transcribe;

use crate::i18n::Lang;
use parking_lot::Mutex;
use std::collections::HashMap;
use std::sync::atomic::AtomicBool;
use std::sync::Arc;

/// The dictation's state, held by the core.
#[derive(Default)]
pub struct Voice {
    capture: Mutex<Option<capture::Capture>>,
    pub whisper: Arc<transcribe::Whisper>,
    /// The downloads under way, by model: their « Annuler ».
    pub downloads: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl Voice {
    /// Keeps `c` as the dictation under way; hands back the one before, which a window reloaded
    /// while listening left open (one microphone: it is to be stopped).
    pub fn put_capture(&self, c: capture::Capture) -> Option<capture::Capture> {
        self.capture.lock().replace(c)
    }

    pub fn take_capture(&self) -> Option<capture::Capture> {
        self.capture.lock().take()
    }
}

/// The language Whisper is told (« Langue parlée »): the interface's for `ui`, none for `auto`
/// (detected), else the one chosen.
pub fn language(setting: &str, ui: Lang) -> Option<String> {
    match setting {
        "auto" => None,
        "ui" | "" => Some(
            match ui {
                Lang::Fr => "fr",
                Lang::En => "en",
            }
            .into(),
        ),
        code => Some(code.into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tells_whisper_the_language_chosen() {
        assert_eq!(language("ui", Lang::Fr).as_deref(), Some("fr"));
        assert_eq!(language("ui", Lang::En).as_deref(), Some("en"));
        assert_eq!(language("", Lang::En).as_deref(), Some("en"));
        assert_eq!(language("auto", Lang::Fr), None);
        assert_eq!(language("de", Lang::Fr).as_deref(), Some("de"));
    }

    #[test]
    fn a_dictation_left_open_is_handed_back_to_be_stopped() {
        let v = Voice::default();
        assert!(v
            .put_capture(capture::Capture::fake(vec![0.1; 10]))
            .is_none());
        let old = v
            .put_capture(capture::Capture::fake(vec![0.2; 20]))
            .unwrap();
        assert_eq!(old.finish().len(), 10);
        assert_eq!(v.take_capture().unwrap().finish().len(), 20);
        assert!(v.take_capture().is_none());
    }
}
```

Run : `cd src-tauri && cargo test voice::` — Expected : 23 tests verts, 1 ignoré.

- [ ] **Step 6 : l'état dans le cœur.** Dans `src-tauri/src/core.rs`, `pub struct Core`, après `pub gh_token …` (n'importe où parmi les champs) :

```rust
    /// The dictation: the microphone listened to, Whisper loaded, the models downloading.
    pub voice: crate::voice::Voice,
```

Dans `Core::load`, dans le littéral `Arc::new_cyclic(|me| Self { … })`, ajouter `voice: Default::default(),`.

- [ ] **Step 7 : les commandes.** À la fin de `src-tauri/src/commands.rs` :

```rust
// « Dictée » (ESC-96): the microphone heard and transcribed on this machine.

use crate::voice::{self, capture::VoiceEvent, models::ModelState};
use std::sync::atomic::{AtomicBool, Ordering};

/// How far a model's download is, as the window's bar shows it.
#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    received: u64,
    total: u64,
}

fn voice_model(id: &str) -> Res<&'static voice::models::Model> {
    voice::models::find(id).ok_or_else(|| tr!("modèle inconnu : {id}", "unknown model: {id}"))
}

#[tauri::command]
pub fn voice_models(core: CoreState) -> Vec<ModelState> {
    voice::models::states(&core.data.voice_dir())
}

/// Downloads a model; refused while the same one downloads already.
#[tauri::command]
pub async fn voice_download(
    core: CoreState<'_>,
    model: String,
    on_progress: Channel<DownloadProgress>,
) -> Res<()> {
    let m = voice_model(&model)?;
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut downloads = core.voice.downloads.lock();
        if downloads.contains_key(&model) {
            return Err(tr!(
                "ce modèle est déjà en cours de téléchargement",
                "this model is already downloading"
            ));
        }
        downloads.insert(model.clone(), cancel.clone());
    }
    let client = crate::usage::download_client(&core.settings.read()).map_err(err);
    let result = match client {
        Ok(client) => voice::models::download(
            &client,
            &voice::models::base_url(),
            &core.data.voice_dir(),
            m,
            &cancel,
            |received, total| {
                let _ = on_progress.send(DownloadProgress { received, total });
            },
        )
        .await
        .map_err(err),
        Err(e) => Err(e),
    };
    core.voice.downloads.lock().remove(&model);
    result
}

#[tauri::command]
pub fn voice_cancel_download(core: CoreState, model: String) {
    if let Some(flag) = core.voice.downloads.lock().get(&model) {
        flag.store(true, Ordering::Release);
    }
}

#[tauri::command]
pub fn voice_delete_model(core: CoreState, model: String) -> Res<()> {
    let m = voice_model(&model)?;
    core.voice.whisper.unload();
    match std::fs::remove_file(voice::models::path(&core.data.voice_dir(), m)) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

/// Opens the microphone. A dictation a reloaded window left open is stopped first.
#[tauri::command(async)]
pub fn voice_start(core: CoreState, on_event: Channel<VoiceEvent>) -> Res<()> {
    let id = core.settings.read().voice_model.clone();
    let m = voice_model(&id)?;
    if !voice::models::is_installed(&core.data.voice_dir(), m) {
        return Err(tr!(
            "le modèle de dictée n’est pas installé",
            "the dictation model isn’t installed"
        ));
    }
    // One microphone: the one left open is let go of before opening it again.
    if let Some(old) = core.voice.take_capture() {
        old.finish();
    }
    let capture = voice::capture::Capture::start(move |e| {
        let _ = on_event.send(e);
    })
    .map_err(err)?;
    if let Some(old) = core.voice.put_capture(capture) {
        old.finish();
    }
    Ok(())
}

/// Stops listening and hands back the text (empty for a silence). The model stays loaded five
/// minutes for the next dictation.
#[tauri::command]
pub async fn voice_stop(core: CoreState<'_>) -> Res<String> {
    let capture = core
        .voice
        .take_capture()
        .ok_or_else(|| tr!("aucune dictée en cours", "no dictation under way"))?;
    let (id, setting) = {
        let s = core.settings.read();
        (s.voice_model.clone(), s.voice_language.clone())
    };
    let language = voice::language(&setting, core.lang().ui);
    let path = voice::models::path(&core.data.voice_dir(), voice_model(&id)?);
    let whisper = core.voice.whisper.clone();
    let generation = whisper.touch();
    let w = whisper.clone();
    let text = tauri::async_runtime::spawn_blocking(move || {
        let audio = capture.finish();
        if voice::audio::is_silent(&audio) {
            return Ok(String::new());
        }
        w.transcribe(&path, &audio, language.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(err)?;
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_secs(300)).await;
        whisper.unload_if(generation);
    });
    Ok(text)
}

#[tauri::command(async)]
pub fn voice_cancel(core: CoreState) {
    if let Some(c) = core.voice.take_capture() {
        c.finish();
    }
}

/// « Ouvrir les réglages » of « Escouade n’a pas accès au micro »: the system's privacy pane for
/// the microphone (macOS); nothing elsewhere.
#[tauri::command]
pub fn voice_open_privacy() -> Res<()> {
    #[cfg(target_os = "macos")]
    std::process::Command::new("open")
        .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone")
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}
```

Notes : `core.lang()` relit les réglages ; le bloc `{ let s = … }` relâche le verrou avant (le `RwLock` de parking_lot n'est pas réentrant). Si `core.lang()` n'est pas `pub` depuis `commands.rs`, il l'est (`pub fn lang(&self) -> LangInfo`, `core.rs:1774`).

- [ ] **Step 8 : enregistrer les commandes.** Dans `src-tauri/src/lib.rs`, `tauri::generate_handler![ … ]`, ajouter à la fin de la liste :

```rust
            commands::voice_models,
            commands::voice_download,
            commands::voice_cancel_download,
            commands::voice_delete_model,
            commands::voice_start,
            commands::voice_stop,
            commands::voice_cancel,
            commands::voice_open_privacy,
```

- [ ] **Step 9 : vérifier tout le backend.** Run : `cd src-tauri && cargo fmt && cargo clippy --all-targets -- -D warnings && cargo test` — Expected : clippy propre, tous les tests verts (la suite complète prend plusieurs minutes).

- [ ] **Step 10 : la vraie transcription, à la main (macOS).**

```bash
mkdir -p /tmp/voice-check && cd /tmp/voice-check
curl -sL -o ggml-small-q5_1.bin https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
shasum -a 256 ggml-small-q5_1.bin   # ae85e4a9…11bb
say -v Thomas -o p.wav --data-format=LEF32@16000 --channels=1 "Ajoute un test qui vérifie que le composant Composer insère le texte dicté au curseur, puis lance npm test."
python3 -I -c 'b=open("p.wav","rb").read();i=b.find(b"data");n=int.from_bytes(b[i+4:i+8],"little");open("p.f32","wb").write(b[i+8:i+8+n])'
cd /Users/arnaud/Documents/CODE/RUST/escouade/src-tauri
ESCOUADE_TEST_WHISPER_MODEL=/tmp/voice-check/ggml-small-q5_1.bin ESCOUADE_TEST_WHISPER_AUDIO=/tmp/voice-check/p.f32 \
  cargo test --release transcribes_a_recording -- --ignored --nocapture
```

Expected : PASS, la phrase transcrite affichée.

- [ ] **Step 11 : commit.**

```bash
git add src-tauri
git commit -m "feat(voice): transcription locale par Whisper, réglages et commandes de la dictée [ESC-96]"
```

---

### Task 5 : la dictée côté fenêtre (types, appels, machine d'états, textes)

**Files :**
- Create : `src/lib/voice-text.ts`, `src/lib/voice-text.test.ts`, `src/lib/voice.svelte.ts`, `src/lib/voice.svelte.test.ts`, `src/lib/i18n/fr/voice.ts`, `src/lib/i18n/en/voice.ts`
- Modify : `src/lib/types.ts`, `src/lib/ipc.ts`, `src/test/ipc.ts` (`SETTINGS`), `src/lib/state.svelte.ts` (type `Modal`), `src/lib/i18n/fr/index.ts`, `src/lib/i18n/en/index.ts`

**Interfaces :**
- Consumes : les commandes de la tâche 4.
- Produces :
  - `types.ts` : `Settings.voiceModel: string`, `Settings.voiceLanguage: string`, `VoiceModelState { id: string; bytes: number; installed: boolean }`, `VoiceProgress { received: number; total: number }`, `VoiceEvent = { type: 'level'; value: number } | { type: 'ended'; reason: 'device' | 'limit' | 'muted' }`.
  - `api.voiceModels()`, `api.voiceDownload(model, onProgress)`, `api.voiceCancelDownload(model)`, `api.voiceDeleteModel(model)`, `api.voiceStart(onEvent)`, `api.voiceStop()`, `api.voiceCancel()`, `api.voiceOpenPrivacy()`.
  - `voice-text.ts` : `insertDictation(text, start, end, dictated) -> { text, caret }`, `appendDictation(text, dictated) -> string`.
  - `voice.svelte.ts` : `VoiceTarget { kind: 'composer' | 'terminal'; agentId: string }`, `VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing'`, `VOICE_MODELS`, `VoiceModelId`, `RECOMMENDED_MODEL`, `VOICE_LANGUAGES`, et le singleton `voice` : `phase`, `level`, `target`, `downloads: Record<string, VoiceProgress>`, `isFor(target)`, `registerInserter(agentId, fn) -> () => void`, `toggle(target)`, `start(target)`, `stop()`, `cancel()`, `download(model) -> Promise<boolean>`, `cancelDownload(model)`.
  - `Modal` : `{ kind: 'voiceSetup'; target: VoiceTarget }`.

- [ ] **Step 1 : types et appels.** Dans `src/lib/types.ts`, `interface Settings` : ajouter `voiceModel: string;` et `voiceLanguage: string;` (avec un commentaire d'une ligne chacun, comme les autres champs). À la fin du fichier :

```ts
/** A speech model of the dictation, as `voice_models` lists it. */
export interface VoiceModelState {
  id: string;
  bytes: number;
  installed: boolean;
}

/** How far a model's download is. */
export interface VoiceProgress {
  received: number;
  total: number;
}

/** What a dictation under way says: the microphone's level, or an end not asked for. */
export type VoiceEvent = { type: 'level'; value: number } | { type: 'ended'; reason: 'device' | 'limit' | 'muted' };
```

Dans `src/lib/ipc.ts`, importer ces trois types, et ajouter dans `api` :

```ts
  /** The speech models of the dictation, with those downloaded. */
  voiceModels: () => invoke<VoiceModelState[]>('voice_models'),
  /** Downloads a model (checked by its checksum); refused while it downloads already. */
  voiceDownload: (model: string, onProgress: (p: VoiceProgress) => void) => {
    const channel = new Channel<VoiceProgress>();
    channel.onmessage = onProgress;
    return invoke<void>('voice_download', { model, onProgress: channel });
  },
  voiceCancelDownload: (model: string) => invoke<void>('voice_cancel_download', { model }),
  voiceDeleteModel: (model: string) => invoke<void>('voice_delete_model', { model }),
  /** Opens the microphone; `onEvent` gets its level and an end not asked for. */
  voiceStart: (onEvent: (e: VoiceEvent) => void) => {
    const channel = new Channel<VoiceEvent>();
    channel.onmessage = onEvent;
    return invoke<void>('voice_start', { onEvent: channel });
  },
  /** Stops listening: the text heard (empty for a silence). */
  voiceStop: () => invoke<string>('voice_stop'),
  voiceCancel: () => invoke<void>('voice_cancel'),
  /** macOS: the system's privacy pane for the microphone. */
  voiceOpenPrivacy: () => invoke<void>('voice_open_privacy'),
```

Dans `src/test/ipc.ts`, `SETTINGS` : ajouter `voiceModel: 'small-q5_1', voiceLanguage: 'ui',`. Run : `rtk proxy npm run check` — Expected : 0 erreur (le compilateur signale toute autre construction de `Settings` à compléter).

- [ ] **Step 2 : textes.** Créer `src/lib/i18n/fr/voice.ts` :

```ts
import type { Tree } from '../types';

// The dictation: the microphone button, the first use's window, its toasts, its settings.
export default {
  button: {
    start: 'Dicter ({key})',
    stop: 'Arrêter et transcrire ({key})',
    transcribing: 'Transcription…',
  },
  overlay: {
    listening: 'Dictée en cours · {key} pour arrêter',
    transcribing: 'Transcription…',
  },
  nothingHeard: 'Rien entendu',
  limit: 'Dictée arrêtée au bout de 5 minutes',
  muted: 'Escouade n’a pas accès au micro',
  openPrivacy: 'Ouvrir les réglages',
  copied: 'Le terminal est fermé : le texte dicté est dans le presse-papiers',
  model: {
    tiny: { name: 'Tiny', desc: 'le plus rapide, se trompe souvent' },
    base: { name: 'Base', desc: 'rapide, approximatif' },
    'small-q5_1': { name: 'Small', desc: 'juste et rapide' },
    'large-v3-turbo-q5_0': { name: 'Large turbo', desc: 'le plus juste, pour une machine puissante' },
    recommended: 'recommandé',
    installed: 'Installé',
  },
  setup: {
    title: 'Dictée vocale',
    body: 'La transcription se fait sur ta machine : ni le son ni le texte ne partent en ligne. Elle a besoin d’un modèle de reconnaissance de la parole, à télécharger une fois. Choisis-le :',
    later: 'Tu pourras en changer dans Réglages › Application › Dictée.',
    download: 'Télécharger et dicter',
    dictate: 'Dicter',
    retry: 'Réessayer',
    progress: '{received} sur {total}',
  },
  settings: {
    group: 'Dictée',
    note: 'Le micro est transcrit sur ta machine par Whisper ; rien ne part en ligne.',
    model: 'Modèle',
    modelDesc: 'Plus il est gros, plus il est juste et lent. Celui choisi est téléchargé à la première dictée s’il manque.',
    download: 'Télécharger',
    delete: 'Supprimer',
    cancel: 'Annuler',
    language: 'Langue parlée',
    languageDesc: 'La détection automatique se trompe plus souvent sur un prompt court.',
    languages: {
      ui: 'Langue de l’interface',
      auto: 'Détection automatique',
      fr: 'Français',
      en: 'Anglais',
      es: 'Espagnol',
      de: 'Allemand',
      it: 'Italien',
      pt: 'Portugais',
      nl: 'Néerlandais',
    },
  },
} satisfies Tree;
```

Créer `src/lib/i18n/en/voice.ts` :

```ts
import { defineZone } from '../types';

// The dictation: the microphone button, the first use's window, its toasts, its settings.
export default defineZone('voice', {
  button: {
    start: 'Dictate ({key})',
    stop: 'Stop and transcribe ({key})',
    transcribing: 'Transcribing…',
  },
  overlay: {
    listening: 'Dictating · {key} to stop',
    transcribing: 'Transcribing…',
  },
  nothingHeard: 'Nothing heard',
  limit: 'Dictation stopped after 5 minutes',
  muted: 'Escouade can’t access the microphone',
  openPrivacy: 'Open settings',
  copied: 'The terminal is closed: the dictated text is on the clipboard',
  model: {
    tiny: { name: 'Tiny', desc: 'the fastest, often wrong' },
    base: { name: 'Base', desc: 'fast, rough' },
    'small-q5_1': { name: 'Small', desc: 'accurate and fast' },
    'large-v3-turbo-q5_0': { name: 'Large turbo', desc: 'the most accurate, for a powerful machine' },
    recommended: 'recommended',
    installed: 'Installed',
  },
  setup: {
    title: 'Voice dictation',
    body: 'Transcription happens on your machine: neither the sound nor the text goes online. It needs a speech recognition model, downloaded once. Choose it:',
    later: 'You can change it in Settings › Application › Dictation.',
    download: 'Download and dictate',
    dictate: 'Dictate',
    retry: 'Retry',
    progress: '{received} of {total}',
  },
  settings: {
    group: 'Dictation',
    note: 'The microphone is transcribed on your machine by Whisper; nothing goes online.',
    model: 'Model',
    modelDesc: 'The bigger, the more accurate and the slower. The one chosen is downloaded on the first dictation if missing.',
    download: 'Download',
    delete: 'Delete',
    cancel: 'Cancel',
    language: 'Spoken language',
    languageDesc: 'Automatic detection is wrong more often on a short prompt.',
    languages: {
      ui: 'Interface language',
      auto: 'Automatic detection',
      fr: 'French',
      en: 'English',
      es: 'Spanish',
      de: 'German',
      it: 'Italian',
      pt: 'Portuguese',
      nl: 'Dutch',
    },
  },
});
```

Ajouter `import voice from './voice';` et la clé `voice,` aux objets de `src/lib/i18n/fr/index.ts` (`export const fr = { … }`) et `src/lib/i18n/en/index.ts` (`defineCatalog({ … })`). Les paramètres s'écrivent `{nom}` (comme `{name}` dans `composer.ts`) ; relire `src/lib/i18n/README.md` (espaces insécables du français, apostrophe ’) et corriger les textes en conséquence avant de lancer `hardcoded.test.ts` et `i18n.test.ts`. Run : `rtk proxy npm run check` — Expected : 0 erreur.

- [ ] **Step 3 : tests de l'insertion (échouent).** Créer `src/lib/voice-text.test.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { appendDictation, insertDictation } from './voice-text';

describe('insertDictation', () => {
  it('fills an empty field and puts the caret after the text', () => {
    expect(insertDictation('', 0, 0, 'Bonjour')).toEqual({ text: 'Bonjour', caret: 7 });
  });

  it('adds a space after a word, none after a space or a line break', () => {
    expect(insertDictation('Lance', 5, 5, 'les tests').text).toBe('Lance les tests');
    expect(insertDictation('Lance ', 6, 6, 'les tests').text).toBe('Lance les tests');
    expect(insertDictation('Lance\n', 6, 6, 'les tests').text).toBe('Lance\nles tests');
  });

  it('keeps the words apart when it lands inside a word, but not before punctuation', () => {
    expect(insertDictation('abcdef', 3, 3, 'X')).toEqual({ text: 'abc X def', caret: 5 });
    expect(insertDictation('Bonjour.', 7, 7, 'à tous').text).toBe('Bonjour à tous.');
  });

  it('replaces the selection', () => {
    expect(insertDictation('Lance les tests', 6, 9, 'tous les')).toEqual({ text: 'Lance tous les tests', caret: 14 });
  });
});

describe('appendDictation', () => {
  it('appends to a draft, a space between', () => {
    expect(appendDictation('', 'Bonjour')).toBe('Bonjour');
    expect(appendDictation('Lance', 'les tests')).toBe('Lance les tests');
  });
});
```

Run : `rtk proxy npx vitest run src/lib/voice-text.test.ts` — Expected : FAIL (module introuvable).

- [ ] **Step 4 : l'insertion.** Créer `src/lib/voice-text.ts` :

```ts
// Where the dictated text goes in a field.

/**
 * `dictated` put in place of `text`'s selection [start, end): a space before it when it follows a character that is
 * none, a space after it only before a letter or a digit (not before punctuation); the caret after it.
 */
export function insertDictation(text: string, start: number, end: number, dictated: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const tail = /^[\p{L}\p{N}]/u.test(after) ? ' ' : '';
  const piece = lead + dictated;
  return { text: before + piece + tail + after, caret: before.length + piece.length + tail.length };
}

/** `dictated` at the end of a draft. */
export function appendDictation(text: string, dictated: string): string {
  return insertDictation(text, text.length, text.length, dictated).text;
}
```

Note : dans « abc X def », le curseur est après l'espace ajoutée (5), prêt à continuer le mot suivant ; le test le fixe. Run : `rtk proxy npx vitest run src/lib/voice-text.test.ts` — Expected : PASS.

- [ ] **Step 5 : tests de la machine d'états (échouent).** Ajouter au type `Modal` de `src/lib/state.svelte.ts` :

```ts
  /** The dictation's first use, or its model missing: choose and download it, then listen for `target`. */
  | { kind: 'voiceSetup'; target: import('./voice.svelte').VoiceTarget }
```

(Préférer un `import type { VoiceTarget } from './voice.svelte';` en tête si le fichier importe ainsi ses autres types.)

Créer `src/lib/voice.svelte.test.ts` :

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDraft, setDraft } from './drafts';
import { app } from './state.svelte';
import * as terminals from './terminals';
import type { VoiceEvent } from './types';
import { voice } from './voice.svelte';
import { agent, fakeBackend, resetApp } from '../test/ipc';

const MODELS = (installed: boolean) => [
  { id: 'tiny', bytes: 1, installed: false },
  { id: 'small-q5_1', bytes: 2, installed },
];

function backend(over: Record<string, (args: any) => unknown> = {}) {
  let onEvent: ((e: VoiceEvent) => void) | null = null;
  const b = fakeBackend({
    voice_models: () => MODELS(true),
    voice_start: (args) => {
      onEvent = (e) => args.onEvent.onmessage(e);
    },
    voice_stop: () => 'texte dicté',
    ...over,
  });
  return { ...b, emit: (e: VoiceEvent) => onEvent!(e) };
}

const composer = (agentId = 'a1') => ({ kind: 'composer' as const, agentId });

describe('voice', () => {
  beforeEach(() => {
    resetApp({ agents: [agent(), agent({ id: 'a2' })] });
    voice.reset();
  });

  it('listens, then hands the text to the composer that asked', async () => {
    const b = backend();
    const got: string[] = [];
    const off = voice.registerInserter('a1', (t) => got.push(t));
    await voice.toggle(composer());
    expect(voice.phase).toBe('recording');
    b.emit({ type: 'level', value: 0.5 });
    expect(voice.level).toBe(0.5);
    await voice.toggle(composer());
    expect(b.called('voice_stop')).toHaveLength(1);
    expect(got).toEqual(['texte dicté']);
    expect(voice.phase).toBe('idle');
    off();
  });

  it('goes to the draft of the agent it was started for when its composer is gone', async () => {
    backend();
    setDraft('a1', { text: 'Lance', files: [] });
    await voice.start(composer('a1'));
    await voice.stop();
    expect(getDraft('a1').text).toBe('Lance texte dicté');
  });

  it('opens the first use when the model chosen is missing, without listening', async () => {
    const b = backend({ voice_models: () => MODELS(false) });
    await voice.toggle(composer());
    expect(app.modal).toEqual({ kind: 'voiceSetup', target: composer() });
    expect(b.called('voice_start')).toHaveLength(0);
    expect(voice.phase).toBe('idle');
  });

  it('says when nothing was heard', async () => {
    backend({ voice_stop: () => '' });
    const toast = vi.spyOn(app, 'toast');
    await voice.start(composer());
    await voice.stop();
    expect(toast).toHaveBeenCalledWith('Rien entendu');
  });

  it('cancels without transcribing', async () => {
    const b = backend();
    await voice.start(composer());
    await voice.cancel();
    expect(b.called('voice_cancel')).toHaveLength(1);
    expect(b.called('voice_stop')).toHaveLength(0);
    expect(voice.phase).toBe('idle');
  });

  it('stops a denied microphone and says so', async () => {
    const b = backend();
    const toast = vi.spyOn(app, 'toast');
    await voice.start(composer());
    b.emit({ type: 'ended', reason: 'muted' });
    await vi.waitFor(() => expect(b.called('voice_cancel')).toHaveLength(1));
    expect(toast.mock.calls[0][0]).toBe('Escouade n’a pas accès au micro');
    expect(voice.phase).toBe('idle');
  });

  it('transcribes what was heard when the microphone goes away or time is up', async () => {
    for (const reason of ['device', 'limit'] as const) {
      const b = backend();
      const got: string[] = [];
      const off = voice.registerInserter('a1', (t) => got.push(t));
      await voice.start(composer());
      b.emit({ type: 'ended', reason });
      await vi.waitFor(() => expect(got).toEqual(['texte dicté']));
      off();
    }
  });

  it('a click elsewhere while listening stops the dictation under way', async () => {
    const b = backend();
    await voice.start(composer('a1'));
    await voice.toggle(composer('a2'));
    expect(b.called('voice_stop')).toHaveLength(1);
    expect(b.called('voice_start')).toHaveLength(1);
  });

  it('pastes into the agent’s terminal in the Claude Code view', async () => {
    backend();
    app.agents.a1 = { ...app.agents.a1, terminalId: 't1' };
    const paste = vi.fn();
    const focus = vi.fn();
    vi.spyOn(terminals, 'getXTerm').mockReturnValue({ term: { paste, focus } } as any);
    await voice.start({ kind: 'terminal', agentId: 'a1' });
    await voice.stop();
    expect(terminals.getXTerm).toHaveBeenCalledWith('t1');
    expect(paste).toHaveBeenCalledWith('texte dicté');
  });

  it('copies the text when the terminal is gone', async () => {
    backend();
    vi.spyOn(terminals, 'getXTerm').mockReturnValue(undefined);
    const write = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText: write } });
    await voice.start({ kind: 'terminal', agentId: 'a1' });
    await voice.stop();
    expect(write).toHaveBeenCalledWith('texte dicté');
  });

  it('downloads a model once at a time, its progress shown', async () => {
    let finish!: () => void;
    let progress!: (p: { received: number; total: number }) => void;
    const b = backend({
      voice_download: (args) => {
        progress = (p) => args.onProgress.onmessage(p);
        return new Promise<void>((r) => (finish = r));
      },
    });
    const first = voice.download('small-q5_1');
    expect(await voice.download('small-q5_1')).toBe(false);
    await vi.waitFor(() => expect(progress).toBeDefined());
    progress({ received: 5, total: 10 });
    expect(voice.downloads['small-q5_1']).toEqual({ received: 5, total: 10 });
    finish();
    expect(await first).toBe(true);
    expect(voice.downloads['small-q5_1']).toBeUndefined();
    expect(b.called('voice_download')).toHaveLength(1);
  });

  it('a cancelled download is no error', async () => {
    backend({
      voice_download: () => Promise.reject('téléchargement annulé'),
    });
    const p = voice.download('tiny');
    await voice.cancelDownload('tiny');
    expect(await p).toBe(false);
  });
});
```

Run : `rtk proxy npx vitest run src/lib/voice.svelte.test.ts` — Expected : FAIL (module introuvable). Si Vitest refuse `vi.spyOn` sur un export d'ES module (« Cannot redefine property »), simuler le module comme `AgentTerminal.test.ts` le fait (`vi.mock('../lib/terminals', …)` hissé en tête, ici `vi.mock('./terminals', () => ({ getXTerm: vi.fn() }))`) et piloter `getXTerm` par `vi.mocked(getXTerm).mockReturnValue(…)`.

- [ ] **Step 6 : la machine d'états.** Créer `src/lib/voice.svelte.ts` :

```ts
// « Dictée » (ESC-96): one dictation at a time (one microphone), for the composer or the Claude Code terminal of an
// agent, fixed when it starts. The text goes to that agent even if another is shown by the time it is transcribed.

import { getDraft, setDraft } from './drafts';
import { t } from './i18n';
import { api } from './ipc';
import { IS_MAC } from './platform';
import { app } from './state.svelte';
import { getXTerm } from './terminals';
import type { VoiceEvent, VoiceProgress } from './types';
import { appendDictation } from './voice-text';

export interface VoiceTarget {
  kind: 'composer' | 'terminal';
  agentId: string;
}

export type VoicePhase = 'idle' | 'starting' | 'recording' | 'transcribing';

/** The models offered, smallest first (the backend's catalog, `voice::models`). */
export const VOICE_MODELS = ['tiny', 'base', 'small-q5_1', 'large-v3-turbo-q5_0'] as const;
/** A model's id, which names its texts (`voice.model.<id>`). */
export type VoiceModelId = (typeof VOICE_MODELS)[number];
export const RECOMMENDED_MODEL = 'small-q5_1';
/** « Langue parlée »: the interface's, detected, or one of these. */
export const VOICE_LANGUAGES = ['ui', 'auto', 'fr', 'en', 'es', 'de', 'it', 'pt', 'nl'] as const;

type Inserter = (text: string) => void;

class Voice {
  phase = $state<VoicePhase>('idle');
  /** The microphone's level, 0 to 1, while listening. */
  level = $state(0);
  target = $state<VoiceTarget | null>(null);
  /** The models downloading: bytes received and total. */
  downloads = $state<Record<string, VoiceProgress>>({});
  #inserters = new Map<string, Inserter>();
  #cancelled = new Set<string>();

  /** True while `target` is listened to or transcribed. */
  isFor(target: VoiceTarget): boolean {
    return this.phase !== 'idle' && this.target?.kind === target.kind && this.target.agentId === target.agentId;
  }

  /** The composer shown for `agentId` takes the text at its caret; the returned function lets go. */
  registerInserter(agentId: string, insert: Inserter): () => void {
    this.#inserters.set(agentId, insert);
    return () => {
      if (this.#inserters.get(agentId) === insert) this.#inserters.delete(agentId);
    };
  }

  /** The microphone button and the shortcut: stops the dictation under way, whoever it is for, else starts one. */
  async toggle(target: VoiceTarget) {
    if (this.phase === 'recording') return this.stop();
    if (this.phase === 'idle') return this.start(target);
  }

  async start(target: VoiceTarget) {
    if (this.phase !== 'idle') return;
    this.phase = 'starting';
    this.target = target;
    try {
      const models = await api.voiceModels();
      if (!models.find((m) => m.id === app.settings.voiceModel)?.installed) {
        this.reset();
        app.modal = { kind: 'voiceSetup', target };
        return;
      }
      await api.voiceStart((e) => this.#onEvent(e));
      this.phase = 'recording';
    } catch (e) {
      this.reset();
      app.toast(String(e), 'error');
    }
  }

  async stop() {
    if (this.phase !== 'recording' || !this.target) return;
    const target = this.target;
    this.phase = 'transcribing';
    this.level = 0;
    try {
      this.#deliver(target, await api.voiceStop());
    } catch (e) {
      app.toast(String(e), 'error');
    } finally {
      this.reset();
    }
  }

  async cancel() {
    if (this.phase !== 'recording') return;
    this.reset();
    await api.voiceCancel().catch((e) => app.toast(String(e), 'error'));
  }

  /** Downloads `model`, its progress in `downloads`. False when it was downloading already or got cancelled. */
  async download(model: string): Promise<boolean> {
    if (this.downloads[model]) return false;
    this.downloads[model] = { received: 0, total: 0 };
    try {
      await api.voiceDownload(model, (p) => (this.downloads[model] = p));
      return true;
    } catch (e) {
      if (this.#cancelled.has(model)) return false;
      throw e;
    } finally {
      delete this.downloads[model];
      this.#cancelled.delete(model);
    }
  }

  async cancelDownload(model: string) {
    this.#cancelled.add(model);
    await api.voiceCancelDownload(model);
  }

  /** Back to rest (tests start from it too). */
  reset() {
    this.phase = 'idle';
    this.level = 0;
    this.target = null;
  }

  #onEvent(e: VoiceEvent) {
    if (this.phase !== 'recording') return;
    if (e.type === 'level') {
      this.level = e.value;
      return;
    }
    if (e.reason === 'muted') {
      this.reset();
      api.voiceCancel().catch(() => {});
      app.toast(
        t('voice.muted'),
        'error',
        IS_MAC ? { label: t('voice.openPrivacy'), onClick: () => void api.voiceOpenPrivacy().catch(() => {}) } : undefined,
      );
      return;
    }
    if (e.reason === 'limit') app.toast(t('voice.limit'));
    void this.stop();
  }

  #deliver(target: VoiceTarget, text: string) {
    if (!text.trim()) {
      app.toast(t('voice.nothingHeard'));
      return;
    }
    if (target.kind === 'terminal') {
      const id = app.agents[target.agentId]?.terminalId;
      const xterm = id ? getXTerm(id) : undefined;
      if (xterm) {
        xterm.term.paste(text);
        xterm.term.focus();
        return;
      }
      // Its terminal closed meanwhile: the text is not lost.
      navigator.clipboard.writeText(text).then(
        () => app.toast(t('voice.copied')),
        (e) => app.toast(String(e), 'error'),
      );
      return;
    }
    const insert = this.#inserters.get(target.agentId);
    if (insert) insert(text);
    else {
      const draft = getDraft(target.agentId);
      setDraft(target.agentId, { ...draft, text: appendDictation(draft.text, text) });
    }
  }
}

export const voice = new Voice();
```

`getXTerm` rend l'enveloppe `XTerm` (`src/lib/terminals.ts:18`) : le `Terminal` de xterm.js est dans `.term`. Run : `rtk proxy npx vitest run src/lib/voice.svelte.test.ts src/lib/voice-text.test.ts && rtk proxy npm run check` — Expected : PASS, 0 erreur.

- [ ] **Step 7 : commit.**

```bash
git add src/lib
git commit -m "feat(voice): machine d'états de la dictée, insertion du texte et textes fr/en [ESC-96]"
```

---

### Task 6 : le bouton micro dans le compositeur

**Files :**
- Create : `src/components/MicButton.svelte`, `src/components/Composer.voice.test.ts`
- Modify : `src/components/Composer.svelte`

**Interfaces :**
- Consumes : `voice`, `VoiceTarget` (tâche 5), `insertDictation` (tâche 5).
- Produces : `<MicButton target={VoiceTarget} />` (bouton `icon-btn`, nom accessible = `t('voice.button.start'|'stop'|'transcribing')`).

- [ ] **Step 1 : tests (échouent).** Créer `src/components/Composer.voice.test.ts` :

```ts
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDraft } from '../lib/drafts';
import { app } from '../lib/state.svelte';
import { voice } from '../lib/voice.svelte';
import { agent, fakeBackend, resetApp } from '../test/ipc';
import Composer from './Composer.svelte';

function setup(over: Parameters<typeof agent>[0] = {}) {
  const a = agent({ id: `v${Math.random()}`, ...over });
  resetApp({ agents: [a] });
  voice.reset();
  const backend = fakeBackend({
    get_conversation: () => [],
    voice_models: () => [{ id: 'small-q5_1', bytes: 1, installed: true }],
    voice_stop: () => 'les tests',
  });
  const r = render(Composer, { agent: app.agents[a.id] });
  const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
  return { a, backend, textarea, ...r };
}

describe('Composer dictation', () => {
  beforeEach(() => resetApp());

  it('inserts the dictated text at the caret, never sends it', async () => {
    const { backend, textarea } = setup();
    await userEvent.type(textarea, 'Lance');
    await userEvent.click(screen.getByRole('button', { name: /^Dicter/ }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Arrêter et transcrire/ })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: /^Arrêter et transcrire/ }));
    await waitFor(() => expect(textarea.value).toBe('Lance les tests'));
    expect(textarea.selectionStart).toBe('Lance les tests'.length);
    expect(backend.called('send_message')).toHaveLength(0);
  });

  it('Escape cancels the dictation rather than interrupt Claude', async () => {
    // Claude works: Escape would interrupt it, were it not for the dictation.
    const { backend, textarea } = setup({ status: 'running' });
    await userEvent.click(screen.getByRole('button', { name: /^Dicter/ }));
    await waitFor(() => expect(voice.phase).toBe('recording'));
    textarea.focus();
    await userEvent.keyboard('{Escape}');
    expect(backend.called('voice_cancel')).toHaveLength(1);
    expect(backend.called('interrupt')).toHaveLength(0);
  });

  it('switching agents while transcribing leaves the text with the agent it was started for', async () => {
    let finish!: (t: string) => void;
    const a = agent({ id: 'x1' });
    const b = agent({ id: 'x2' });
    resetApp({ agents: [a, b] });
    voice.reset();
    fakeBackend({
      get_conversation: () => [],
      voice_models: () => [{ id: 'small-q5_1', bytes: 1, installed: true }],
      voice_stop: () => new Promise<string>((r) => (finish = r)),
    });
    const r = render(Composer, { agent: app.agents.x1 });
    await userEvent.click(screen.getByRole('button', { name: /^Dicter/ }));
    await waitFor(() => expect(voice.phase).toBe('recording'));
    await userEvent.click(screen.getByRole('button', { name: /^Arrêter et transcrire/ }));
    await r.rerender({ agent: app.agents.x2 });
    finish('pour x1');
    await waitFor(() => expect(getDraft('x1').text).toBe('pour x1'));
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('');
  });
});
```

(`send()` appelle `api.sendMessage`, commande `send_message` ; « Stop » appelle `api.interrupt`, commande `interrupt`.) Run : `rtk proxy npx vitest run src/components/Composer.voice.test.ts` — Expected : FAIL (pas de bouton « Dicter »).

- [ ] **Step 2 : le bouton.** Créer `src/components/MicButton.svelte` :

```svelte
<script lang="ts">
  import { t } from '../lib/i18n';
  import { keyLabel } from '../lib/platform';
  import { tip } from '../lib/tip';
  import { voice, type VoiceTarget } from '../lib/voice.svelte';

  // The dictation's button: starts listening for `target`, or stops the dictation under way (one microphone).
  let { target }: { target: VoiceTarget } = $props();

  const mine = $derived(voice.isFor(target));
  const recording = $derived(voice.phase === 'recording');
  const working = $derived(mine && (voice.phase === 'starting' || voice.phase === 'transcribing'));
  const key = keyLabel('Ctrl+Shift+M');
  const label = $derived(
    recording ? t('voice.button.stop', { key }) : working ? t('voice.button.transcribing') : t('voice.button.start', { key }),
  );
</script>

<button
  class="icon-btn mic"
  class:rec={mine && recording}
  use:tip={label}
  aria-label={label}
  aria-pressed={mine && recording}
  disabled={voice.phase === 'starting' || voice.phase === 'transcribing'}
  onclick={() => voice.toggle(target)}
>
  {#if working}
    <span class="spin" aria-hidden="true"></span>
  {:else}
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      ><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg
    >
  {/if}
  {#if mine && recording}
    <span class="gauge" aria-hidden="true"><span style:width={`${Math.round(voice.level * 100)}%`}></span></span>
  {/if}
</button>

<style>
  .mic {
    position: relative;
  }
  .mic.rec {
    color: var(--del);
  }
  .gauge {
    position: absolute;
    left: 3px;
    right: 3px;
    bottom: 1px;
    height: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, currentColor 20%, transparent);
    overflow: hidden;
  }
  .gauge > span {
    display: block;
    height: 100%;
    background: currentColor;
    transition: width 50ms linear;
  }
  .spin {
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: ccSpin 0.8s linear infinite;
  }
</style>
```

Couleurs et animation du thème (`src/app.css`) : `--del` (le rouge des suppressions) pour l'écoute, `--muted`, `--elev`, l'animation globale `ccSpin`.

- [ ] **Step 3 : le compositeur.** Dans `src/components/Composer.svelte` :

1. Imports : `import { voice } from '../lib/voice.svelte';`, `import { insertDictation } from '../lib/voice-text';`, `import MicButton from './MicButton.svelte';`.
2. Après l'effet qui donne le focus (`$effect(() => { void app.focusComposer; … })`), ajouter :

```ts
  // Dictated text goes in place of the selection, or at the caret, of the agent shown; another's goes to its draft.
  $effect(() => {
    const id = agentId;
    return voice.registerInserter(id, (dictated) => {
      const start = ta?.selectionStart ?? text.length;
      const end = ta?.selectionEnd ?? text.length;
      const r = insertDictation(text, start, end, dictated);
      text = r.text;
      queueMicrotask(() => {
        ta?.setSelectionRange(r.caret, r.caret);
        ta?.focus();
        autosize();
      });
    });
  });
```

3. Dans `onKeydown`, juste avant `if (e.key === 'Escape' && busy) {` :

```ts
    // Escape while dictating cancels the dictation, not Claude's turn.
    if (e.key === 'Escape' && voice.phase === 'recording' && voice.isFor({ kind: 'composer', agentId })) {
      e.preventDefault();
      e.stopPropagation();
      void voice.cancel();
      return;
    }
```

4. Dans la barre, entre le bouton `attach` et le bouton « Envoyer » : `<MicButton target={{ kind: 'composer', agentId }} />`.

Run : `rtk proxy npx vitest run src/components/Composer.voice.test.ts src/components/Composer.test.ts src/components/Composer.accounts.test.ts && rtk proxy npm run check` — Expected : PASS (les anciens tests du compositeur aussi), 0 erreur.

- [ ] **Step 4 : commit.**

```bash
git add src/components/MicButton.svelte src/components/Composer.svelte src/components/Composer.voice.test.ts
git commit -m "feat(composer): bouton micro, texte dicté inséré au curseur, Échap annule la dictée [ESC-96]"
```

---

### Task 7 : vue Claude Code et raccourci `Ctrl+Shift+M`

**Files :**
- Modify : `src/components/Conversation.svelte` (en-tête), `src/components/AgentTerminal.svelte` (indicateur), `src/lib/state.svelte.ts` (`agentOnScreen`), `src/lib/shortcuts.ts`, `src/lib/shortcuts.test.ts`
- Test : `src/lib/shortcuts.test.ts`, `src/components/Conversation.test.ts`, `src/components/AgentTerminal.test.ts`

**Interfaces :**
- Consumes : `voice`, `MicButton` (tâches 5, 6).
- Produces : `app.agentOnScreen: boolean` (getter) ; `Ctrl+Shift+M` dans `handleShortcut` et `isAppShortcut`.

- [ ] **Step 1 : tests du raccourci (échouent).** Dans `src/lib/shortcuts.test.ts`, `describe('handleShortcut')`, ajouter (importer `voice` de `./voice.svelte`) :

```ts
  it('starts and stops a dictation for the agent shown with Ctrl+Shift+M', async () => {
    voice.reset();
    const backend = fakeBackend({ voice_models: () => [{ id: 'small-q5_1', bytes: 1, installed: true }], voice_stop: () => '' });
    app.selectAgent('a1');
    expect(handleShortcut(key('M', { shiftKey: true }))).toBe(true);
    await vi.waitFor(() => expect(voice.phase).toBe('recording'));
    expect(voice.target).toEqual({ kind: 'composer', agentId: 'a1' });
    expect(handleShortcut(key('M', { shiftKey: true }))).toBe(true);
    await vi.waitFor(() => expect(backend.called('voice_stop')).toHaveLength(1));
  });

  it('dictates into the terminal of an agent in the Claude Code view', async () => {
    voice.reset();
    fakeBackend({ voice_models: () => [{ id: 'small-q5_1', bytes: 1, installed: true }] });
    app.agents.a1 = { ...app.agents.a1, terminal: true };
    app.selectAgent('a1');
    handleShortcut(key('M', { shiftKey: true }));
    await vi.waitFor(() => expect(voice.target).toEqual({ kind: 'terminal', agentId: 'a1' }));
  });

  it('Ctrl+Shift+M does nothing with no agent on screen', () => {
    voice.reset();
    const backend = fakeBackend();
    app.ui = { ...app.ui, view: 'overview' };
    expect(handleShortcut(key('M', { shiftKey: true }))).toBe(false);
    expect(backend.called('voice_models')).toHaveLength(0);
  });
```

Et dans le `describe` de `isAppShortcut` :

```ts
  it('hands Ctrl+Shift+M (Cmd+Shift+M) over to the app, not plain Ctrl+M', () => {
    expect(isAppShortcut(key('M', { shiftKey: true }), false)).toBe(true);
    expect(isAppShortcut(new KeyboardEvent('keydown', { key: 'M', metaKey: true, shiftKey: true }), true)).toBe(true);
    expect(isAppShortcut(key('m'), false)).toBe(false);
  });
```

(`app.ui.view` vaut `'project'`, `'overview'` ou `'stats'`.) Run : `rtk proxy npx vitest run src/lib/shortcuts.test.ts` — Expected : les nouveaux tests échouent.

- [ ] **Step 2 : « un agent à l'écran ».** Dans `src/lib/state.svelte.ts`, ajouter près de `boardOn` :

```ts
  /** An agent's conversation (or its Claude Code view) is what the window shows. */
  get agentOnScreen(): boolean {
    return this.ui.view === 'project' && !!this.agent && !this.term && !this.runCommand && !this.editorOn && !this.boardOn;
  }
```

et réécrire `onScreen` avec : `const shown = this.agentOnScreen && this.agent?.id === id;` (même comportement).

- [ ] **Step 3 : le raccourci.** Dans `src/lib/shortcuts.ts`, importer `voice` de `./voice.svelte`. Dans `handleShortcut`, après le bloc `if (k === 'l' && e.shiftKey) { … }` :

```ts
  // The dictation: stops the one under way wherever it is for, else starts one for the agent on screen.
  if (k === 'm' && e.shiftKey) {
    if (voice.phase === 'recording') {
      void voice.stop();
      return true;
    }
    const a = app.agent;
    if (!a || !app.agentOnScreen) return false;
    void voice.toggle({ kind: a.terminal ? 'terminal' : 'composer', agentId: a.id });
    return true;
  }
```

Dans `isAppShortcut`, juste après `const k = e.key.toLowerCase();` :

```ts
  // The dictation: also from Claude Code's view, where the terminal has the keyboard.
  if (k === 'm' && e.shiftKey) return true;
```

Mettre à jour le commentaire de `isAppShortcut` (« Ctrl+Shift+M : la dictée »). Run : `rtk proxy npx vitest run src/lib/shortcuts.test.ts src/lib/state.test.ts` — Expected : PASS.

- [ ] **Step 4 : tests de la vue Claude Code (échouent).** Dans `src/components/Conversation.test.ts`, importer `voice` (`import { voice } from '../lib/voice.svelte';`) et ajouter, dans le `describe` qui contient « shows the interface in place of the messages and the composer » (ligne ~1649) :

```ts
  it('offers the dictation in the header of the Claude Code view, into the terminal', async () => {
    setLang('fr');
    voice.reset();
    const a = agent({ id: 'vt9', status: 'done', terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    const b = fakeBackend({ get_conversation: () => [], voice_models: () => [{ id: 'small-q5_1', bytes: 1, installed: true }] });
    render(Conversation, { agent: a, project: project() });
    await userEvent.click(screen.getByRole('button', { name: /^Dicter/ }));
    await waitFor(() => expect(b.called('voice_start')).toHaveLength(1));
    expect(voice.target).toEqual({ kind: 'terminal', agentId: 'vt9' });
    await voice.cancel();
  });

  it('in the Escouade view, the dictation is the composer’s alone', () => {
    setLang('fr');
    voice.reset();
    const a = agent({ id: 'vt10', status: 'done' });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend({ get_conversation: () => [] });
    render(Conversation, { agent: a, project: project() });
    expect(screen.getAllByRole('button', { name: /^Dicter/ })).toHaveLength(1);
  });
```

Dans `src/components/AgentTerminal.test.ts` (qui simule déjà `../lib/terminals`), importer `voice` et ajouter dans son `describe` :

```ts
  it('shows over the terminal that it listens, then that it transcribes', async () => {
    const a = agent({ terminal: true });
    resetApp({ projects: [project()], agents: [a] });
    fakeBackend();
    voice.reset();
    render(AgentTerminal, { agent: a });
    expect(screen.queryByText(/Dictée en cours/)).toBeNull();
    voice.target = { kind: 'terminal', agentId: a.id };
    voice.phase = 'recording';
    expect(await screen.findByText(/Dictée en cours/)).toBeInTheDocument();
    voice.phase = 'transcribing';
    expect(await screen.findByText('Transcription…')).toBeInTheDocument();
    // Another agent's dictation is not shown here.
    voice.target = { kind: 'terminal', agentId: 'other' };
    await waitFor(() => expect(screen.queryByText('Transcription…')).toBeNull());
    voice.reset();
  });
```

Run : `rtk proxy npx vitest run src/components/Conversation.test.ts src/components/AgentTerminal.test.ts` — Expected : les trois nouveaux tests échouent.

- [ ] **Step 5 : en-tête et indicateur.** Dans `src/components/Conversation.svelte`, importer `MicButton` et, juste avant `{#if canSwitchView(agent)}` (ligne ~510) :

```svelte
    {#if agent.terminal}
      <MicButton target={{ kind: 'terminal', agentId: agent.id }} />
    {/if}
```

Dans `src/components/AgentTerminal.svelte`, importer `voice` et `keyLabel` (`../lib/platform`) ; dans le balisage, à l'intérieur du conteneur du terminal (frère de `bind:this={box}`, conteneur en `position: relative`) :

```svelte
  {#if voice.isFor({ kind: 'terminal', agentId: agent.id })}
    <div class="voice" role="status">
      <span class="dot" aria-hidden="true"></span>
      {voice.phase === 'transcribing'
        ? t('voice.overlay.transcribing')
        : t('voice.overlay.listening', { key: keyLabel('Ctrl+Shift+M') })}
    </div>
  {/if}
```

```css
  .voice {
    position: absolute;
    right: 12px;
    bottom: 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 6px;
    background: var(--elev2);
    border: 1px solid var(--line);
    font-size: 12px;
    pointer-events: none;
  }
  .voice .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--del);
  }
```
 Run : `rtk proxy npx vitest run src/components/AgentTerminal.test.ts src/components/Conversation.test.ts && rtk proxy npm run check` — Expected : PASS.

- [ ] **Step 6 : commit.**

```bash
git add src/lib/state.svelte.ts src/lib/shortcuts.ts src/lib/shortcuts.test.ts src/components/Conversation.svelte src/components/Conversation.test.ts src/components/AgentTerminal.svelte src/components/AgentTerminal.test.ts
git commit -m "feat(voice): dictée en vue Claude Code et raccourci Ctrl+Shift+M [ESC-96]"
```

---

### Task 8 : la fenêtre du premier usage

**Files :**
- Create : `src/components/modals/VoiceSetupModal.svelte`, `src/components/modals/VoiceSetupModal.test.ts`
- Modify : `src/App.svelte`

**Interfaces :**
- Consumes : `voice`, `VOICE_MODELS`, `RECOMMENDED_MODEL`, `VoiceTarget`, `api.voiceModels`, `api.saveSettings`, `Modal` `voiceSetup` (tâche 5).
- Produces : la fenêtre ouverte par `app.modal = { kind: 'voiceSetup', target }`.

- [ ] **Step 1 : tests (échouent).** Créer `src/components/modals/VoiceSetupModal.test.ts` :

```ts
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../lib/state.svelte';
import { voice } from '../../lib/voice.svelte';
import { agent, fakeBackend, resetApp } from '../../test/ipc';
import VoiceSetupModal from './VoiceSetupModal.svelte';

const target = { kind: 'composer' as const, agentId: 'a1' };
const models = (installed: string[] = []) =>
  ['tiny', 'base', 'small-q5_1', 'large-v3-turbo-q5_0'].map((id, i) => ({ id, bytes: (i + 1) * 100_000_000, installed: installed.includes(id) }));

describe('VoiceSetupModal', () => {
  beforeEach(() => {
    resetApp({ agents: [agent()] });
    voice.reset();
    app.modal = { kind: 'voiceSetup', target };
  });

  it('offers the four models, the setting’s preselected, Small marked recommended', async () => {
    fakeBackend({ voice_models: () => models() });
    render(VoiceSetupModal, { target });
    const radios = await screen.findAllByRole('radio');
    expect(radios).toHaveLength(4);
    expect(screen.getByRole('radio', { name: /Small/ })).toBeChecked();
    expect(screen.getByText(/recommandé/)).toBeInTheDocument();
  });

  it('saves the choice, downloads it, then listens', async () => {
    let downloaded = false;
    const b = fakeBackend({
      voice_models: () => models(downloaded ? ['base'] : []),
      voice_download: () => {
        downloaded = true;
      },
      save_settings: () => [],
    });
    render(VoiceSetupModal, { target });
    await userEvent.click(await screen.findByRole('radio', { name: /Base/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger et dicter' }));
    await waitFor(() => expect(b.called('voice_start')).toHaveLength(1));
    expect(b.called('save_settings')[0].args.settings.voiceModel).toBe('base');
    expect(b.called('voice_download')[0].args.model).toBe('base');
    expect(app.modal).toBeNull();
  });

  it('an installed model starts listening without downloading', async () => {
    const b = fakeBackend({ voice_models: () => models(['tiny']), save_settings: () => [] });
    render(VoiceSetupModal, { target });
    await userEvent.click(await screen.findByRole('radio', { name: /Tiny/ }));
    expect(screen.getByRole('button', { name: 'Dicter' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dicter' }));
    await waitFor(() => expect(b.called('voice_start')).toHaveLength(1));
    expect(b.called('voice_download')).toHaveLength(0);
  });

  it('greys the list while downloading and offers to retry after an error', async () => {
    let fail!: (e: string) => void;
    fakeBackend({
      voice_models: () => models(),
      save_settings: () => [],
      voice_download: () => new Promise((_, reject) => (fail = reject)),
    });
    render(VoiceSetupModal, { target });
    await userEvent.click(await screen.findByRole('button', { name: 'Télécharger et dicter' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tiny/ })).toBeDisabled());
    fail('réseau coupé');
    expect(await screen.findByText('réseau coupé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tiny/ })).toBeEnabled();
  });
});
```

Run : `rtk proxy npx vitest run src/components/modals/VoiceSetupModal.test.ts` — Expected : FAIL.

- [ ] **Step 2 : la fenêtre.** Créer `src/components/modals/VoiceSetupModal.svelte` (voir `TelemetryModal.svelte` pour `Modal`, son `footer` et ses boutons ; tailles avec le formateur du dépôt : `rtk proxy grep -n "export function sizeLabel" src/lib/attachments.ts` — le réutiliser) :

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { sizeLabel } from '../../lib/attachments';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { VoiceModelState } from '../../lib/types';
  import { RECOMMENDED_MODEL, voice, type VoiceModelId, type VoiceTarget } from '../../lib/voice.svelte';
  import Modal from './Modal.svelte';

  // The dictation's first use, or its model missing: the models offered, the setting's preselected. The choice is saved
  // before downloading; once there, listening starts for `target`.
  let { target }: { target: VoiceTarget } = $props();

  let models = $state<VoiceModelState[]>([]);
  let chosen = $state(app.settings.voiceModel);
  let error = $state<string | null>(null);
  const progress = $derived(voice.downloads[chosen]);
  const installed = $derived(models.find((m) => m.id === chosen)?.installed ?? false);

  onMount(async () => {
    try {
      models = await api.voiceModels();
    } catch (e) {
      error = String(e);
    }
  });

  async function go() {
    error = null;
    try {
      if (chosen !== app.settings.voiceModel) {
        app.settings.voiceModel = chosen;
        await api.saveSettings($state.snapshot(app.settings));
      }
      if (!installed && !(await voice.download(chosen))) return;
      app.modal = null;
      await voice.start(target);
    } catch (e) {
      error = String(e);
    }
  }

  function close() {
    if (progress) void voice.cancelDownload(chosen);
    app.modal = null;
  }
</script>

<Modal title={t('voice.setup.title')} width={520} onclose={close}>
  <p class="p">{t('voice.setup.body')}</p>
  <div class="models" role="radiogroup" aria-label={t('voice.settings.model')}>
    {#each models as m (m.id)}
      <label class="model">
        <input type="radio" name="voice-model" value={m.id} bind:group={chosen} disabled={!!progress} />
        <span class="name">{t(`voice.model.${m.id as VoiceModelId}.name`)}</span>
        <span class="size">{sizeLabel(m.bytes)}</span>
        <span class="desc">— {t(`voice.model.${m.id as VoiceModelId}.desc`)}</span>
        {#if m.id === RECOMMENDED_MODEL}<span class="tag">{t('voice.model.recommended')}</span>{/if}
        {#if m.installed}<span class="tag ok">{t('voice.model.installed')}</span>{/if}
      </label>
    {/each}
  </div>
  {#if progress}
    <progress max={progress.total || 1} value={progress.received}></progress>
    <p class="hint">{t('voice.setup.progress', { received: sizeLabel(progress.received), total: sizeLabel(progress.total) })}</p>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="hint">{t('voice.setup.later')}</p>
  {#snippet footer()}
    <button class="btn" onclick={close}>{t('common.cancel')}</button>
    <button class="btn primary" disabled={!!progress || !models.length} onclick={go}>
      {error ? t('voice.setup.retry') : installed ? t('voice.setup.dictate') : t('voice.setup.download')}
    </button>
  {/snippet}
</Modal>

<style>
  .p,
  .hint {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }
  .hint {
    font-size: 12px;
  }
  .models {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .model {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
  }
  .size,
  .desc {
    color: var(--muted);
  }
  .tag {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--elev);
  }
  .error {
    margin: 0;
    color: var(--del);
  }
  progress {
    width: 100%;
  }
</style>
```

`common.cancel` existe (« Annuler »). Les clés calculées sont typées par le gabarit, comme dans `BoardTab.svelte` (`t(\`boardSettings.tab.actions.${id}.label\`)`) : d'où le `as VoiceModelId` sur l'id que rend le backend. Le libellé du bouton dépend de l'erreur pour « Réessayer », sinon du modèle choisi (installé : « Dicter »).

- [ ] **Step 3 : l'ouvrir.** Dans `src/App.svelte`, importer `VoiceSetupModal` et, dans la chaîne des modales (près de `{:else if app.modal?.kind === 'telemetry'}`) :

```svelte
{:else if app.modal?.kind === 'voiceSetup'}
  <VoiceSetupModal target={app.modal.target} />
```

Run : `rtk proxy npx vitest run src/components/modals/VoiceSetupModal.test.ts && rtk proxy npm run check` — Expected : PASS, 0 erreur.

- [ ] **Step 4 : commit.**

```bash
git add src/components/modals/VoiceSetupModal.svelte src/components/modals/VoiceSetupModal.test.ts src/App.svelte
git commit -m "feat(voice): choix du modèle et téléchargement à la première dictée [ESC-96]"
```

---

### Task 9 : le groupe « Dictée » des réglages

**Files :**
- Create : `src/components/settings/VoiceSettings.svelte`, `src/components/settings/VoiceSettings.test.ts`
- Modify : `src/components/settings/ApplicationTab.svelte`, `src/lib/settings.svelte.ts` (`SETTINGS_OF`)

**Interfaces :**
- Consumes : `voice`, `VOICE_MODELS`, `VOICE_LANGUAGES`, `RECOMMENDED_MODEL` (tâche 5), `settingsForm` (brouillon des réglages), `Group`, `Row`.
- Produces : rien pour les tâches suivantes.

- [ ] **Step 1 : tests (échouent).** Créer `src/components/settings/VoiceSettings.test.ts` (même mise en place que `ApplicationTab.test.ts` : la fenêtre des réglages sur l'onglet Application) :

```ts
import { render, screen, waitFor, within } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { setLang } from '../../lib/i18n';
import { settingsForm } from '../../lib/settings.svelte';
import { app } from '../../lib/state.svelte';
import { voice } from '../../lib/voice.svelte';
import { fakeBackend, resetApp } from '../../test/ipc';
import SettingsModal from '../modals/SettingsModal.svelte';

const MODELS = [
  { id: 'tiny', bytes: 77_691_713, installed: true },
  { id: 'base', bytes: 147_951_465, installed: false },
  { id: 'small-q5_1', bytes: 190_085_487, installed: false },
  { id: 'large-v3-turbo-q5_0', bytes: 574_041_195, installed: false },
];
/** The line of a model in the list. */
const row = (name: RegExp) => screen.getByRole('radio', { name }).closest('.model') as HTMLElement;
const tab = (name: string) => screen.getByRole('tab', { name });

describe('the « Dictée » group', () => {
  beforeEach(() => {
    setLang('fr');
    resetApp();
    voice.reset();
    app.modal = { kind: 'settings', tab: 'app' };
  });

  it('lists the models, the chosen one checked, and chooses another with the other settings', async () => {
    const b = fakeBackend({ voice_models: () => MODELS });
    render(SettingsModal, { tab: 'app' });
    expect(await screen.findByRole('radio', { name: /Small/ })).toBeChecked();
    expect(within(screen.getByRole('radiogroup', { name: 'Modèle' })).getAllByRole('radio')).toHaveLength(4);
    expect(within(row(/Tiny/)).getByText('Installé')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('radio', { name: /Base/ }));
    expect(settingsForm.settings.voiceModel).toBe('base');
    // Saved with « Enregistrer », the tab marked until then.
    expect(tab('Application')).toHaveClass('changed');
    expect(b.called('save_settings')).toHaveLength(0);
  });

  it('downloads and deletes a model at once, then lists them again', async () => {
    const b = fakeBackend({ voice_models: () => MODELS, voice_download: () => undefined, voice_delete_model: () => undefined });
    render(SettingsModal, { tab: 'app' });
    await screen.findByRole('radio', { name: /Base/ });
    await userEvent.click(within(row(/Base/)).getByRole('button', { name: 'Télécharger' }));
    await waitFor(() => expect(b.called('voice_download')[0]?.args.model).toBe('base'));
    await userEvent.click(within(row(/Tiny/)).getByRole('button', { name: 'Supprimer' }));
    await waitFor(() => expect(b.called('voice_delete_model')[0]?.args).toEqual({ model: 'tiny' }));
    await waitFor(() => expect(b.called('voice_models')).toHaveLength(3));
  });

  it('chooses the spoken language, the interface’s by default', async () => {
    fakeBackend({ voice_models: () => MODELS });
    render(SettingsModal, { tab: 'app' });
    const select = screen.getByRole('combobox', { name: 'Langue parlée' }) as HTMLSelectElement;
    expect(select.value).toBe('ui');
    expect(select.selectedOptions[0].textContent).toBe('Langue de l’interface');
    await userEvent.selectOptions(select, 'auto');
    expect(settingsForm.settings.voiceLanguage).toBe('auto');
  });
});
```

Run : `rtk proxy npx vitest run src/components/settings/VoiceSettings.test.ts` — Expected : FAIL (pas de groupe « Dictée »).

- [ ] **Step 2 : le groupe.** Créer `src/components/settings/VoiceSettings.svelte` :

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { sizeLabel } from '../../lib/attachments';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { settingsForm } from '../../lib/settings.svelte';
  import { app } from '../../lib/state.svelte';
  import type { VoiceModelState } from '../../lib/types';
  import { RECOMMENDED_MODEL, VOICE_LANGUAGES, voice, type VoiceModelId } from '../../lib/voice.svelte';
  import Group from './Group.svelte';
  import Row from './Row.svelte';

  // « Dictée »: the model chosen goes with the other settings (« Enregistrer »); downloading and deleting a model act at
  // once, as they change the disk, not the settings.
  const s = $derived(settingsForm.settings);
  let models = $state<VoiceModelState[]>([]);

  const refresh = async () => {
    models = await api.voiceModels().catch(() => models);
  };
  onMount(refresh);

  async function download(id: string) {
    try {
      await voice.download(id);
    } catch (e) {
      app.toast(String(e), 'error');
    }
    await refresh();
  }

  async function remove(id: string) {
    await app.run(api.voiceDeleteModel(id));
    await refresh();
  }
</script>

<Group title={t('voice.settings.group')} note={t('voice.settings.note')}>
  <Row label={t('voice.settings.model')} desc={t('voice.settings.modelDesc')} wide>
    <div class="models" role="radiogroup" aria-label={t('voice.settings.model')}>
      {#each models as m (m.id)}
        {@const p = voice.downloads[m.id]}
        <div class="model">
          <label>
            <input type="radio" name="voice-model-setting" value={m.id} bind:group={s.voiceModel} />
            <span class="name">{t(`voice.model.${m.id as VoiceModelId}.name`)}</span>
            <span class="size">{sizeLabel(m.bytes)}</span>
            <span class="desc">— {t(`voice.model.${m.id as VoiceModelId}.desc`)}</span>
            {#if m.id === RECOMMENDED_MODEL}<span class="tag">{t('voice.model.recommended')}</span>{/if}
          </label>
          <span class="spacer"></span>
          {#if p}
            <progress max={p.total || 1} value={p.received}></progress>
            <button class="btn ghost" onclick={() => voice.cancelDownload(m.id)}>{t('voice.settings.cancel')}</button>
          {:else if m.installed}
            <span class="tag ok">{t('voice.model.installed')}</span>
            <button class="btn ghost" onclick={() => remove(m.id)}>{t('voice.settings.delete')}</button>
          {:else}
            <button class="btn ghost" onclick={() => download(m.id)}>{t('voice.settings.download')}</button>
          {/if}
        </div>
      {/each}
    </div>
  </Row>
  <Row label={t('voice.settings.language')} desc={t('voice.settings.languageDesc')}>
    <select class="field select" aria-label={t('voice.settings.language')} bind:value={s.voiceLanguage}>
      {#each VOICE_LANGUAGES as l (l)}
        <option value={l}>{t(`voice.settings.languages.${l}`)}</option>
      {/each}
    </select>
  </Row>
</Group>

<style>
  .models {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .model {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .model label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
  }
  .spacer {
    flex: 1;
  }
  .size,
  .desc {
    color: var(--muted);
  }
  .tag {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--elev);
  }
  progress {
    width: 120px;
  }
</style>
```

`Group` prend `title` et `note` ; `Row` prend `label`, `desc` et `wide` (leurs déclarations, `src/components/settings/Group.svelte` et `Row.svelte`).

- [ ] **Step 3 : le brancher.** Dans `src/components/settings/ApplicationTab.svelte`, importer `VoiceSettings` et l'ajouter après le `</Group>` de la langue : `<VoiceSettings />`. Dans `src/lib/settings.svelte.ts`, `SETTINGS_OF` : `app: ['language', 'claudeLanguage', 'voiceModel', 'voiceLanguage'],`.

Run : `rtk proxy npx vitest run src/components/settings && rtk proxy npm run check` — Expected : PASS, 0 erreur.

- [ ] **Step 4 : commit.**

```bash
git add src/components/settings src/lib/settings.svelte.ts
git commit -m "feat(settings): groupe Dictée, modèle et langue parlée [ESC-96]"
```

---

### Task 10 : documentation, essai réel et vérification complète

**Files :**
- Modify : `CHANGELOG.md`, `docs/SPEC.md`, `docs/TODO-1.8.md`, `README.md`, `src/lib/i18n/GLOSSARY.md`, `website/content/docs/{fr,en}/chat.md`, `…/claude-code-view.md`, `…/shortcuts.md`, `…/settings-application.md`, `…/data.md`

- [ ] **Step 1 : glossaire.** Dans `src/lib/i18n/GLOSSARY.md`, ajouter une section `## Dictée` en bas (règle du fichier : chaque tâche écrit dans sa section) :

```markdown
## Dictée

| Français | Anglais |
|---|---|
| dictée, dicter | dictation, dictate |
| modèle (de reconnaissance de la parole) | (speech) model |
| langue parlée | spoken language |
| transcription, transcrire | transcription, transcribe |
```

- [ ] **Step 2 : CHANGELOG.** Sous `## [Non publié]` › `### Ajouts`, une ligne, au style des autres :

```markdown
- Dictée vocale des prompts (issue #8) : le bouton micro du champ de saisie, ou `Ctrl+Shift+M`, écoute ; un second clic transcrit, et le texte s'insère au curseur sans partir seul. La transcription se fait sur ta machine (Whisper) : à la première dictée, tu choisis le modèle (de 78 Mo à 574 Mo, « Small », 190 Mo, recommandé) et il se télécharge une fois. Marche aussi en vue Claude Code (bouton de l'en-tête, texte collé dans le terminal). Modèle et langue parlée dans Réglages › Application › Dictée.
```

- [ ] **Step 3 : SPEC, TODO, README.** `docs/SPEC.md` : décrire la dictée dans les sections du compositeur, de la vue Claude Code, des réglages Application et des raccourcis (même niveau de détail que les entrées voisines ; reprendre la spec de design). `docs/TODO-1.8.md` : cocher ESC-96 (`- [x]`), avec une sous-ligne « Fait le <date> : … essayé sous macOS (…) ; pas essayé sous Windows ni Linux » et laisser en `- [ ]` les deux points restants (formulaire des tickets, service en ligne). `README.md` : une phrase dans « Chat natif » (« Dictée vocale (bouton micro ou `Ctrl+Shift+M`), transcrite sur ta machine par Whisper »), la ligne `Ctrl+Shift+M` dans le tableau des raccourcis, `voice/` dans « Données locales » (« modèles de la dictée, téléchargés à la demande »).

- [ ] **Step 4 : site, fr et en.** `chat.md` (la dictée dans le champ de saisie), `claude-code-view.md` (le bouton de l'en-tête et le collage dans le terminal), `shortcuts.md` (`Ctrl+Shift+M`), `settings-application.md` (le groupe « Dictée »), `data.md` (`voice/`). Les pages anglaises disent la même chose (vocabulaire du glossaire). Run : `rtk proxy npx prettier --check website/content docs CHANGELOG.md README.md`.

- [ ] **Step 5 : vérification complète.** Depuis la racine :

```bash
export PATH="$HOME/.nvm/versions/node/v22.22.1/bin:$PATH"
rtk proxy npm run check
rtk proxy npx vitest run
rtk proxy npm run format:check
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings && cargo test
```

Expected : 0 erreur de typage, tous les tests Vitest et Rust verts, formatage et clippy propres. Copier dans le message de commit les nombres de tests.

- [ ] **Step 6 : essai réel sous macOS (avec un vrai micro).** Lancer l'app dans un dossier de données neuf : `ESCOUADE_DATA_DIR="${TMPDIR}escouade-voice" rtk proxy npm run tauri dev`. Puis, en notant chaque résultat :
  1. Ouvrir un projet, un agent ; cliquer le micro → la fenêtre du premier usage s'ouvre, « Small » présélectionné et « recommandé ».
  2. « Télécharger et dicter » → barre de progression, puis macOS demande l'accès au micro (pour le terminal qui lance `tauri dev`) ; accepter.
  3. Dire « Ajoute un test qui vérifie la connexion » ; recliquer → le texte apparaît au curseur, rien n'est envoyé.
  4. `Ctrl+Shift+M` (⌘⇧M) deux fois → même chose.
  5. Dictée en anglais avec « Langue parlée » sur « Anglais ».
  6. Pendant une transcription, passer à un autre agent → le texte est dans le brouillon du premier.
  7. Vue Claude Code : bouton de l'en-tête, indicateur sur le terminal, texte collé dans l'invite de Claude Code, pas validé.
  8. `Échap` pendant l'écoute dans le compositeur → rien n'est inséré, Claude n'est pas interrompu.
  9. Silence de 3 s → toast « Rien entendu ».
  10. Réglages Système › Confidentialité › Micro : retirer l'accès du terminal, redicter → toast « Escouade n'a pas accès au micro » avec « Ouvrir les réglages », qui ouvre le bon panneau.
  11. Réglages › Application › Dictée : supprimer le modèle, retélécharger, changer de modèle et « Enregistrer ».
  Noter le temps de transcription d'une phrase de 10 s avec `small-q5_1`.

- [ ] **Step 7 : commit.**

```bash
git add -A
git commit -m "docs: dictée vocale dans le README, la SPEC, le site et le journal des versions [ESC-96]"
```

Le corps du message dit ce qui a été essayé en vrai (étapes 1 à 11, sous macOS, modèle et temps mesuré) et ce qui ne l'a pas été (Windows, Linux).
