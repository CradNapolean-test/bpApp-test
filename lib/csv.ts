// A table as CSV text. Values that contain a comma, quote or newline are quoted; quotes are doubled.
// Cells starting with = + - @ are prefixed with a quote so a spreadsheet does not treat them as formulas
// (negative numbers are left alone).
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined): string => {
    if (v == null) return '';
    let s = String(v);
    if (typeof v === 'string' && /^[=+\-@]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}
