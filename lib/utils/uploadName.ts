// The extension of a file we are about to put in storage (L9, L11). It used to be whatever followed the last dot in the file's own name, which
// is chosen by whoever sends it: "holiday.jpg.php" or a name with slashes in it ended up in the storage path. The type the browser reports
// decides it now, from a short list of picture types; anything else is stored as the fallback.

const BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

const ALLOWED_NAME_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif']);

export function uploadExtension(file: { name?: string; type?: string }, fallback = 'jpg'): string {
  const fromType = BY_TYPE[(file.type ?? '').toLowerCase()];
  if (fromType) return fromType;
  // No usable type (some phones send none): trust the name only if its extension is a plain picture one.
  const match = /\.([A-Za-z0-9]{1,5})$/.exec(file.name ?? '');
  const fromName = match?.[1].toLowerCase();
  if (fromName && ALLOWED_NAME_EXTENSIONS.has(fromName)) return fromName === 'jpeg' ? 'jpg' : fromName;
  return fallback;
}
