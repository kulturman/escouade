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
