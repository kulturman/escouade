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

/// What the system says of the app and the microphone (macOS asks; the others never refuse).
#[cfg(any(target_os = "macos", test))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Access {
    Granted,
    Denied,
    /// Never asked: the system asks the user (macOS).
    Ask,
}

/// macOS's `AVAuthorizationStatus`: not determined (0), restricted (1), denied (2), authorized (3).
#[cfg(any(target_os = "macos", test))]
pub fn access_of(status: isize) -> Access {
    match status {
        3 => Access::Granted,
        0 => Access::Ask,
        _ => Access::Denied,
    }
}

/// « Escouade n’a pas accès au micro », as the window shows it too (`voice.muted`).
#[cfg(target_os = "macos")]
pub fn denied() -> anyhow::Error {
    anyhow!(tr!(
        "Escouade n’a pas accès au micro",
        "Escouade can’t access the microphone"
    ))
}

/// The microphone allowed, asked first when the system never asked: until the user answers, cpal
/// would hear nothing but zeros (taken for a denied microphone). Blocks while the system asks.
#[cfg(target_os = "macos")]
fn ensure_access() -> Result<()> {
    use block2::RcBlock;
    use objc2::msg_send;
    use objc2::runtime::{AnyClass, Bool};
    use objc2_foundation::NSString;

    #[link(name = "AVFoundation", kind = "framework")]
    extern "C" {
        static AVMediaTypeAudio: &'static NSString;
    }
    let device =
        AnyClass::get(c"AVCaptureDevice").ok_or_else(|| anyhow!("AVCaptureDevice missing"))?;
    let status: isize =
        unsafe { msg_send![device, authorizationStatusForMediaType: AVMediaTypeAudio] };
    match access_of(status) {
        Access::Granted => Ok(()),
        Access::Denied => Err(denied()),
        Access::Ask => {
            let (tx, rx) = mpsc::channel::<bool>();
            let answer = RcBlock::new(move |granted: Bool| {
                let _ = tx.send(granted.as_bool());
            });
            let _: () = unsafe {
                msg_send![device, requestAccessForMediaType: AVMediaTypeAudio, completionHandler: &*answer]
            };
            if rx.recv().unwrap_or(false) {
                Ok(())
            } else {
                Err(denied())
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn ensure_access() -> Result<()> {
    Ok(())
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
                if let Err(e) = ensure_access() {
                    let _ = ready_tx.send(Err(e));
                    return;
                }
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
    fn asks_for_the_microphone_only_when_the_system_never_did() {
        // AVAuthorizationStatus: not determined, restricted, denied, authorized.
        assert_eq!(access_of(0), Access::Ask);
        assert_eq!(access_of(1), Access::Denied);
        assert_eq!(access_of(2), Access::Denied);
        assert_eq!(access_of(3), Access::Granted);
    }

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
