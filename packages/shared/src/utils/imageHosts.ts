// Where a member's screen may load a picture from (R23, app half). A coach can paste any link as an exercise's picture, and the workout
// screen put it straight into an <img> for every member: the web address of whoever hosted it then saw each member's address and
// browser, and the image could be swapped for anything. Only pictures from the gym's own storage and a short list the owner names are
// shown now (the rest get the muscle-group icon), and none of them is sent a referrer. The database already refuses non-https links
// (migration 0128).

// "a.example.com, B.example.com" -> ["a.example.com", "b.example.com"]
export function parseHostList(text: string | null | undefined): string[] {
  return (text ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, ''))
    .filter(Boolean);
}

// The project's own storage host plus the owner's list (NEXT_PUBLIC_IMAGE_HOSTS).
export function allowedImageHosts(supabaseUrl: string | null | undefined, extraHosts: string | null | undefined): string[] {
  const own: string[] = [];
  try {
    if (supabaseUrl) own.push(new URL(supabaseUrl).hostname.toLowerCase());
  } catch {
    // no usable project address: only the owner's list applies
  }
  return [...own, ...parseHostList(extraHosts)];
}

// True for an https address whose host is on the list, or a subdomain of a host on the list.
export function isAllowedImage(url: string | null | undefined, allowed: readonly string[]): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    const host = parsed.hostname.toLowerCase();
    return allowed.some((a) => host === a || host.endsWith(`.${a}`));
  } catch {
    return false;
  }
}

// Lesson links are shown as links only when they are https (ED): a `javascript:` or `data:` address pasted as a link must never be clickable.
export function isHttpsLink(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
