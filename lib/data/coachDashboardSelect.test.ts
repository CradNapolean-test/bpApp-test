import { describe, expect, it } from 'vitest';
import { MEMBERS_SELECT, MEMBERS_SELECT_BEFORE_0087, MEMBERS_SELECT_BEFORE_0166 } from './coachDashboardSelect';
import { followUpOfRow, type FollowUpRow } from './followUps';
import { hasFoodLogged, hasLoggedData } from '@/lib/utils/dailyLog';
import { photoCount } from '@/lib/coachDashboardRules';
import type { DailyLogRow } from './types';

// The dashboard casts its members rows to MemberRow, so nothing but this file compares the select with what is read from the rows. A
// column dropped from the select reads as undefined: a notes-only day would stop counting as logged, a no-show as a missed class.

interface Embed {
  columns: Set<string>;
  relations: Map<string, Embed>;
}

// A PostgREST select as a tree: `bookings!client_id(...)` is the row's `bookings`, `class:classes(...)` its `class`.
function parseSelect(select: string): Embed {
  let i = 0;
  const list = (): Embed => {
    const node: Embed = { columns: new Set(), relations: new Map() };
    while (i < select.length && select[i] !== ')') {
      let token = '';
      while (i < select.length && !',()'.includes(select[i])) token += select[i++];
      const name = token.trim();
      if (select[i] === '(') {
        i += 1;
        const child = list();
        i += 1;
        node.relations.set(name.includes(':') ? name.split(':')[0] : name.split('!')[0], child);
      } else if (name) node.columns.add(name);
      if (select[i] === ',') i += 1;
    }
    return node;
  };
  return list();
}

// Every path the select gives a row, e.g. "bookings.class.start_time".
function paths(embed: Embed, prefix = ''): string[] {
  return [...[...embed.columns].map((c) => prefix + c), ...[...embed.relations].flatMap(([k, child]) => [prefix + k, ...paths(child, `${prefix}${k}.`)])];
}

// A row with exactly what the select gives it (each column null unless `values` says otherwise, each relation one row of its own) that
// notes every key read from it, and every key read that the select does not give.
function rowFromSelect(embed: Embed, seen: { read: Set<string>; missing: Set<string> }, values: Record<string, unknown> = {}, prefix = ''): Record<string, unknown> {
  const target: Record<string, unknown> = {};
  for (const c of embed.columns) target[c] = c in values ? values[c] : null;
  for (const [k, child] of embed.relations) target[k] = [rowFromSelect(child, seen, values, `${prefix}${k}.`)];
  return new Proxy(target, {
    get(t, key) {
      if (typeof key === 'string') {
        seen.read.add(prefix + key);
        if (!(key in t)) seen.missing.add(prefix + key);
      }
      return Reflect.get(t, key);
    },
  });
}

const select = parseSelect(MEMBERS_SELECT);
const dailyLogs = select.relations.get('daily_logs')!;
const newSeen = () => ({ read: new Set<string>(), missing: new Set<string>() });

describe('coach dashboard members select', () => {
  it('gives each logged day every column hasLoggedData and hasFoodLogged look at', () => {
    // All null, so neither stops early: each reads every column it checks.
    for (const check of [hasLoggedData, hasFoodLogged]) {
      const seen = newSeen();
      check(rowFromSelect(dailyLogs, seen) as unknown as DailyLogRow);
      expect([...seen.missing]).toEqual([]);
    }
    const seen = newSeen();
    hasLoggedData(rowFromSelect(dailyLogs, seen) as unknown as DailyLogRow);
    expect([...seen.read]).toEqual(expect.arrayContaining(['notes', 'period_started', 'gym_session', 'bodyweight']));
  });

  it('gives each day its meal photos as a count', () => {
    const seen = newSeen();
    const day = rowFromSelect(dailyLogs, seen) as { food_photo_entries: { count?: number | null }[] };
    photoCount(day.food_photo_entries);
    expect(seen.read).toContain('food_photo_entries.count');
    expect([...seen.missing]).toEqual([]);
  });

  it('gives the follow-up list every column it reads, on the member and on their logged days', () => {
    const seen = newSeen();
    const values = { created_at: '2026-01-05T09:00:00Z', log_date: '2026-11-10', booking_date: '2026-11-10' };
    const member = rowFromSelect(select, seen, values);
    followUpOfRow(member as unknown as FollowUpRow, [rowFromSelect(dailyLogs, seen, values, 'daily_logs.') as unknown as DailyLogRow], '2026-11-20');
    expect([...seen.missing]).toEqual([]);
    expect([...seen.read]).toEqual(
      expect.arrayContaining(['bookings.no_show', 'bookings.booking_date', 'daily_logs.bodyweight', 'client_profiles.checkin_reminder_days', 'credits_balance.balance'])
    );
  });

  it("gives the dashboard's own lists every column they read (MemberRow in coachDashboard.ts)", () => {
    const loopReads = [
      'id', 'email', 'coach_id', 'created_at',
      'client_profiles.name', 'client_profiles.nutrition_tracking_mode', 'client_profiles.onboarding_completed_at',
      'client_profiles.needs_coach_review', 'client_profiles.review_reasons', 'client_profiles.checkin_reminder_days',
      'client_profiles.checkin_reminders_stopped_at',
      'client_memberships.id', 'client_memberships.started_at', 'client_memberships.scheduled_end', 'client_memberships.ended_at',
      'client_memberships.membership_packages.credits_per_week', 'client_memberships.membership_packages.duration_weeks',
      'client_memberships.membership_packages.name',
      'daily_logs.log_date', 'daily_logs.food_photo_entries.count',
      'nutrition_feedback.log_date',
      'coach_reviews.kind', 'coach_reviews.ref',
      'form_assignments.id', 'form_assignments.completed_at', 'form_assignments.form_templates.name',
      'bookings.booking_date', 'bookings.attended', 'bookings.no_show', 'bookings.class.start_time',
      'credits_balance.balance', 'membership_holds.id',
      'big_dog_results.exercise_key', 'big_dog_results.self_reported', 'big_dog_results.result_text', 'big_dog_results.result_value',
      'big_dog_results.created_at',
      'workout_programs.id', 'workout_programs.name', 'workout_programs.start_date', 'workout_programs.week_one',
      'workout_programs.workout_program_days.week_num',
    ];
    expect(paths(select)).toEqual(expect.arrayContaining(loopReads));
  });

  it('drops only what each older database lacks', () => {
    const full = paths(select);
    const before0166 = paths(parseSelect(MEMBERS_SELECT_BEFORE_0166));
    const before0087 = paths(parseSelect(MEMBERS_SELECT_BEFORE_0087));
    expect(full.filter((p) => !before0166.includes(p))).toEqual(['client_profiles.checkin_reminders_stopped_at']);
    expect(before0166.filter((p) => !before0087.includes(p))).toEqual(['coach_reviews', 'coach_reviews.kind', 'coach_reviews.ref']);
    expect(before0087.every((p) => before0166.includes(p)) && before0166.every((p) => full.includes(p))).toBe(true);
  });
});
