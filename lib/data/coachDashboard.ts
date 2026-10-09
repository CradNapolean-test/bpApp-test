'use server';

import { createClient } from '@/lib/supabase/server';
import { EXERCISES } from '@/lib/bigDog';
import { isPlateaued } from '@/lib/calculations';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { addDays, isoWeekKey, todayIsoInTz, toIsoDate, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { getCoachChatOverview } from './chat';
import { getRecentActivity } from './activity';
import { getScheduleOccurrences } from './classes';
import { getRedFlagReport } from './redFlags';
import type { ActivityEventRow, DailyLogRow, ScheduleOccurrence } from './types';

export type DashboardScope = 'mine' | 'gym' | 'coach';

export interface CoachOption {
  id: string;
  name: string;
}

export interface WeekCheckin {
  clientId: string;
  name: string;
  weekStart: string;
  days: number;
  mine: boolean;
}
export interface PhotoReview {
  clientId: string;
  name: string;
  dates: string[];
  photos: number;
  mine: boolean;
}
export interface FormReview {
  clientId: string;
  name: string;
  assignmentId: string;
  formName: string;
  completedAt: string;
  mine: boolean;
}
export interface NewMember {
  clientId: string;
  name: string;
  reasons: string[];
  mine: boolean;
}
export interface ScoreToVerify {
  clientId: string;
  name: string;
  exercise: string;
  result: string | null;
  mine: boolean;
}
export interface DeletionRequestItem {
  clientId: string;
  name: string;
}
export interface UnreadThread {
  clientId: string;
  name: string;
  unread: number;
}
export type CheckReason = 'quiet' | 'missed' | 'credits' | 'stalled';
export interface MemberToCheck {
  clientId: string;
  name: string;
  reasons: { kind: CheckReason; label: string }[];
  detail: string;
}

export interface CoachDashboardData {
  scope: DashboardScope;
  isAdmin: boolean;
  coaches: CoachOption[];
  selectedCoachId: string | null;
  userId: string;
  todayIso: string;
  // The gym's timezone, for "now" on the client.
  timezone: string;
  // First name for the greeting.
  firstName: string | null;
  // Last completed week's red flags (whole gym); null when the report is not available.
  redFlags: { weekStart: string; flagged: number; toContact: number } | null;
  occurrences: ScheduleOccurrence[];
  unreadThreads: UnreadThread[];
  deletionRequests: DeletionRequestItem[];
  newMembers: NewMember[];
  checkins: WeekCheckin[];
  photoReviews: PhotoReview[];
  forms: FormReview[];
  scores: ScoreToVerify[];
  toCheck: MemberToCheck[];
  stats: {
    sessionsAttended: number;
    sessionsAttendedLastWeek: number;
    avgFillPct: number | null;
    checkinsIn: number;
    checkinsOf: number;
    newMembers: number;
    membersTotal: number;
  };
  activity: ActivityEventRow[];
  nameById: Record<string, string>;
}

type ProfileRel<T> = T | T[] | null;
const one = <T>(v: ProfileRel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

interface MemberRow {
  id: string;
  email: string;
  coach_id: string | null;
  created_at: string;
  client_profiles: ProfileRel<{
    name: string | null;
    timezone: string | null;
    nutrition_tracking_mode: string | null;
    onboarding_completed_at: string | null;
    needs_coach_review: boolean | null;
    review_reasons: string[] | null;
    deletion_requested_at: string | null;
    checkin_reminder_days: number | null;
  }>;
  credits_balance: ProfileRel<{ balance: number }>;
  client_memberships: { id: string; ended_at: string | null; membership_packages: ProfileRel<{ credits_per_week: number }> }[] | null;
  daily_logs: (DailyLogRow & { food_photo_entries: { id: string; created_at: string }[] | null })[] | null;
  nutrition_feedback: { log_date: string; photo_id: string | null }[] | null;
  coach_reviews: { kind: string; ref: string }[] | null;
  form_assignments: { id: string; completed_at: string | null; form_templates: ProfileRel<{ name: string }> }[] | null;
  bookings: { booking_date: string; attended: boolean | null; status: string }[] | null;
  big_dog_results: { exercise_key: string; self_reported: boolean | null; result_text: string | null; created_at: string }[] | null;
}

const SELECT = `
  id, email, coach_id, created_at,
  client_profiles(name, timezone, nutrition_tracking_mode, onboarding_completed_at, needs_coach_review, review_reasons, deletion_requested_at, checkin_reminder_days),
  credits_balance(balance),
  client_memberships!client_id(id, ended_at, membership_packages(credits_per_week)),
  daily_logs(id, log_date, protein, carbs, fat, fibre, water, bodyweight, steps, sleep, gym_session, hunger, energy, motivation, stress, period_started, notes, food_photo_entries(id, created_at)),
  nutrition_feedback!client_id(log_date, photo_id),
  coach_reviews!client_id(kind, ref),
  form_assignments!client_id(id, completed_at, form_templates(name)),
  bookings!client_id(booking_date, attended, status),
  big_dog_results!client_id(exercise_key, self_reported, result_text, created_at)
`;

// Everything the coach dashboard needs in one go. `scope` narrows it to the coach's own members
// ('mine'), one coach's members ('coach', gym admins only) or the whole gym ('gym', gym admins
// only). A non-admin asking for more than their own gets their own.
export async function getCoachDashboard(requested: DashboardScope = 'mine', coachId: string | null = null): Promise<CoachDashboardData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: me } = await supabase
    .from('profiles')
    .select('gym_id, is_gym_admin, display_name, gym:gym_id(timezone)')
    .eq('id', user.id)
    .maybeSingle();
  const gymRel = Array.isArray(me?.gym) ? me?.gym[0] : me?.gym;
  const timezone = gymRel?.timezone || DEFAULT_TIMEZONE;
  const isAdmin = !!me?.is_gym_admin;
  const scope: DashboardScope = isAdmin ? requested : 'mine';

  // Coaches at this gym (for the admin's coach picker).
  let coaches: CoachOption[] = [];
  if (isAdmin && me?.gym_id) {
    const { data } = await supabase.from('profiles').select('id, email, display_name').eq('role', 'coach').eq('gym_id', me.gym_id);
    coaches = (data ?? []).map((c) => ({ id: c.id, name: c.display_name || c.email }));
  }
  const selectedCoachId = scope === 'coach' ? (coachId ?? coaches[0]?.id ?? null) : null;

  const todayIso = todayIsoInTz(timezone);
  const thisWeek = isoWeekKey(todayIso);
  const lastWeek = toIsoDate(addDays(new Date(thisWeek + 'T00:00:00Z'), -7));
  const prevWeek = toIsoDate(addDays(new Date(thisWeek + 'T00:00:00Z'), -7));
  const prev2Week = toIsoDate(addDays(new Date(thisWeek + 'T00:00:00Z'), -14));
  const since28 = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -28));
  const since7 = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -7));
  const since30 = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -30));

  const buildQuery = (select: string) => {
    let q = supabase
      .from('profiles')
      .select(select)
      .eq('role', 'client')
      .gte('daily_logs.log_date', since28)
      .gte('nutrition_feedback.log_date', since7)
      .gte('bookings.booking_date', prevWeek)
      .eq('bookings.status', 'booked');
    if (scope === 'mine') q = q.eq('coach_id', user.id);
    else if (scope === 'coach' && selectedCoachId) q = q.eq('coach_id', selectedCoachId);
    else if (me?.gym_id) q = q.eq('gym_id', me.gym_id);
    return q.limit(1000);
  };
  // Without migration 0087 (reviewed markers) the dashboard still loads, just with nothing
  // marked reviewed.
  const fetchMembers = async () => {
    const first = await buildQuery(SELECT);
    if (!first.error) return first;
    return buildQuery(SELECT.replace('coach_reviews!client_id(kind, ref),', ''));
  };

  const [{ data: rows, error }, occurrences, chatOverview, activity, flagResult] = await Promise.all([
    fetchMembers(),
    getScheduleOccurrences(1, 2),
    scope === 'mine' ? getCoachChatOverview().catch(() => []) : Promise.resolve([]),
    getRecentActivity(undefined, 8).catch(() => [] as ActivityEventRow[]),
    getRedFlagReport(lastWeek).catch(() => ({ report: null, error: 'unavailable' })),
  ]);
  if (error) throw new Error(error.message);
  const members = (rows ?? []) as unknown as MemberRow[];

  const nameById: Record<string, string> = {};
  const nameOf = (m: MemberRow) => one(m.client_profiles)?.name || m.email;
  for (const m of members) nameById[m.id] = nameOf(m);
  const mine = (m: MemberRow) => m.coach_id === user.id;

  const newMembers: NewMember[] = [];
  const deletionRequests: DeletionRequestItem[] = [];
  const checkins: WeekCheckin[] = [];
  const photoReviews: PhotoReview[] = [];
  const forms: FormReview[] = [];
  const scores: ScoreToVerify[] = [];
  const toCheck: MemberToCheck[] = [];
  let sessionsAttended = 0;
  let sessionsAttendedLastWeek = 0;
  let checkinsIn = 0;
  let checkinsOf = 0;
  let newThisWeek = 0;

  for (const m of members) {
    const cp = one(m.client_profiles);
    const name = nameById[m.id];
    const logs = (m.daily_logs ?? []).filter(hasLoggedData);
    const reviewed = new Set((m.coach_reviews ?? []).map((r) => `${r.kind}|${r.ref}`));
    const onboarded = !!cp && cp.onboarding_completed_at !== null;

    if (cp?.deletion_requested_at) deletionRequests.push({ clientId: m.id, name });
    if (cp?.needs_coach_review) newMembers.push({ clientId: m.id, name, reasons: cp.review_reasons ?? [], mine: mine(m) });
    if (m.created_at.slice(0, 10) >= thisWeek) newThisWeek += 1;

    // Weekly check-ins: the previous two completed weeks with anything logged, not yet reviewed.
    const daysIn = (weekStart: string) => {
      const end = toIsoDate(addDays(new Date(weekStart + 'T00:00:00Z'), 6));
      return logs.filter((l) => l.log_date >= weekStart && l.log_date <= end).length;
    };
    for (const weekStart of [prevWeek, prev2Week]) {
      const days = daysIn(weekStart);
      if (days > 0 && !reviewed.has(`week|${weekStart}`)) checkins.push({ clientId: m.id, name, weekStart, days, mine: mine(m) });
    }

    // Check-ins submitted this week (progress through the week) out of members who've onboarded.
    if (onboarded) {
      checkinsOf += 1;
      if (daysIn(thisWeek) > 0) checkinsIn += 1;
    }

    // Meal photos with no feedback or review yet (photo diary members, last 7 days).
    if (cp?.nutrition_tracking_mode === 'photo_diary') {
      const fed = new Set((m.nutrition_feedback ?? []).map((f) => f.log_date));
      const dates: string[] = [];
      let photos = 0;
      for (const l of m.daily_logs ?? []) {
        const n = l.food_photo_entries?.length ?? 0;
        if (n === 0 || l.log_date < since7) continue;
        if (reviewed.has(`diary_day|${l.log_date}`) || fed.has(l.log_date)) continue;
        dates.push(l.log_date);
        photos += n;
      }
      if (dates.length > 0) photoReviews.push({ clientId: m.id, name, dates: dates.sort(), photos, mine: mine(m) });
    }

    // Completed forms waiting for a look (last 30 days).
    for (const f of m.form_assignments ?? []) {
      if (!f.completed_at || f.completed_at.slice(0, 10) < since30) continue;
      if (reviewed.has(`form|${f.id}`)) continue;
      forms.push({ clientId: m.id, name, assignmentId: f.id, formName: one(f.form_templates)?.name ?? 'Form', completedAt: f.completed_at, mine: mine(m) });
    }

    // Peak week scores the member logged themselves where the newest score is still unverified.
    const newestByExercise = new Map<string, { self_reported: boolean | null; result_text: string | null }>();
    for (const r of [...(m.big_dog_results ?? [])].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
      if (!newestByExercise.has(r.exercise_key)) newestByExercise.set(r.exercise_key, r);
    }
    for (const [key, r] of newestByExercise) {
      if (r.self_reported) {
        scores.push({ clientId: m.id, name, exercise: EXERCISES.find((e) => e.key === key)?.name ?? key, result: r.result_text, mine: mine(m) });
      }
    }

    for (const b of m.bookings ?? []) {
      if (!b.attended) continue;
      if (b.booking_date >= thisWeek) sessionsAttended += 1;
      else sessionsAttendedLastWeek += 1;
    }

    // Members worth a conversation, and why.
    if (!onboarded) continue;
    const reasons: MemberToCheck['reasons'] = [];
    let detail = '';
    const lastLog = logs.map((l) => l.log_date).sort().at(-1) ?? null;
    const sinceDays = lastLog ? Math.round((new Date(todayIso).getTime() - new Date(lastLog).getTime()) / 86400000) : null;
    const memberForDays = Math.round((new Date(todayIso).getTime() - new Date(m.created_at.slice(0, 10)).getTime()) / 86400000);
    const threshold = Math.max(5, cp?.checkin_reminder_days ?? 3);
    if (sinceDays != null ? sinceDays >= threshold : memberForDays >= threshold) {
      reasons.push({ kind: 'quiet', label: sinceDays != null ? `${sinceDays} days quiet` : 'Never logged' });
      detail = lastLog ? `Last log ${new Date(lastLog + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}` : 'No logs yet';
    }
    if (memberForDays > 14 && daysIn(prevWeek) === 0 && !reasons.some((r) => r.kind === 'quiet')) {
      reasons.push({ kind: 'missed', label: 'Missed last week' });
      detail = detail || 'No check-in days last week';
    }
    const balance = one(m.credits_balance)?.balance ?? 0;
    const activeMembership = (m.client_memberships ?? []).find((c) => c.ended_at === null);
    if (activeMembership && (one(activeMembership.membership_packages)?.credits_per_week ?? 0) > 0 && balance <= 1) {
      reasons.push({ kind: 'credits', label: balance <= 0 ? 'Out of credits' : '1 credit left' });
      detail = detail || 'Weekly allowance used up';
    }
    const weights = logs.filter((l) => l.bodyweight != null).sort((a, b) => (a.log_date < b.log_date ? -1 : 1)).map((l) => l.bodyweight as number);
    if (weights.length >= 6 && isPlateaued(weights)) {
      reasons.push({ kind: 'stalled', label: 'Weight stalled' });
      detail = detail || `${weights.length} weigh-ins, no change`;
    }
    if (reasons.length > 0) toCheck.push({ clientId: m.id, name, reasons, detail });
  }

  toCheck.sort((a, b) => b.reasons.length - a.reasons.length || (a.reasons[0].kind === 'quiet' ? -1 : 1));

  // Group scores per person for the summary row; keep the rows for the expanded list.
  const unreadThreads: UnreadThread[] = (chatOverview as { client_id: string; client_name: string; unread_count: number }[])
    .filter((c) => c.unread_count > 0)
    .map((c) => ({ clientId: c.client_id, name: c.client_name, unread: c.unread_count }));

  // Class numbers for this week so far (gym-wide: classes belong to the gym, not a coach).
  const weekSoFar = occurrences.filter((o) => o.date >= thisWeek && o.date <= todayIso);
  const capacity = weekSoFar.reduce((n, o) => n + o.capacity, 0);
  const booked = weekSoFar.reduce((n, o) => n + o.bookedCount, 0);

  return {
    scope,
    isAdmin,
    coaches,
    selectedCoachId,
    userId: user.id,
    todayIso,
    timezone,
    firstName: (me?.display_name ?? '').trim().split(/\s+/)[0] || null,
    redFlags: flagResult.report
      ? {
          weekStart: lastWeek,
          flagged: flagResult.report.entries.length,
          toContact: flagResult.report.entries.filter((e) => e.contacted === 'no').length,
        }
      : null,
    occurrences,
    unreadThreads,
    deletionRequests,
    newMembers,
    checkins,
    photoReviews,
    forms,
    scores,
    toCheck,
    stats: {
      sessionsAttended,
      sessionsAttendedLastWeek,
      avgFillPct: capacity > 0 ? Math.round((booked / capacity) * 100) : null,
      checkinsIn,
      checkinsOf,
      newMembers: newThisWeek,
      membersTotal: members.length,
    },
    activity,
    nameById,
  };
}

// ---- Business overview (gym owners and managers) ----

export interface BusinessOverview {
  members: number;
  onPlan: number;
  noPlan: { clientId: string; name: string }[];
  newThisMonth: number;
  attendedThisMonth: number;
  plans: { name: string; count: number }[];
  team: {
    coachId: string;
    name: string;
    members: number;
    checkedIn: number;
    eligible: number;
    quiet: number;
    toReview: number;
  }[];
}

// Gym-wide numbers for the owner/manager: who's on which plan, who has no plan (needs setting up),
// and how each coach's members are getting on this week. Returns null for a non-admin.
export async function getBusinessOverview(): Promise<BusinessOverview | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: me } = await supabase.from('profiles').select('gym_id, is_gym_admin').eq('id', user.id).maybeSingle();
  if (!me?.is_gym_admin || !me.gym_id) return null;

  const todayIso = todayIsoInTz(DEFAULT_TIMEZONE);
  const thisWeek = isoWeekKey(todayIso);
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const since14 = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -14));

  const [{ data: coachRows }, { data: rows, error }] = await Promise.all([
    supabase.from('profiles').select('id, email, display_name').eq('role', 'coach').eq('gym_id', me.gym_id),
    supabase
      .from('profiles')
      .select(
        `id, email, coach_id, created_at,
         client_profiles(name, onboarding_completed_at, needs_coach_review),
         client_memberships!client_id(ended_at, membership_packages(name)),
         daily_logs(log_date, protein, carbs, fat, fibre, water, bodyweight, steps, sleep, gym_session, hunger, energy, motivation, stress, period_started, notes),
         bookings!client_id(booking_date, attended)`
      )
      .eq('role', 'client')
      .eq('gym_id', me.gym_id)
      .gte('daily_logs.log_date', since14)
      .gte('bookings.booking_date', monthStart)
      .limit(1000),
  ]);
  if (error) throw new Error(error.message);

  const coachName = new Map((coachRows ?? []).map((c) => [c.id, c.display_name || c.email]));
  const team = new Map<string, BusinessOverview['team'][number]>();
  for (const c of coachRows ?? []) {
    team.set(c.id, { coachId: c.id, name: coachName.get(c.id) ?? 'Coach', members: 0, checkedIn: 0, eligible: 0, quiet: 0, toReview: 0 });
  }
  const planCounts = new Map<string, number>();
  const noPlan: BusinessOverview['noPlan'] = [];
  let onPlan = 0;
  let newThisMonth = 0;
  let attended = 0;

  type Row = {
    id: string;
    email: string;
    coach_id: string | null;
    created_at: string;
    client_profiles: ProfileRel<{ name: string | null; onboarding_completed_at: string | null; needs_coach_review: boolean | null }>;
    client_memberships: { ended_at: string | null; membership_packages: ProfileRel<{ name: string }> }[] | null;
    daily_logs: DailyLogRow[] | null;
    bookings: { booking_date: string; attended: boolean | null }[] | null;
  };
  for (const m of (rows ?? []) as unknown as Row[]) {
    const cp = one(m.client_profiles);
    const name = cp?.name || m.email;
    const open = (m.client_memberships ?? []).find((c) => c.ended_at === null);
    if (open) {
      onPlan += 1;
      const planName = one(open.membership_packages)?.name ?? 'Plan';
      planCounts.set(planName, (planCounts.get(planName) ?? 0) + 1);
    } else {
      noPlan.push({ clientId: m.id, name });
    }
    if (m.created_at.slice(0, 10) >= monthStart) newThisMonth += 1;
    attended += (m.bookings ?? []).filter((b) => b.attended).length;

    const t = m.coach_id ? team.get(m.coach_id) : undefined;
    if (!t) continue;
    t.members += 1;
    if (cp?.needs_coach_review) t.toReview += 1;
    const logs = (m.daily_logs ?? []).filter(hasLoggedData);
    if (cp?.onboarding_completed_at !== null && cp) {
      t.eligible += 1;
      if (logs.some((l) => l.log_date >= thisWeek)) t.checkedIn += 1;
      const last = logs.map((l) => l.log_date).sort().at(-1);
      const days = last ? Math.round((new Date(todayIso).getTime() - new Date(last).getTime()) / 86400000) : 99;
      if (days >= 7) t.quiet += 1;
    }
  }

  return {
    members: (rows ?? []).length,
    onPlan,
    noPlan,
    newThisMonth,
    attendedThisMonth: attended,
    plans: [...planCounts.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count),
    team: [...team.values()].sort((a, b) => b.members - a.members),
  };
}
