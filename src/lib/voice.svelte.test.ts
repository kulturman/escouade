import { beforeEach, describe, expect, it, vi } from 'vitest';

// xterm.js has no place in jsdom: the terminal an agent's text is pasted into is a fake.
vi.mock('./terminals', () => ({ getXTerm: vi.fn() }));

import { getDraft, setDraft } from './drafts';
import { app } from './state.svelte';
import { getXTerm } from './terminals';
import type { VoiceEvent } from './types';
import { modelDesc, modelName, voice } from './voice.svelte';
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
    vi.mocked(getXTerm).mockReturnValue({ term: { paste, focus } } as any);
    await voice.start({ kind: 'terminal', agentId: 'a1' });
    await voice.stop();
    expect(getXTerm).toHaveBeenCalledWith('t1');
    expect(paste).toHaveBeenCalledWith('texte dicté');
  });

  it('copies the text when the terminal is gone', async () => {
    backend();
    vi.mocked(getXTerm).mockReturnValue(undefined);
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

  it('names each model in the interface’s language', () => {
    expect(modelName('small-q5_1')).toBe('Small');
    expect(modelDesc('large-v3-turbo-q5_0')).toBe('le plus juste, pour une machine puissante');
    expect(modelName('unknown')).toBe('unknown');
  });
});
