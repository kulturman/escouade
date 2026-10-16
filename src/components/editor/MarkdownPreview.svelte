<script lang="ts">
  import { tick } from 'svelte';
  import { t } from '../../lib/i18n';
  import { primaryKey } from '../../lib/platform';
  import Markdown from '../conv/Markdown.svelte';

  // « Aperçu » of a Markdown file in the editor, with its own search (Ctrl+F / Cmd+F): the code
  // editor's is not there to find in the rendered text.
  let { text }: { text: string } = $props();

  let box = $state<HTMLDivElement>();
  let field = $state<HTMLInputElement>();
  let finding = $state(false);
  let query = $state('');
  let matches = $state<Range[]>([]);
  let current = $state(0);

  // The CSS Custom Highlight API marks every match (WebKit since Safari 17.2); without it, only
  // the current one shows, as the selection.
  const highlights = (globalThis as { CSS?: { highlights?: Map<string, unknown> } }).CSS?.highlights;
  const Highlight = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;

  function search() {
    const found: Range[] = [];
    const q = query.toLocaleLowerCase();
    const root = box?.querySelector('.md');
    if (q && root) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const s = (n.nodeValue ?? '').toLocaleLowerCase();
        for (let i = s.indexOf(q); i >= 0; i = s.indexOf(q, i + q.length)) {
          const r = document.createRange();
          r.setStart(n, i);
          r.setEnd(n, i + q.length);
          found.push(r);
        }
      }
    }
    matches = found;
    current = 0;
    show();
  }

  function show() {
    if (highlights && Highlight) {
      highlights.set('md-find', new Highlight(...matches));
      highlights.set('md-find-current', new Highlight(...matches.slice(current, current + 1)));
    }
    const r = matches[current];
    if (!r) return;
    (r.startContainer.parentElement ?? box)?.scrollIntoView({ block: 'center' });
    if (!highlights) {
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
    }
  }

  function step(back: boolean) {
    if (!matches.length) return;
    current = (current + (back ? matches.length - 1 : 1)) % matches.length;
    show();
  }

  function close() {
    finding = false;
    highlights?.delete('md-find');
    highlights?.delete('md-find-current');
    box?.focus();
  }

  async function open() {
    finding = true;
    await tick();
    field?.select();
  }

  function onKeydown(e: KeyboardEvent) {
    if (primaryKey(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      e.stopPropagation();
      void open();
    }
  }

  function onFieldKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      step(e.shiftKey);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  }

  // The text changes (typing in « Texte », a reload): the matches follow.
  $effect(() => {
    void text;
    if (finding) queueMicrotask(search);
  });

  // Opened on the preview: Ctrl+F works at once.
  $effect(() => {
    box?.focus();
  });
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="preview" bind:this={box} tabindex="0" role="document" onkeydown={onKeydown}>
  {#if finding}
    <div class="find" role="search">
      <input
        class="field"
        bind:this={field}
        bind:value={query}
        oninput={search}
        onkeydown={onFieldKeydown}
        placeholder={t('editor.preview.find')}
        aria-label={t('editor.preview.find')}
      />
      <span class="count mono"
        >{query
          ? matches.length
            ? t('editor.preview.count', { current: current + 1, total: matches.length })
            : t('editor.preview.none')
          : ''}</span
      >
      <button class="btn ghost" onclick={close} aria-label={t('editor.preview.close')}>×</button>
    </div>
  {/if}
  <Markdown {text} />
</div>

<style>
  .preview {
    position: relative;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 20px 28px;
    outline: none;
  }
  /* The editor's size (`--editor-font`), the conversation's 14px at its default 12.5px. */
  .preview :global(.md) {
    font-size: calc(var(--editor-font, 12.5px) * 1.12);
  }
  .find {
    position: sticky;
    top: -20px;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    float: right;
    padding: 6px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
  }
  .find .field {
    width: 220px;
  }
  .count {
    min-width: 48px;
    font-size: 11px;
    color: var(--muted);
  }
  :global(::highlight(md-find)) {
    background-color: color-mix(in oklch, var(--accent, #d9a441) 35%, transparent);
  }
  :global(::highlight(md-find-current)) {
    background-color: var(--accent, #d9a441);
    color: var(--bg);
  }
</style>
