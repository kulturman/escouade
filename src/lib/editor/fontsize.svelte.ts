// The size of the editor's text (its code and the « Aperçu » of a Markdown file), changed with
// Ctrl+Shift+. / Ctrl+Shift+, as in IntelliJ (Cmd on macOS), Ctrl+= / Ctrl+- and Ctrl+0, or Ctrl+wheel
// over the editor. Kept in the local preferences.

import { readPref, writePref } from '../prefs';

export const DEFAULT_SIZE = 12.5;
export const MIN_SIZE = 9;
export const MAX_SIZE = 28;
const PREF = 'editor.fontSize';

const clamp = (n: number) => Math.min(MAX_SIZE, Math.max(MIN_SIZE, n));

class EditorFont {
  size = $state(DEFAULT_SIZE);

  constructor() {
    const saved = Number(readPref(PREF));
    if (Number.isFinite(saved) && saved > 0) this.size = clamp(saved);
    this.#apply();
  }

  /** One step bigger (`by` 1) or smaller (`by` -1). */
  step(by: 1 | -1) {
    this.set(this.size + by);
  }

  reset() {
    this.set(DEFAULT_SIZE);
  }

  set(n: number) {
    this.size = clamp(n);
    writePref(PREF, String(this.size));
    this.#apply();
  }

  // A variable of the whole page: the editor's theme and the preview read it.
  #apply() {
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--editor-font', `${this.size}px`);
  }
}

export const editorFont = new EditorFont();

/** The editor's shortcuts for the size of its text, from a key pressed with Ctrl (Cmd on macOS). */
export function fontSizeKey(e: KeyboardEvent): (() => void) | null {
  if (e.altKey) return null;
  if (e.shiftKey && e.code === 'Period') return () => editorFont.step(1);
  if (e.shiftKey && e.code === 'Comma') return () => editorFont.step(-1);
  if (e.shiftKey) return null;
  if (e.key === '=' || e.key === '+') return () => editorFont.step(1);
  if (e.key === '-') return () => editorFont.step(-1);
  if (e.key === '0' || e.code === 'Digit0') return () => editorFont.reset();
  return null;
}
