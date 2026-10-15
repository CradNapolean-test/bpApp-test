// A coach works in one gym at a time (their "active" gym) but their members each belong to one gym. When the members are in
// a different gym from the one the coach is looking at, every gym-wide screen (timetable, plans, red flags, "whole gym") shows
// the other gym's data and the coach has no idea why. This works out when to say so (R38).

export interface GymClientCount {
  gymId: string;
  gymName: string;
  // How many of the coach's own members belong to this gym.
  count: number;
}

export interface GymMismatch {
  activeGymId: string;
  activeGymName: string;
  // The coach's members in the active gym, and in all the others together.
  here: number;
  elsewhere: number;
  // The other gym that holds the most of them (where "Switch" goes).
  target: GymClientCount;
  // All the other gyms that hold any of them, most first.
  others: GymClientCount[];
}

// null when there is nothing to warn about: the members are where the coach is looking (or mostly are), or nobody has any.
export function gymMismatch(counts: GymClientCount[], activeGymId: string | null): GymMismatch | null {
  if (!activeGymId) return null;
  const active = counts.find((c) => c.gymId === activeGymId);
  const here = active?.count ?? 0;
  const others = counts.filter((c) => c.gymId !== activeGymId && c.count > 0).sort((a, b) => b.count - a.count);
  const elsewhere = others.reduce((n, c) => n + c.count, 0);
  if (others.length === 0 || elsewhere <= here) return null;
  return { activeGymId, activeGymName: active?.gymName ?? '', here, elsewhere, target: others[0], others };
}

// "Your members are at Salford Quays but you are viewing Worsley." The names are passed in already shortened.
export function mismatchMessage(m: GymMismatch, name: (gymName: string) => string): string {
  const viewing = name(m.activeGymName) || 'this gym';
  const where = m.others.length === 1 ? name(m.target.gymName) : m.others.map((o) => name(o.gymName)).join(' and ');
  if (m.here === 0) return `Your members are at ${where} but you are viewing ${viewing}.`;
  return `Most of your members (${m.elsewhere} of ${m.here + m.elsewhere}) are at ${where}, but you are viewing ${viewing}.`;
}
