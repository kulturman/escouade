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
