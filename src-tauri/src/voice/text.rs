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
