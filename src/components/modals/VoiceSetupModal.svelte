<script lang="ts">
  import { onMount } from 'svelte';
  import { sizeLabel } from '../../lib/attachments';
  import { t } from '../../lib/i18n';
  import { api } from '../../lib/ipc';
  import { app } from '../../lib/state.svelte';
  import type { VoiceModelState } from '../../lib/types';
  import { RECOMMENDED_MODEL, modelDesc, modelName, voice, type VoiceTarget } from '../../lib/voice.svelte';
  import Modal from './Modal.svelte';

  // The dictation's first use, or its model missing: the models offered, the setting's preselected. The choice is saved
  // before downloading; once there, listening starts for `target`.
  let { target }: { target: VoiceTarget } = $props();

  let models = $state<VoiceModelState[]>([]);
  let chosen = $state(app.settings.voiceModel);
  let error = $state<string | null>(null);
  const progress = $derived(voice.downloads[chosen]);
  const installed = $derived(models.find((m) => m.id === chosen)?.installed ?? false);

  onMount(async () => {
    try {
      models = await api.voiceModels();
    } catch (e) {
      error = String(e);
    }
  });

  async function go() {
    error = null;
    try {
      if (chosen !== app.settings.voiceModel) {
        app.settings.voiceModel = chosen;
        await api.saveSettings($state.snapshot(app.settings));
      }
      if (!installed && !(await voice.download(chosen))) return;
      app.modal = null;
      await voice.start(target);
    } catch (e) {
      error = String(e);
    }
  }

  function close() {
    if (progress) void voice.cancelDownload(chosen);
    app.modal = null;
  }
</script>

<Modal title={t('voice.setup.title')} width={520} onclose={close}>
  <p class="p">{t('voice.setup.body')}</p>
  <div class="models" role="radiogroup" aria-label={t('voice.settings.model')}>
    {#each models as m (m.id)}
      <label class="model">
        <input type="radio" name="voice-model" value={m.id} bind:group={chosen} disabled={!!progress} />
        <span class="name">{modelName(m.id)}</span>
        <span class="size">{sizeLabel(m.bytes)}</span>
        <span class="desc">— {modelDesc(m.id)}</span>
        {#if m.id === RECOMMENDED_MODEL}<span class="tag">{t('voice.model.recommended')}</span>{/if}
        {#if m.installed}<span class="tag ok">{t('voice.model.installed')}</span>{/if}
      </label>
    {/each}
  </div>
  {#if progress}
    <progress max={progress.total || 1} value={progress.received}></progress>
    <p class="hint">{t('voice.setup.progress', { received: sizeLabel(progress.received), total: sizeLabel(progress.total) })}</p>
  {/if}
  {#if error}<p class="error" role="alert">{error}</p>{/if}
  <p class="hint">{t('voice.setup.later')}</p>
  {#snippet footer()}
    <button class="btn" onclick={close}>{t('common.cancel')}</button>
    <button class="btn primary" disabled={!!progress || !models.length} onclick={go}>
      {error ? t('voice.setup.retry') : installed ? t('voice.setup.dictate') : t('voice.setup.download')}
    </button>
  {/snippet}
</Modal>

<style>
  .p,
  .hint {
    margin: 0;
    color: var(--muted);
    line-height: 1.55;
  }
  .hint {
    font-size: 12px;
  }
  .models {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .model {
    display: flex;
    align-items: baseline;
    gap: 6px;
    cursor: pointer;
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
  .error {
    margin: 0;
    color: var(--del);
  }
  progress {
    width: 100%;
  }
</style>
