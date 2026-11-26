// @vitest-environment node
import { seededRandom } from '../src/test/seededRandom.js';
import { newCode, normalizeCode } from './codes.js';

describe('lobby codes', () => {
  it('are four consonants', () => {
    const random = seededRandom(9);
    for (let count = 0; count < 200; count++) expect(newCode(random)).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ]{4}$/);
  });

  it('are read however they were typed', () => {
    expect(normalizeCode(' bdfg ')).toBe('BDFG');
    expect(normalizeCode('KLMN')).toBe('KLMN');
  });

  it('are refused when they can\'t be one', () => {
    for (const text of ['', 'BDF', 'BDFGH', 'BADG', 'B1FG', 'new']) expect(normalizeCode(text)).toBeNull();
  });
});
