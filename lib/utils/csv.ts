// Minimal RFC4180-ish CSV support -- just enough for the import/export flows (client roster,
// exercise library). Fields containing a comma, quote, or newline get quoted; quotes inside a
// quoted field are escaped by doubling, same as Excel/Sheets both read and write.

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const escapeField = (value: string | number | null): string => {
    const str = value === null || value === undefined ? '' : String(value);
    if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
    return str;
  };
  const lines = [headers.map(escapeField).join(',')];
  for (const row of rows) lines.push(row.map(escapeField).join(','));
  return lines.join('\r\n');
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

export function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
