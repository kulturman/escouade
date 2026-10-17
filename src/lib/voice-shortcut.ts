// The dictation's shortcut, chosen in Réglages › Application › Dictée: written as the app writes its shortcuts
// (`Ctrl+Shift+M`, Ctrl being Cmd on macOS; `keyLabel` shows it). Its letter is the one the key types in the user's
// layout (on AZERTY, M is where QWERTY has `;`, its `code` is `Semicolon`); the key's place (`KeyboardEvent.code`)
// only when Alt turns the letter into another character (`⌥M` types `µ` on macOS).

import { primaryKey } from './platform';

export const DEFAULT_VOICE_SHORTCUT = 'Ctrl+Shift+M';

/** The key of `code` as a shortcut names it: a letter, a digit, Space, F1…F12; null for the others. */
function keyOf(code: string): string | null {
  const m = /^Key([A-Z])$/.exec(code) ?? /^Digit([0-9])$/.exec(code) ?? /^(F[1-9]|F1[0-2]|Space)$/.exec(code);
  return m ? m[1] : null;
}

/**
 * The shortcut a key pressed makes (`Ctrl+Shift+Alt+D`), or null when it cannot be one: a modifier alone, a key the
 * dictation cannot take, or neither Ctrl (Cmd) nor Alt held (a letter alone is typed, not a shortcut).
 */
export function comboOf(e: KeyboardEvent, mac?: boolean): string | null {
  const key = /^[a-z]$/i.test(e.key) ? e.key.toUpperCase() : (keyOf(e.code) ?? (e.key === ' ' ? 'Space' : null));
  const ctrl = primaryKey(e, mac);
  if (!key || (!ctrl && !e.altKey)) return null;
  return [ctrl && 'Ctrl', e.shiftKey && 'Shift', e.altKey && 'Alt', key].filter(Boolean).join('+');
}

/** Whether `e` is the dictation's shortcut `combo`. */
export function isVoiceShortcut(e: KeyboardEvent, combo: string | undefined, mac?: boolean): boolean {
  return comboOf(e, mac) === (combo || DEFAULT_VOICE_SHORTCUT);
}
