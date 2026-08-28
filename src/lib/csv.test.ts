import { describe, expect, it } from 'vitest';
import { parseCsv, sniffDelimiter, toRecords } from './csv';

describe('parseCsv', () => {
  it('parses a simple comma-separated file', () => {
    const { headers, rows } = parseCsv('First Name,Last Name,Email\nSarah,Cohen,sarah@example.com\nDavid,Katz,david@example.com');
    expect(headers).toEqual(['First Name', 'Last Name', 'Email']);
    expect(rows).toEqual([
      ['Sarah', 'Cohen', 'sarah@example.com'],
      ['David', 'Katz', 'david@example.com'],
    ]);
  });

  it('handles quoted fields containing the delimiter', () => {
    const { rows } = parseCsv('Name,Address\n"Cohen, Sarah","1 High St, London"');
    expect(rows).toEqual([['Cohen, Sarah', '1 High St, London']]);
  });

  it('handles escaped quotes inside a quoted field', () => {
    const { rows } = parseCsv('Name,Notes\n"Sarah","She said ""hello"" to everyone"');
    expect(rows).toEqual([['Sarah', 'She said "hello" to everyone']]);
  });

  it('handles a quoted field containing a newline', () => {
    const { rows } = parseCsv('Name,Notes\n"Sarah","Line one\nLine two"');
    expect(rows).toEqual([['Sarah', 'Line one\nLine two']]);
  });

  it('handles CRLF line endings', () => {
    const { headers, rows } = parseCsv('A,B\r\n1,2\r\n3,4');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles lone CR line endings', () => {
    const { headers, rows } = parseCsv('A,B\r1,2\r3,4');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('handles bare LF line endings', () => {
    const { headers, rows } = parseCsv('A,B\n1,2\n3,4');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('strips a leading UTF-8 BOM', () => {
    const { headers } = parseCsv('﻿First Name,Last Name\nSarah,Cohen');
    expect(headers).toEqual(['First Name', 'Last Name']);
  });

  it('does not crash on a ragged row with fewer fields than the header', () => {
    const { headers, rows } = parseCsv('A,B,C\n1,2');
    expect(headers).toEqual(['A', 'B', 'C']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('does not crash on a ragged row with more fields than the header', () => {
    const { headers, rows } = parseCsv('A,B\n1,2,3,4');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([['1', '2', '3', '4']]);
  });

  it('handles a file with no trailing newline', () => {
    const { headers, rows } = parseCsv('A,B\n1,2');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('drops a single wholly blank trailing row from a real trailing newline', () => {
    const { rows } = parseCsv('A,B\n1,2\n');
    expect(rows).toEqual([['1', '2']]);
  });

  it('parses with a semicolon delimiter', () => {
    const { headers, rows } = parseCsv('A;B\n1;2', ';');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('parses with a tab delimiter', () => {
    const { headers, rows } = parseCsv('A\tB\n1\t2', '\t');
    expect(headers).toEqual(['A', 'B']);
    expect(rows).toEqual([['1', '2']]);
  });

  it('returns an empty header/row set for an empty string', () => {
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});

describe('sniffDelimiter', () => {
  it('picks comma when commas dominate the header line', () => {
    expect(sniffDelimiter('First Name,Last Name,Email\nSarah,Cohen,x')).toBe(',');
  });

  it('picks semicolon when semicolons dominate the header line', () => {
    expect(sniffDelimiter('First Name;Last Name;Email\nSarah;Cohen;x')).toBe(';');
  });

  it('picks tab when tabs dominate the header line', () => {
    expect(sniffDelimiter('First Name\tLast Name\tEmail\nSarah\tCohen\tx')).toBe('\t');
  });

  it('defaults to comma when nothing is present', () => {
    expect(sniffDelimiter('justoneheader\nrow')).toBe(',');
  });

  it('ignores a leading BOM when sniffing', () => {
    expect(sniffDelimiter('﻿A;B;C\n1;2;3')).toBe(';');
  });
});

describe('toRecords', () => {
  it('zips headers against rows', () => {
    expect(toRecords(['First Name', 'Last Name'], [['Sarah', 'Cohen']])).toEqual([
      { 'First Name': 'Sarah', 'Last Name': 'Cohen' },
    ]);
  });

  it('pads a short row with empty strings', () => {
    expect(toRecords(['A', 'B', 'C'], [['1', '2']])).toEqual([{ A: '1', B: '2', C: '' }]);
  });

  it('drops cells beyond the header length', () => {
    expect(toRecords(['A', 'B'], [['1', '2', '3']])).toEqual([{ A: '1', B: '2' }]);
  });
});
