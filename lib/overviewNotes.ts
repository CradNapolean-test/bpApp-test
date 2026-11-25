// The notes card on the coach's Overview of a member (CL15). It showed the two newest notes of any coach under "Your notes". Now it shows
// the viewing coach's own newest notes first, fills any space left with other coaches' notes (newest first, each marked as theirs), and
// is only called "Your notes" when every note on it is the coach's own. Injuries have their own box above, so they are left out here.
type Note = { id: string; coach_id: string; kind: string; created_at: string };

export function overviewNotes<T extends Note>(entries: T[], currentUserId: string | null, count = 2): { notes: (T & { mine: boolean })[]; allMine: boolean } {
  const newestFirst = entries.filter((n) => n.kind !== 'injury').sort((a, b) => b.created_at.localeCompare(a.created_at));
  const isMine = (n: T) => currentUserId != null && n.coach_id === currentUserId;
  const picked = [...newestFirst.filter(isMine), ...newestFirst.filter((n) => !isMine(n))].slice(0, count).map((n) => ({ ...n, mine: isMine(n) }));
  return { notes: picked, allMine: picked.length > 0 && picked.every((n) => n.mine) };
}
