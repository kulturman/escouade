import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SIZE, MAX_SIZE, MIN_SIZE, editorFont, fontSizeKey } from './fontsize.svelte';

const key = (over: Partial<KeyboardEvent>) => ({ key: '', code: '', shiftKey: false, altKey: false, ...over }) as KeyboardEvent;
const cssSize = () => document.documentElement.style.getPropertyValue('--editor-font');

describe('the size of the editor’s text', () => {
  beforeEach(() => editorFont.reset());

  it('grows and shrinks with IntelliJ’s keys and the usual ones, and goes back to its default', () => {
    fontSizeKey(key({ shiftKey: true, code: 'Period', key: '>' }))!();
    expect(editorFont.size).toBe(DEFAULT_SIZE + 1);
    expect(cssSize()).toBe(`${DEFAULT_SIZE + 1}px`);
    fontSizeKey(key({ key: '=' }))!();
    fontSizeKey(key({ shiftKey: true, code: 'Comma', key: '<' }))!();
    fontSizeKey(key({ key: '-' }))!();
    fontSizeKey(key({ key: '-' }))!();
    expect(editorFont.size).toBe(DEFAULT_SIZE - 1);
    fontSizeKey(key({ key: '0', code: 'Digit0' }))!();
    expect(editorFont.size).toBe(DEFAULT_SIZE);
  });

  it('stays within its bounds, is kept in the preferences, and leaves the other keys alone', () => {
    editorFont.set(100);
    expect(editorFont.size).toBe(MAX_SIZE);
    editorFont.set(1);
    expect(editorFont.size).toBe(MIN_SIZE);
    expect(localStorage.getItem('escouade.editor.fontSize')).toBe(String(MIN_SIZE));
    expect(fontSizeKey(key({ key: 'f' }))).toBeNull();
    expect(fontSizeKey(key({ key: '-', altKey: true }))).toBeNull();
  });
});
