/**
 * Hand-rolled RFC 4180 CSV parser — see CLAUDE.md's dependency-avoidance list (no papaparse) and
 * the build plan's §3.6. Handles quoted fields, escaped quotes (`""`), CR/LF/CRLF line endings, a
 * leading UTF-8 BOM, and a configurable delimiter (comma/semicolon/tab).
 *
 * Ragged rows — fewer or more fields than the header line — are returned exactly as parsed,
 * never padded, truncated, or thrown on. Reconciling a short/long row against the header is
 * `ImportWizard`'s mapping step (via `toRecords` below), not this parser's job: a parser that
 * silently pads or drops fields would risk read a broker's genuinely ragged export shorter than
 * whatever it actually contained.
 */

const BOM = '﻿';

export interface ParsedCsv {
  headers: string[];
  rows: string[][];
}

export function parseCsv(text: string, delimiter = ','): ParsedCsv {
  const src = text.startsWith(BOM) ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const n = src.length;

  function endField() {
    row.push(field);
    field = '';
  }
  function endRow() {
    endField();
    rows.push(row);
    row = [];
  }

  while (i < n) {
    const c = src[i];

    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += c;
      i += 1;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (c === delimiter) {
      endField();
      i += 1;
      continue;
    }
    if (c === '\r') {
      // CRLF or a lone CR — either way the line ends here.
      endRow();
      i += src[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (c === '\n') {
      endRow();
      i += 1;
      continue;
    }
    field += c;
    i += 1;
  }

  // A trailing field/row with no terminating newline (no final blank line in the file) still
  // needs to land.
  if (field !== '' || row.length > 0) endRow();

  // Drop a wholly blank trailing row — the one a real trailing newline produces — but leave any
  // blank row in the MIDDLE of the file alone; that is a ragged row, not a file-ending artefact.
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  const [headers = [], ...dataRows] = rows;
  return { headers, rows: dataRows };
}

/** comma vs semicolon vs tab, by counting occurrences in the first line only — a cheap sniff,
 *  good enough to pre-select the wizard's delimiter control before a human confirms it. */
export function sniffDelimiter(text: string): ',' | ';' | '\t' {
  const src = text.startsWith(BOM) ? text.slice(1) : text;
  const firstLine = src.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const commaCount = (firstLine.match(/,/g) ?? []).length;
  const semicolonCount = (firstLine.match(/;/g) ?? []).length;
  const tabCount = (firstLine.match(/\t/g) ?? []).length;

  if (tabCount > commaCount && tabCount > semicolonCount) return '\t';
  if (semicolonCount > commaCount) return ';';
  return ',';
}

/**
 * Zips a parsed row against the header list: a cell missing because the row was short becomes
 * `''`, and any cell beyond the header's length is simply dropped — the ragged-row reconciliation
 * `parseCsv` above deliberately leaves undone.
 */
export function toRecords(headers: string[], rows: string[][]): Record<string, string>[] {
  return rows.map((row) => {
    const record: Record<string, string> = {};
    headers.forEach((header, i) => {
      record[header] = row[i] ?? '';
    });
    return record;
  });
}
