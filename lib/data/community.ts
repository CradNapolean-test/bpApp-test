'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { checkActiveGym } from './gymGuard';
import { createClient } from '@/lib/supabase/server';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { eventCancelledMessage, eventChangeMessage, startsInThePast } from '@/lib/eventChange';
import type { EventWithSignup, FeedbackRow } from './types';

const MISSING_TABLE = ['42P01', 'PGRST205', 'PGRST202'];

// Upcoming events for the caller's gym, with headcount and whether the caller is signed up.
// Returns [] instead of throwing if migration 0065 hasn't been applied yet, since this loads on
// every dashboard render.
export async function getUpcomingEvents(clientId: string | null): Promise<EventWithSignup[]> {
  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from('gym_events')
    .select('*')
    .gte('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order('starts_at');
  if (error) {
    if (MISSING_TABLE.includes(error.code ?? '')) return [];
    raise(error);
  }
  if (!events || events.length === 0) return [];

  const { data: counts } = await supabase.rpc('event_signup_counts');
  const countBy = new Map<string, number>((counts ?? []).map((c: { event_id: string; signups: number }) => [c.event_id, Number(c.signups)]));

  let mine = new Set<string>();
  if (clientId) {
    const { data: mySignups } = await supabase.from('event_signups').select('event_id').eq('client_id', clientId);
    mine = new Set((mySignups ?? []).map((s) => s.event_id));
  }

  return events.map((e) => ({ ...e, signups: countBy.get(e.id) ?? 0, signedUp: mine.has(e.id) }));
}

// Events that have already happened (coach view), newest first.
export async function getPastEvents(limit = 10): Promise<EventWithSignup[]> {
  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from('gym_events')
    .select('*')
    .lt('starts_at', new Date(Date.now() - 6 * 3600 * 1000).toISOString())
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (MISSING_TABLE.includes(error.code ?? '')) return [];
    raise(error);
  }
  if (!events || events.length === 0) return [];
  const { data: counts } = await supabase.rpc('event_signup_counts');
  const countBy = new Map<string, number>((counts ?? []).map((c: { event_id: string; signups: number }) => [c.event_id, Number(c.signups)]));
  return events.map((e) => ({ ...e, signups: countBy.get(e.id) ?? 0, signedUp: false }));
}

export async function signUpForEvent(eventId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');

  const { data: event } = await supabase.from('gym_events').select('capacity').eq('id', eventId).maybeSingle();
  if (!event) return fail(null, 'Event not found');
  if (event.capacity != null) {
    const { data: counts } = await supabase.rpc('event_signup_counts');
    const taken = Number((counts ?? []).find((c: { event_id: string }) => c.event_id === eventId)?.signups ?? 0);
    if (taken >= event.capacity) return fail(null, 'This event is full');
  }

  const { error } = await supabase.from('event_signups').insert({ event_id: eventId, client_id: user.id });
  if (error) return fail(error, 'Could not sign you up');
  return ok();
}

export async function leaveEvent(eventId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');
  const { error } = await supabase.from('event_signups').delete().eq('event_id', eventId).eq('client_id', user.id);
  if (error) return fail(error, 'Could not update your sign-up');
  return ok();
}

// ---- coach side ----

type EventFields = { title: string; description: string | null; location: string | null; starts_at: string; capacity: number | null };

// Everyone signed up is told (an in-app notification, notify_event_signups, migration 0135) when an event is moved, changes place or is
// cancelled. Times in the message are the gym's.
async function tellSignups(eventId: string, message: string | null): Promise<string | null> {
  if (!message) return null;
  const supabase = await createClient();
  const { error } = await supabase.rpc('notify_event_signups', { p_event: eventId, p_message: message });
  return error ? (error.message || 'could not notify') : null;
}

// expectedGymId (on every write here): the gym the page was drawn for; see lib/data/gymGuard.ts (R28).
export async function createEvent(fields: EventFields, expectedGymId?: string | null): Promise<ActionResult> {
  const stale = await checkActiveGym(await createClient(), expectedGymId);
  if (stale) return stale;
  if (startsInThePast(fields.starts_at)) return fail(null, 'An event can\u2019t start in the past.');
  const supabase = await createClient();
  const { data: gymId, error: gymError } = await supabase.rpc('my_gym_id');
  if (gymError || !gymId) return fail(gymError, 'Could not work out your gym');
  const { error } = await supabase.from('gym_events').insert({ ...fields, gym_id: gymId });
  if (error) return fail(error, 'Could not create the event');
  return ok();
}

export async function updateEvent(eventId: string, fields: EventFields, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { data: before } = await supabase.from('gym_events').select('title, starts_at, location').eq('id', eventId).maybeSingle();
  if (!before) return fail(null, 'That event no longer exists.');
  if (new Date(before.starts_at).getTime() !== new Date(fields.starts_at).getTime() && startsInThePast(fields.starts_at)) {
    return fail(null, 'An event can\u2019t be moved to a time that has already passed.');
  }
  if (fields.capacity != null) {
    const { count } = await supabase.from('event_signups').select('*', { count: 'exact', head: true }).eq('event_id', eventId);
    if ((count ?? 0) > fields.capacity) return fail(null, `${count} people have already signed up, so the spots cannot go below that.`);
  }
  const { error } = await supabase.from('gym_events').update(fields).eq('id', eventId);
  if (error) return fail(error, 'Could not save the event');

  // Saved: now tell the people who signed up if the time or the place changed.
  const problem = await tellSignups(eventId, eventChangeMessage(before, { title: fields.title, starts_at: fields.starts_at, location: fields.location }, DEFAULT_TIMEZONE));
  if (problem) return fail(null, 'The event was saved, but the people signed up could not be told. Message them yourself.');
  return ok();
}

// Tells everyone signed up that the event is cancelled, then removes it. If they cannot be told the event is NOT deleted, so nobody is
// left expecting an event that has silently vanished.
export async function deleteEvent(eventId: string, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { data: event } = await supabase.from('gym_events').select('title, starts_at, location').eq('id', eventId).maybeSingle();
  if (event) {
    const problem = await tellSignups(eventId, eventCancelledMessage(event, DEFAULT_TIMEZONE));
    if (problem) return fail(null, 'The people signed up could not be told, so the event was not deleted. Try again.');
  }
  const { error } = await supabase.from('gym_events').delete().eq('id', eventId);
  if (error) return fail(error, 'Could not delete the event');
  return ok();
}

export async function getEventAttendees(eventId: string): Promise<{ clientId: string; name: string }[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('event_signups')
    .select('client_id, created_at')
    .eq('event_id', eventId)
    .order('created_at');
  if (error) raise(error);
  const ids = (data ?? []).map((s) => s.client_id);
  if (ids.length === 0) return [];
  const { data: profiles } = await supabase.from('client_profiles').select('client_id, name').in('client_id', ids);
  const nameBy = new Map((profiles ?? []).map((p) => [p.client_id, p.name as string | null]));
  return ids.map((id) => ({ clientId: id, name: nameBy.get(id) ?? 'Member' }));
}

// ---- feedback ----

export async function submitFeedback(rating: number, comment: string): Promise<ActionResult> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return fail(null, 'Pick a rating from 1 to 5');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');
  const { error } = await supabase
    .from('member_feedback')
    .insert({ client_id: user.id, rating, comment: comment.trim() || null });
  if (error) return fail(error, 'Could not send your feedback');
  return ok();
}

export async function getRecentFeedback(limit = 50): Promise<FeedbackRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('member_feedback')
    .select('id, client_id, rating, comment, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) {
    if (MISSING_TABLE.includes(error.code ?? '')) return [];
    raise(error);
  }
  const ids = [...new Set((data ?? []).map((f) => f.client_id))];
  const { data: profiles } = ids.length
    ? await supabase.from('client_profiles').select('client_id, name').in('client_id', ids)
    : { data: [] as { client_id: string; name: string | null }[] };
  const nameBy = new Map((profiles ?? []).map((p) => [p.client_id, p.name]));
  return (data ?? []).map((f) => ({ ...f, clientName: nameBy.get(f.client_id) ?? 'Member' }));
}
