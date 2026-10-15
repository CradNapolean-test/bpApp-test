// Short names for gyms. A gym is called "<organisation> - <site>" (for example "Acme Fitness - Northside") and the header
// already carries the brand, so only the site part is worth the space. Nothing here knows an organisation's name: it is
// either passed in (the owner side can read it), worked out from the other gyms the person belongs to, or, for a person
// with a single gym, taken from after the last separator.

const SEPARATOR = /\s*[-–—:]\s+/;

const segmentsOf = (name: string): string[] =>
  name
    .split(new RegExp(SEPARATOR.source, 'g'))
    .map((s) => s.trim())
    .filter(Boolean);

// How many leading segments every name has in common, always leaving each name at least one segment of its own.
function sharedSegmentCount(lists: string[][]): number {
  let n = 0;
  while (lists.every((l) => l.length > n + 1 && l[n].toLowerCase() === lists[0][n].toLowerCase())) n += 1;
  return n;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// organisationName: strip exactly that, when the caller knows it.
// siblings: every gym name the person belongs to; the leading words they all share are the organisation.
// With neither (a person in one gym) the site part after the last separator is used.
export function shortGymName(name: string, options: { organisationName?: string | null; siblings?: string[] } = {}): string {
  const trimmed = name.trim();
  const org = options.organisationName?.trim();
  if (org) {
    const stripped = trimmed.replace(new RegExp(`^${escapeRegExp(org)}${SEPARATOR.source}`, 'i'), '').trim();
    if (stripped && stripped !== trimmed) return stripped;
  }
  const own = segmentsOf(trimmed);
  if (own.length < 2) return trimmed;

  const others = (options.siblings ?? []).map((s) => s.trim()).filter((s) => s && s !== trimmed);
  if (others.length === 0) return own[own.length - 1];

  const shared = sharedSegmentCount([own, ...others.map(segmentsOf)]);
  return shared > 0 ? own.slice(shared).join(' - ') : trimmed;
}
