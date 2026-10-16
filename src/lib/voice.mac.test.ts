import { beforeEach, describe, expect, it, vi } from 'vitest';

// macOS: the app asks the system for the microphone, and points to its privacy settings when refused.
vi.mock('./platform', async (orig) => ({ ...(await orig<typeof import('./platform')>()), IS_MAC: true }));

import { app } from './state.svelte';
import { voice } from './voice.svelte';
import { agent, fakeBackend, resetApp } from '../test/ipc';

describe('voice on macOS', () => {
  beforeEach(() => {
    resetApp({ agents: [agent()] });
    voice.reset();
  });

  it('a microphone the system refuses offers to open its settings', async () => {
    const b = fakeBackend({
      voice_models: () => [{ id: 'small-q5_1', bytes: 1, installed: true }],
      voice_start: () => Promise.reject('Escouade n’a pas accès au micro'),
    });
    const toast = vi.spyOn(app, 'toast');
    await voice.start({ kind: 'composer', agentId: 'a1' });
    expect(voice.phase).toBe('idle');
    const [text, kind, action] = toast.mock.calls[0];
    expect([text, kind]).toEqual(['Escouade n’a pas accès au micro', 'error']);
    expect(action?.label).toBe('Ouvrir les réglages');
    action!.onClick();
    expect(b.called('voice_open_privacy')).toHaveLength(1);
  });
});
