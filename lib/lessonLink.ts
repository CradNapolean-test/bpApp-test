// A lesson's "video or link" must be a secure web address (https://). Members open it from the app, so a link that is not https, or not a web
// address at all (javascript:, data:, a bare "www.example.com" that would be treated as a path), is refused instead of stored.
export type LessonLinkResult = { ok: true; url: string | null } | { ok: false; error: string };

export function normaliseLessonLink(input: string | null | undefined): LessonLinkResult {
  const text = (input ?? '').trim();
  if (text === '') return { ok: true, url: null };
  let parsed: URL;
  try {
    parsed = new URL(text);
  } catch {
    return { ok: false, error: 'Enter the full link, starting with https://' };
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    return { ok: false, error: 'The link must start with https://' };
  }
  return { ok: true, url: text };
}
