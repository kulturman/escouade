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
