<script lang="ts">
  import { t } from '../lib/i18n';
  import { keyLabel } from '../lib/platform';
  import { tip } from '../lib/tip';
  import { voice, type VoiceTarget } from '../lib/voice.svelte';

  // The dictation's button: starts listening for `target`, or stops the dictation under way (one microphone).
  let { target }: { target: VoiceTarget } = $props();

  const mine = $derived(voice.isFor(target));
  const recording = $derived(voice.phase === 'recording');
  const working = $derived(mine && (voice.phase === 'starting' || voice.phase === 'transcribing'));
  const key = keyLabel('Ctrl+Shift+M');
  const label = $derived(
    recording ? t('voice.button.stop', { key }) : working ? t('voice.button.transcribing') : t('voice.button.start', { key }),
  );
</script>

<button
  class="icon-btn mic"
  class:rec={mine && recording}
  use:tip={label}
  aria-label={label}
  aria-pressed={mine && recording}
  disabled={voice.phase === 'starting' || voice.phase === 'transcribing'}
  onclick={() => voice.toggle(target)}
>
  {#if working}
    <span class="spin" aria-hidden="true"></span>
  {:else}
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3" /><path d="M5 10a7 7 0 0 0 14 0M12 17v5M8 22h8" /></svg
    >
  {/if}
  {#if mine && recording}
    <span class="gauge" aria-hidden="true"><span style:width={`${Math.round(voice.level * 100)}%`}></span></span>
  {/if}
</button>

<style>
  .mic {
    position: relative;
  }
  .mic.rec {
    color: var(--del);
  }
  .gauge {
    position: absolute;
    left: 3px;
    right: 3px;
    bottom: 1px;
    height: 2px;
    border-radius: 1px;
    background: color-mix(in srgb, currentColor 20%, transparent);
    overflow: hidden;
  }
  .gauge > span {
    display: block;
    height: 100%;
    background: currentColor;
    transition: width 50ms linear;
  }
  .spin {
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-right-color: transparent;
    border-radius: 50%;
    animation: ccSpin 0.8s linear infinite;
  }
</style>
