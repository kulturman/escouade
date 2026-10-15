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
