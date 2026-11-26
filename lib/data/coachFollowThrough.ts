'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { isMissingFunction } from './migrationCheck';
import { LOAD_FAILED } from '@/lib/ownerReport';
import { READ_NEEDS_0176, summariseFollowThrough, type FollowThroughRaw, type GymFollowThrough } from '@/lib/followThrough';

// Coach follow-through for one gym (RO19, CW5), read through coach_follow_through (migration 0176). The database lets a gym admin AT THAT
// gym, or the owner of its organisation, read it, and refuses everyone else: a coach who isn't an admin never gets another coach's
// figures, whatever this is called with. Counts and times only; no message text ever leaves the database.

export type FollowThroughLoad = { ok: true; data: GymFollowThrough } | { ok: false; error: string; needsMigration: boolean };

export async function getCoachFollowThrough(gymId: string): Promise<FollowThroughLoad> {
  if (!gymId) return { ok: false, error: LOAD_FAILED, needsMigration: false };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('coach_follow_through', { p_gym: gymId });
  if (error || !data) {
    if (isMissingFunction(error)) return { ok: false, error: READ_NEEDS_0176, needsMigration: true };
    Sentry.captureException(new Error(`coach_follow_through: ${error?.message ?? 'empty answer'}`), { tags: { area: 'owner' } });
    return { ok: false, error: LOAD_FAILED, needsMigration: false };
  }
  return { ok: true, data: summariseFollowThrough(data as FollowThroughRaw) };
}

// The same for several gyms at once (the owner's Overview), keyed by gym id.
export async function getFollowThroughForGyms(gymIds: string[]): Promise<Record<string, FollowThroughLoad>> {
  const results = await Promise.all(gymIds.map((id) => getCoachFollowThrough(id).catch((): FollowThroughLoad => ({ ok: false, error: LOAD_FAILED, needsMigration: false }))));
  return Object.fromEntries(gymIds.map((id, i) => [id, results[i]]));
}
