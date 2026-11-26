// What the Run this class page and its TV page check before reading the class. Not a route: only page.tsx is one.

// A real calendar date in the address ("2026-11-26"), not just the shape: "2026-02-31" or "2026-13-01" is not found (SE15).
export function isRunClassDate(date: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}

interface GymReader {
  from(table: string): {
    select(columns: string): { eq(column: string, value: string): { maybeSingle(): PromiseLike<{ data: unknown; error: unknown }> } };
  };
}

// The time zone of the gym the class belongs to (CS19), for "not happened yet" and "today" on Run this class. Null when it can't be read
// (the screen then uses London, as before).
// `client` is the page's Supabase client (typed loosely here: its full type is too deep to check against this small shape).
export async function runClassTimeZone(client: unknown, classId: string): Promise<string | null> {
  const supabase = client as GymReader;
  try {
    const { data: cls } = await supabase.from('classes').select('gym_id').eq('id', classId).maybeSingle();
    const gymId = (cls as { gym_id?: string | null } | null)?.gym_id;
    if (!gymId) return null;
    const { data: gym } = await supabase.from('gyms').select('timezone').eq('id', gymId).maybeSingle();
    const tz = (gym as { timezone?: string | null } | null)?.timezone?.trim();
    return tz || null;
  } catch {
    return null;
  }
}
