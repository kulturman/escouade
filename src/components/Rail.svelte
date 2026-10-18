<script lang="ts">
  import { tip } from '../lib/tip';

  // A folded column: a thin strip along its edge, clicked to unfold it.
  let { label, onclick }: { label: string; onclick: () => void } = $props();
</script>

<button class="rail" aria-label={label} use:tip={label} {onclick}>
  <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><path d="M3.5 2 6.5 5 3.5 8" /></svg>
</button>

<style>
  .rail {
    flex: none;
    width: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-right: 1px solid var(--line);
    background: var(--panel);
    color: var(--dim);
    cursor: pointer;
  }
  .rail:hover {
    color: var(--text);
    background: var(--elev);
  }
  .rail svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>
