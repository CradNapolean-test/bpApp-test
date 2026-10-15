// A coach's logo (CM5). The storage bucket accepts only PNG, JPEG and WebP up to 1 MB (migration 0128); the screen and the server action check
// the same limits first, so a refused file gets a sentence instead of a storage error, and the file name never comes from the file itself.

export const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const LOGO_MAX_BYTES = 1_048_576;

const EXTENSION: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' };

// null when the file may be uploaded, otherwise what to tell the coach.
export function logoProblem(file: { type?: string; size: number }): string | null {
  const type = (file.type ?? '').toLowerCase();
  if (!(LOGO_TYPES as readonly string[]).includes(type)) return 'Use a PNG, JPEG or WebP picture.';
  if (file.size <= 0) return 'That file is empty.';
  if (file.size > LOGO_MAX_BYTES) return 'The picture must be 1 MB or smaller.';
  return null;
}

// The storage path for a new logo: the coach's own folder, a time stamp, and an extension decided by the checked picture type.
export function logoPath(userId: string, type: string, now: number = Date.now()): string {
  const extension = EXTENSION[type.toLowerCase()] ?? 'png';
  return `${userId}/logo-${now}.${extension}`;
}

// The old logo to delete once the new one is saved: only a file in the coach's own folder, and never the one just uploaded.
export function previousLogoToDelete(previous: string | null | undefined, next: string | null, userId: string): string | null {
  if (!previous || previous === next) return null;
  return previous.startsWith(`${userId}/`) && !previous.includes('..') ? previous : null;
}
