// Minimal RFC4180-ish CSV support -- just enough for the import/export flows (client roster, exercise library, reports).
// Quotes inside a quoted field are escaped by doubling, same as Excel/Sheets both read and write.

// A table as CSV text (the one implementation for every export). Values that contain a comma, quote or newline are quoted and
// quotes are doubled. A STRING cell that starts with = + - @ , a tab or a carriage return is prefixed with a quote, so a spreadsheet
// never treats text typed by a member (a name, a note) as a formula: =IMAGE("https://...") in a name would otherwise send other
// cells off-site when a coach opens the file in Google Sheets. Numbers are written as they are (a negative number stays negative).
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  return [headers, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let s = String(value);
  if (typeof value === 'string' && FORMULA_START.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Parses into rows of raw string cells -- callers map header -> value themselves, since each
// import flow has its own tolerant header matching (case/whitespace-insensitive).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += char;
      i++;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (char === ',') {
      pushField();
      i++;
      continue;
    }
    if (char === '\r') {
      i++;
      continue;
    }
    if (char === '\n') {
      pushRow();
      i++;
      continue;
    }
    field += char;
    i++;
  }
  // Trailing field/row, unless the file ended cleanly on a newline (nothing pending).
  if (field.length > 0 || row.length > 0) pushRow();

  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// Builds a case/whitespace-insensitive column lookup from a parsed header row, so callers can
// do `col(header, 'email')` regardless of the exact capitalization/spacing in the uploaded file.
export function headerIndex(headerRow: string[]): (name: string) => number {
  const normalized = headerRow.map((h) => h.trim().toLowerCase());
  return (name: string) => normalized.indexOf(name.trim().toLowerCase());
}

// Excel only reads accented UTF-8 text correctly when a CSV starts with a byte-order mark. JSON and other files must NOT have one
// (JSON.parse rejects it), so it is added for text/csv only.
export function withByteOrderMark(content: string, mimeType: string): string {
  return mimeType.toLowerCase().startsWith('text/csv') && !content.startsWith('\uFEFF') ? '\uFEFF' + content : content;
}

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([withByteOrderMark(content, mimeType)], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
