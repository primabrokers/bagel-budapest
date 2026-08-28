/**
 * Client-side CSV download — the export half of every list page (guests, vendors, budget lines).
 * The import half (Stage 4's CSV import wizard) is a separate, hand-rolled RFC 4180 parser per
 * the build plan; this is only the simpler direction, writing one out.
 *
 * Values are quoted/escaped per RFC 4180 and the file is prefixed with a UTF-8 BOM so Excel
 * opens it with the right encoding instead of mangling a "£" or a name with an accent.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const escape = (value: string | number | null | undefined): string => {
    if (value === null || value === undefined) return '';
    const s = String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(','));
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
