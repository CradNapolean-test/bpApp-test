import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes headers and rows', () => {
    expect(toCsv(['a', 'b'], [[1, 'x'], [2, null]])).toBe('a,b\r\n1,x\r\n2,\r\n');
  });
  it('quotes commas, quotes and newlines', () => {
    expect(toCsv(['n'], [['Smith, J'], ['say "hi"'], ['a\nb']])).toBe('n\r\n"Smith, J"\r\n"say ""hi"""\r\n"a\nb"\r\n');
  });
  it('defuses spreadsheet formulas but keeps negative numbers', () => {
    expect(toCsv(['n'], [['=SUM(A1)'], ['@cmd'], [-5]])).toBe("n\r\n'=SUM(A1)\r\n'@cmd\r\n-5\r\n");
  });
});
