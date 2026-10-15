import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../lib/state.svelte';
import { voice } from '../../lib/voice.svelte';
import { agent, fakeBackend, resetApp } from '../../test/ipc';
import VoiceSetupModal from './VoiceSetupModal.svelte';

const target = { kind: 'composer' as const, agentId: 'a1' };
const models = (installed: string[] = []) =>
  ['tiny', 'base', 'small-q5_1', 'large-v3-turbo-q5_0'].map((id, i) => ({
    id,
    bytes: (i + 1) * 100_000_000,
    installed: installed.includes(id),
  }));

describe('VoiceSetupModal', () => {
  beforeEach(() => {
    resetApp({ agents: [agent()] });
    voice.reset();
    app.modal = { kind: 'voiceSetup', target };
  });

  it('offers the four models, the setting’s preselected, Small marked recommended', async () => {
    fakeBackend({ voice_models: () => models() });
    render(VoiceSetupModal, { props: { target } });
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
    render(VoiceSetupModal, { props: { target } });
    await userEvent.click(await screen.findByRole('radio', { name: /Base/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Télécharger et dicter' }));
    await waitFor(() => expect(b.called('voice_start')).toHaveLength(1));
    expect(b.called('save_settings')[0].args.settings.voiceModel).toBe('base');
    expect(b.called('voice_download')[0].args.model).toBe('base');
    expect(app.modal).toBeNull();
  });

  it('an installed model starts listening without downloading', async () => {
    const b = fakeBackend({ voice_models: () => models(['tiny']), save_settings: () => [] });
    render(VoiceSetupModal, { props: { target } });
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
    render(VoiceSetupModal, { props: { target } });
    await userEvent.click(await screen.findByRole('button', { name: 'Télécharger et dicter' }));
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tiny/ })).toBeDisabled());
    fail('réseau coupé');
    expect(await screen.findByText('réseau coupé')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Réessayer' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Tiny/ })).toBeEnabled();
  });
});
