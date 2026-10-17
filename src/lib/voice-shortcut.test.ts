import { describe, expect, it } from 'vitest';
import { comboOf, isVoiceShortcut } from './voice-shortcut';

const press = (init: KeyboardEventInit) => new KeyboardEvent('keydown', init);

describe('the dictation’s shortcut', () => {
  it('is read from the key’s place: Cmd on macOS, Ctrl elsewhere, whatever the layout or Alt makes of the letter', () => {
    // AZERTY: the key of M is where QWERTY has `;`, its code is still KeyM.
    expect(comboOf(press({ key: 'M', code: 'KeyM', metaKey: true, shiftKey: true }), true)).toBe('Ctrl+Shift+M');
    expect(comboOf(press({ key: 'M', code: 'KeyM', ctrlKey: true, shiftKey: true }), false)).toBe('Ctrl+Shift+M');
    expect(comboOf(press({ key: 'µ', code: 'KeyM', altKey: true }), true)).toBe('Alt+M');
    expect(comboOf(press({ key: ' ', code: 'Space', metaKey: true, shiftKey: true }), true)).toBe('Ctrl+Shift+Space');
    expect(comboOf(press({ key: 'F5', code: 'F5', ctrlKey: true }), false)).toBe('Ctrl+F5');
  });

  it('is never a key alone, a modifier alone or Ctrl on macOS', () => {
    expect(comboOf(press({ key: 'm', code: 'KeyM' }), true)).toBeNull();
    expect(comboOf(press({ key: 'M', code: 'KeyM', shiftKey: true }), true)).toBeNull();
    expect(comboOf(press({ key: 'Meta', code: 'MetaLeft', metaKey: true }), true)).toBeNull();
    expect(comboOf(press({ key: 'm', code: 'KeyM', ctrlKey: true }), true)).toBeNull();
  });

  it('defaults to Ctrl+Shift+M, and follows the one chosen', () => {
    const e = press({ key: 'M', code: 'KeyM', metaKey: true, shiftKey: true });
    expect(isVoiceShortcut(e, '', true)).toBe(true);
    expect(isVoiceShortcut(e, 'Ctrl+Alt+D', true)).toBe(false);
    expect(isVoiceShortcut(press({ key: '∂', code: 'KeyD', metaKey: true, altKey: true }), 'Ctrl+Alt+D', true)).toBe(true);
  });
});
