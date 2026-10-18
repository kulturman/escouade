<script lang="ts">
  import { tip } from '../lib/tip';

  // « ‹ » at the top of a column that folds away.
  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button class="fold" aria-label={label} use:tip={label} {onclick}>
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M6.5 2 3.5 5 6.5 8" /></svg>
</button>

<style>
  .fold {
    flex: none;
    width: 24px;
    height: 24px;
    margin-left: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: var(--r-sm);
    background: none;
    color: var(--dim);
    cursor: pointer;
  }
  .fold:hover {
    color: var(--text);
    background: var(--elev);
  }
  .fold svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
