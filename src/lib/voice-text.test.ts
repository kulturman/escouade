import { describe, expect, it } from 'vitest';
import { appendDictation, insertDictation } from './voice-text';

describe('insertDictation', () => {
  it('fills an empty field and puts the caret after the text', () => {
    expect(insertDictation('', 0, 0, 'Bonjour')).toEqual({ text: 'Bonjour', caret: 7 });
  });

  it('adds a space after a word, none after a space or a line break', () => {
    expect(insertDictation('Lance', 5, 5, 'les tests').text).toBe('Lance les tests');
    expect(insertDictation('Lance ', 6, 6, 'les tests').text).toBe('Lance les tests');
    expect(insertDictation('Lance\n', 6, 6, 'les tests').text).toBe('Lance\nles tests');
  });

  it('keeps the words apart when it lands inside a word, but not before punctuation', () => {
    expect(insertDictation('abcdef', 3, 3, 'X')).toEqual({ text: 'abc X def', caret: 5 });
    expect(insertDictation('Bonjour.', 7, 7, 'à tous').text).toBe('Bonjour à tous.');
  });

  it('replaces the selection', () => {
    expect(insertDictation('Lance les tests', 6, 9, 'tous les')).toEqual({ text: 'Lance tous les tests', caret: 14 });
  });
});

describe('appendDictation', () => {
  it('appends to a draft, a space between', () => {
    expect(appendDictation('', 'Bonjour')).toBe('Bonjour');
    expect(appendDictation('Lance', 'les tests')).toBe('Lance les tests');
  });
});
