<script lang="ts">
  import { onMount } from 'svelte';
  import { sizeLabel } from '../../lib/attachments';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { settingsForm } from '../../lib/settings.svelte';
  import { app } from '../../lib/state.svelte';
  import type { VoiceModelState } from '../../lib/types';
  import { RECOMMENDED_MODEL, VOICE_LANGUAGES, modelDesc, modelName, voice } from '../../lib/voice.svelte';
  import { keyLabel } from '../../lib/platform';
  import { comboOf, DEFAULT_VOICE_SHORTCUT } from '../../lib/voice-shortcut';
  import Group from './Group.svelte';
  import Switch from './Switch.svelte';
  import Row from './Row.svelte';

  // « Dictée »: the model chosen goes with the other settings (« Enregistrer »); downloading and deleting a model act at
  // once, as they change the disk, not the settings.
  const s = $derived(settingsForm.settings);
  let models = $state<VoiceModelState[]>([]);

  const refresh = async () => {
    models = await api.voiceModels().catch(() => models);
  };
  onMount(refresh);

  async function download(id: string) {
    try {
      await voice.download(id);
    } catch (e) {
      app.toast(String(e), 'error');
    }
    await refresh();
  }

  // « Raccourci »: a click, then the keys pressed; Escape gives up, a key that cannot be a shortcut waits for another.
  // Read on the whole window, before anything else: WebKit gives no focus to a button clicked.
  let recording = $state(false);
  $effect(() => {
    if (!recording) return;
    window.addEventListener('keydown', onShortcutKey, true);
    return () => window.removeEventListener('keydown', onShortcutKey, true);
  });
  function onShortcutKey(e: KeyboardEvent) {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') {
      recording = false;
      return;
    }
    const combo = comboOf(e);
    if (!combo) return;
    s.voiceShortcut = combo;
    recording = false;
  }

  async function remove(id: string) {
    await app.run(api.voiceDeleteModel(id));
    await refresh();
  }
</script>

<Group title={t('voice.settings.group')} note={t('voice.settings.note')}>
  <Row label={t('voice.settings.model')} desc={t('voice.settings.modelDesc')} wide>
    <div class="models" role="radiogroup" aria-label={t('voice.settings.model')}>
      {#each models as m (m.id)}
        {@const p = voice.downloads[m.id]}
        <div class="model">
          <label>
            <input type="radio" name="voice-model-setting" value={m.id} bind:group={s.voiceModel} />
            <span class="name">{modelName(m.id)}</span>
            <span class="size">{sizeLabel(m.bytes)}</span>
            <span class="desc">— {modelDesc(m.id)}</span>
            {#if m.id === RECOMMENDED_MODEL}<span class="tag">{t('voice.model.recommended')}</span>{/if}
          </label>
          <span class="spacer"></span>
          {#if p}
            <progress max={p.total || 1} value={p.received}></progress>
            <button class="btn ghost" onclick={() => voice.cancelDownload(m.id)}>{t('voice.settings.cancel')}</button>
          {:else if m.installed}
            <span class="tag ok">{t('voice.model.installed')}</span>
            <button class="btn ghost" onclick={() => remove(m.id)}>{t('voice.settings.delete')}</button>
          {:else}
            <button class="btn ghost" onclick={() => download(m.id)}>{t('voice.settings.download')}</button>
          {/if}
        </div>
      {/each}
    </div>
  </Row>
  <Row label={t('voice.settings.shortcut')} desc={t('voice.settings.shortcutDesc')}>
    <button class="btn" aria-pressed={recording} onclick={() => (recording = !recording)}
      >{recording ? t('voice.settings.shortcutRecording') : keyLabel(s.voiceShortcut || DEFAULT_VOICE_SHORTCUT)}</button
    >
    {#if (s.voiceShortcut || DEFAULT_VOICE_SHORTCUT) !== DEFAULT_VOICE_SHORTCUT}
      <button class="btn ghost" onclick={() => (s.voiceShortcut = DEFAULT_VOICE_SHORTCUT)}>{t('voice.settings.shortcutDefault')}</button>
    {/if}
  </Row>
  <Row label={t('voice.settings.holdAlt')} desc={t('voice.settings.holdAltDesc')}>
    <Switch label={t('voice.settings.holdAlt')} bind:on={s.voiceHoldAlt} />
  </Row>
  <Row label={t('voice.settings.language')} desc={t('voice.settings.languageDesc')}>
    <select class="field select" aria-label={t('voice.settings.language')} bind:value={s.voiceLanguage}>
      {#each VOICE_LANGUAGES as l (l)}
        <option value={l}>{t(`voice.settings.languages.${l}`)}</option>
      {/each}
    </select>
  </Row>
</Group>

<style>
  .models {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .model {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .model label {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
  }
  .spacer {
    flex: 1;
  }
  .size,
  .desc {
    color: var(--muted);
  }
  .tag {
    font-size: 11px;
    padding: 0 6px;
    border-radius: 4px;
    background: var(--elev);
  }
  progress {
    width: 120px;
  }
</style>
