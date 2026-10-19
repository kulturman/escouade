import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

  it('takes the dictation’s shortcut from the keys pressed after a click, and saves it with the other settings', async () => {
    const backend = fakeBackend({ voice_models: () => MODELS, save_settings: () => [] });
    render(SettingsModal, { tab: 'app' });
    const button = await screen.findByRole('button', { name: 'Ctrl+Maj+M' });
    await userEvent.click(button);
    expect(button).toHaveTextContent('Presse la combinaison…');
    await fireEvent.keyDown(button, { key: 'D', code: 'KeyD', ctrlKey: true, altKey: true });
    expect(screen.getByRole('button', { name: 'Ctrl+Alt+D' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    expect(backend.called('save_settings')[0].args.settings).toMatchObject({ voiceShortcut: 'Ctrl+Alt+D' });
  });
});
