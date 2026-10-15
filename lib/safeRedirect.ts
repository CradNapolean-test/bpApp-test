// Where /auth/confirm may send a person after their link works (M6). It used to redirect to any `next` value, so a link built with an
// attacker's own valid token and next=https://evil.example signed the victim in to the attacker's account and then sent them off-site.
//
// Only a path on this site is allowed. The email templates pass `next` as an absolute address of this same site ({{ .RedirectTo }}), so an
// absolute address is accepted when its origin is exactly ours, and is reduced to its path. Everything else becomes the fallback.

const CONTROL = /[\u0000-\u001f\u007f]/;

export function safeNextPath(next: string | null | undefined, origin: string, fallback = '/'): string {
  if (!next) return fallback;
  const raw = next.trim();
  if (!raw || CONTROL.test(raw) || raw.length > 2000) return fallback;
  // A backslash is treated as a slash by browsers ("/\evil.example" is "//evil.example"): never allowed.
  if (raw.includes('\\')) return fallback;
  // Scheme-relative ("//host") is another site.
  if (raw.startsWith('//')) return fallback;
  let url: URL;
  try {
    url = new URL(raw, origin);
  } catch {
    return fallback;
  }
  if (url.origin !== new URL(origin).origin) return fallback;
  const path = `${url.pathname}${url.search}${url.hash}`;
  // The result is always a path that starts with a single slash.
  return path.startsWith('/') && !path.startsWith('//') ? path : fallback;
}
