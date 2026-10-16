// Where the dictated text goes in a field.

// Where the dictated text goes in a field.

/**
 * `dictated` put in place of `text`'s selection [start, end): a space before it when it follows a character that is
 * none, a space after it only before a letter or a digit (not before punctuation); the caret after it.
 */
export function insertDictation(text: string, start: number, end: number, dictated: string): { text: string; caret: number } {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const tail = /^[\p{L}\p{N}]/u.test(after) ? ' ' : '';
  const piece = lead + dictated;
  return { text: before + piece + tail + after, caret: before.length + piece.length };
}

/** `dictated` at the end of a draft. */
export function appendDictation(text: string, dictated: string): string {
  return insertDictation(text, text.length, text.length, dictated).text;
}
