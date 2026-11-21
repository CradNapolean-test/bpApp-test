// Gym programmes (owner's list item 7, migration 0172). A programme started for everyone at a gym is the gym's programme for a length fixed
// when it starts (1 to 12 weeks; owner's decision 21 Nov 2026: 4-week blocks, a 3-week block and a 1-week peak week make the 12-week
// programme). Week 1 is the Monday of the start date's week, so it runs to the Sunday of its last week whatever happens to its template.
// Members who join the gym later get it when they finish setting up their profile, on the gym's current week (same workout as everyone
// that day, the gym calendar of D9), until its last day or until a gym admin ends it. A member whose own programme runs over the same
// dates is not given it automatically: their coach decides. These are the words around it, kept as plain functions so they can be tested.
import { DEFAULT_TIMEZONE, addDays, formatLongDate, formatShortDate, toIsoDate } from './utils/dates';
import { shortGymName } from './gymNames';
import { membersLabel } from './rolloutPlan';

export interface GymProgrammeWaiting {
  clientId: string;
  name: string;
  // 'own_programme': another programme of theirs runs over the same dates; 'failed': it could not be given when they finished setting up.
  reason: 'own_programme' | 'failed';
  otherProgramId: string | null;
  otherProgram: string | null;
  // That programme's start date and last day (YYYY-MM-DD). It may not have started yet.
  otherStarts: string | null;
  otherUntil: string | null;
  // Every programme of theirs "Give it to them" moves to the Monday after the gym programme (one that starts between today and its last
  // day), soonest first. null when the row has no list.
  moves: { id: string; name: string; starts: string }[] | null;
}

export interface GymProgramme {
  rolloutId: string;
  templateId: string;
  programName: string;
  gymName: string;
  startDate: string;
  // Week 1's Monday: the gym calendar everyone on it follows.
  weekOne: string;
  // Its length, fixed when it started (only a gym admin changes it).
  weeks: number;
  // The Sunday of its last week.
  lastDay: string;
  // The gym's today (YYYY-MM-DD).
  today: string | null;
  currentWeek: number;
  // New members get it (not ended, last day not passed).
  isOpen: boolean;
  endedAt: string | null;
  // Members still on it, and how many of them joined after it started.
  members: number;
  joinedLater: number;
  waiting: GymProgrammeWaiting[];
}

export type WaitingOutcome = 'given' | 'has_it' | 'kept';

export const MIN_GYM_PROGRAMME_WEEKS = 1;
export const MAX_GYM_PROGRAMME_WEEKS = 12;

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isoPlus = (iso: string, days: number) => toIsoDate(addDays(new Date(`${iso}T00:00:00Z`), days));

// One row of gym_programmes(); null when it is not the shape expected.
export function readGymProgramme(row: unknown): GymProgramme | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;
  const rolloutId = str(r.rollout_id);
  const templateId = str(r.template_id);
  const weekOne = str(r.week_one);
  const lastDay = str(r.last_day);
  if (!rolloutId || !templateId || !weekOne || !lastDay) return null;
  const waiting = (Array.isArray(r.waiting) ? r.waiting : [])
    .map((w): GymProgrammeWaiting | null => {
      if (!w || typeof w !== 'object') return null;
      const x = w as Record<string, unknown>;
      const clientId = str(x.client_id);
      if (!clientId) return null;
      const moves = Array.isArray(x.moves)
        ? x.moves
            .map((m): { id: string; name: string; starts: string } | null => {
              if (!m || typeof m !== 'object') return null;
              const y = m as Record<string, unknown>;
              const id = str(y.id);
              const starts = str(y.starts);
              return id && starts ? { id, name: str(y.name) ?? 'Their programme', starts } : null;
            })
            .filter((m): m is { id: string; name: string; starts: string } => m !== null)
        : null;
      return {
        clientId,
        name: str(x.name) ?? 'A member',
        reason: x.reason === 'failed' ? 'failed' : 'own_programme',
        otherProgramId: str(x.other_program_id),
        otherProgram: str(x.other_program),
        otherStarts: str(x.other_starts),
        otherUntil: str(x.other_until),
        moves,
      };
    })
    .filter((w): w is GymProgrammeWaiting => w !== null);
  return {
    rolloutId,
    templateId,
    programName: str(r.program_name) ?? 'Gym programme',
    gymName: str(r.gym_name) ?? 'the gym',
    startDate: str(r.start_date) ?? weekOne,
    weekOne,
    weeks: num(r.weeks),
    lastDay,
    today: str(r.today),
    currentWeek: num(r.current_week),
    isOpen: r.is_open === true,
    endedAt: str(r.ended_at),
    members: num(r.members),
    joinedLater: num(r.joined_later),
    waiting,
  };
}

const gymOf = (p: Pick<GymProgramme, 'gymName'>) => shortGymName(p.gymName);
const day = (iso: string) => formatLongDate(iso, { weekday: 'short' });

export function weeksLabel(weeks: number): string {
  return `${weeks} week${weeks === 1 ? '' : 's'}`;
}

// The length Start a programme offers first: the template's weeks, within 1 to 12.
export function defaultGymProgrammeWeeks(templateWeeks: number): number {
  return Math.min(MAX_GYM_PROGRAMME_WEEKS, Math.max(MIN_GYM_PROGRAMME_WEEKS, Math.floor(templateWeeks) || MIN_GYM_PROGRAMME_WEEKS));
}

// Week 1 is the Monday of the start date's week (as week_one, migration 0167); the last day is the Sunday of its last week.
export function gymProgrammeDates(startDate: string, weeks: number): { weekOne: string; lastDay: string } {
  const isoDow = new Date(`${startDate}T00:00:00Z`).getUTCDay() || 7;
  const weekOne = isoPlus(startDate, 1 - isoDow);
  return { weekOne, lastDay: isoPlus(weekOne, 7 * weeks - 1) };
}

// "Mon 9 Nov - Sun 29 Nov"
export function dateRangeLabel(from: string, to: string): string {
  return `${day(from)} - ${day(to)}`;
}

// "Mon 30 Nov - Sun 6 Dec, 1 week": the dates a start for everyone will run.
export function gymProgrammeRunsLabel(startDate: string, weeks: number): string {
  const { weekOne, lastDay } = gymProgrammeDates(startDate, weeks);
  return `${dateRangeLabel(weekOne, lastDay)}, ${weeksLabel(weeks)}`;
}

// "Gym programme: Salford Quays · Mon 9 Nov - Sun 29 Nov (3 weeks) · 16 members"
export function gymProgrammeLabel(p: Pick<GymProgramme, 'gymName' | 'weekOne' | 'lastDay' | 'weeks' | 'members'>): string {
  return `Gym programme: ${gymOf(p)} · ${dateRangeLabel(p.weekOne, p.lastDay)} (${weeksLabel(p.weeks)}) · ${membersLabel(p.members)}`;
}

// When the template doesn't have the gym programme's weeks: "2 of 3 weeks built" (members reach a week with nothing in it), or "only
// weeks 1-3 run for the gym" (its later weeks are past the gym programme's last day). null when they match.
export function builtWeeksNote(weeks: number, builtWeeks: number): string | null {
  if (weeks <= 0 || builtWeeks === weeks) return null;
  if (builtWeeks < weeks) return `${builtWeeks} of ${weeksLabel(weeks)} built`;
  return weeks === 1 ? 'only week 1 runs for the gym' : `only weeks 1-${weeks} run for the gym`;
}

// The line under it: where everyone is, and whether new members still get it.
export function gymProgrammeStatus(p: GymProgramme): string {
  const week = p.weeks > 0 && p.currentWeek > 0 ? `Week ${Math.min(p.currentWeek, p.weeks)} of ${p.weeks}. ` : '';
  const later = p.joinedLater > 0 ? ` ${p.joinedLater} joined later.` : '';
  if (p.isOpen) {
    return `${week}Members who join ${gymOf(p)} get it when they finish setting up their profile, on the gym’s current week, until ${day(p.lastDay)}.${later}`;
  }
  const ended = p.endedAt ? `Ended ${formatShortDate(p.endedAt, DEFAULT_TIMEZONE)}` : 'Ended';
  return `${week}${ended}: new members don’t get it. The members on it keep it to ${day(p.lastDay)}.${later}`;
}

export function endGymProgrammeConfirmation(p: GymProgramme): { title: string; body: string; confirmLabel: string } {
  const gym = gymOf(p);
  return {
    title: `End the gym programme at ${gym}?`,
    body:
      `Members who join ${gym} from now on won’t get “${p.programName}”. ` +
      `The ${membersLabel(p.members)} on it keep it to ${day(p.lastDay)}, and nothing they’ve logged changes. ` +
      `To give the gym a programme again, start one for everyone.`,
    confirmLabel: 'End gym programme',
  };
}

// A gym admin gives it a new length (change_gym_programme). One that would end before today ends it today instead (as the database does).
export function changeLengthConfirmation(p: GymProgramme, weeks: number): { title: string; body: string; confirmLabel: string; endsToday: boolean } {
  const gym = gymOf(p);
  const { lastDay } = gymProgrammeDates(p.startDate, weeks);
  if (p.today && lastDay < p.today) {
    return {
      title: `End “${p.programName}” today?`,
      body:
        `${weeksLabel(weeks)} would have ended it on ${day(lastDay)}, so it ends today: members who join ${gym} from now on won’t get it. ` +
        `The members on it keep it, and nothing they’ve logged changes.`,
      confirmLabel: 'End it today',
      endsToday: true,
    };
  }
  return {
    title: `Make “${p.programName}” ${weeksLabel(weeks)}?`,
    body:
      `It runs ${dateRangeLabel(p.weekOne, lastDay)}, and members who join ${gym} get it until ${day(lastDay)}. ` +
      `Nothing changes for the members on it.`,
    confirmLabel: 'Change length',
    endsToday: false,
  };
}

// A start for everyone that is running or scheduled, for Start a programme: when it runs.
export interface GymProgrammeSpan {
  name: string;
  startDate: string;
  lastDay: string;
}

type PendingStart = { audience: 'all' | 'selected'; program_name: string; start_date: string; weeks: number | null };

// The gym programme running today (while it is open) and every start for everyone not given out yet, soonest first.
export function gymProgrammeSpans(current: GymProgramme | undefined, pending: PendingStart[]): GymProgrammeSpan[] {
  const spans: GymProgrammeSpan[] = [];
  if (current?.isOpen) spans.push({ name: current.programName, startDate: current.startDate, lastDay: current.lastDay });
  for (const r of pending) {
    if (r.audience !== 'all' || !r.weeks) continue;
    spans.push({ name: r.program_name, startDate: r.start_date, lastDay: gymProgrammeDates(r.start_date, r.weeks).lastDay });
  }
  return spans.sort((a, b) => a.startDate.localeCompare(b.startDate));
}

// Where the next block starts by default: the Monday after the last day of the one that runs last (the latest start, which takes over
// from the ones before it), so blocks follow on with no gap or overlap. null when the gym has none running or scheduled.
export function followOnStart(spans: GymProgrammeSpan[], today: string): { startDate: string; after: GymProgrammeSpan } | null {
  const last = spans[spans.length - 1];
  if (!last) return null;
  const next = isoPlus(last.lastDay, 1);
  return { startDate: next < today ? today : next, after: last };
}

// "Starts Mon 30 Nov, the day after November Weeks 9-11 ends"
export function followOnLabel(f: { startDate: string; after: GymProgrammeSpan }): string {
  return `Starts ${day(f.startDate)}, the day after ${f.after.name} ends`;
}

// When the dates chosen overlap a gym programme running or scheduled: the later start takes over on its start date.
export function overlapNote(startDate: string, weeks: number, spans: GymProgrammeSpan[]): string | null {
  const { lastDay } = gymProgrammeDates(startDate, weeks);
  const notes = spans
    .map((s) => {
      if (s.startDate <= startDate && s.lastDay >= startDate) {
        return `“${s.name}” runs to ${day(s.lastDay)}: this one takes over from it on ${day(startDate)}.`;
      }
      if (s.startDate > startDate && s.startDate <= lastDay) {
        return `“${s.name}” starts ${day(s.startDate)} and takes over from this one that day.`;
      }
      return null;
    })
    .filter((n): n is string => n !== null);
  return notes.length > 0 ? notes.join(' ') : null;
}

// On the template card, so the coach sees there is something to decide without opening the template: "1 not given". null when none.
export function waitingCountLabel(p: Pick<GymProgramme, 'waiting' | 'isOpen'>): string | null {
  return p.isOpen && p.waiting.length > 0 ? `${p.waiting.length} not given` : null;
}

// "Not given to 2 members who joined"
export function waitingHeading(p: Pick<GymProgramme, 'waiting'>): string {
  return `Not given to ${membersLabel(p.waiting.length)} who joined`;
}

export function waitingReason(p: Pick<GymProgramme, 'today'>, w: GymProgrammeWaiting): string {
  if (w.reason === 'failed') return 'It couldn’t be given when they finished setting up';
  if (!w.otherProgram) return 'On their own programme';
  // Not started yet: a 1:1 programme a coach made for a new member usually starts the coming Monday.
  if (w.otherStarts && p.today && w.otherStarts > p.today) return `Their own programme “${w.otherProgram}” starts ${day(w.otherStarts)}`;
  return `On their own programme “${w.otherProgram}”${w.otherUntil ? ` until ${day(w.otherUntil)}` : ''}`;
}

// Giving it moves every programme of theirs that starts today or later, before the gym programme's last day: each would otherwise take
// over on its start date. They then start the Monday after the gym programme's last week (as _give_gym_programme does, migration 0172).
// Without the list: the programme in the way, when it starts in those dates.
function programmesMoved(p: Pick<GymProgramme, 'today' | 'lastDay'>, w: GymProgrammeWaiting): { id: string | null; name: string; starts: string }[] {
  if (w.moves) return w.moves;
  return w.otherProgram && w.otherStarts && p.today && w.otherStarts >= p.today && w.otherStarts <= p.lastDay
    ? [{ id: w.otherProgramId, name: w.otherProgram, starts: w.otherStarts }]
    : [];
}

export function giveWaitingConfirmation(p: GymProgramme, w: GymProgrammeWaiting): { title: string; body: string; confirmLabel: string } {
  const start = `It starts today on week ${p.currentWeek}, the same as everyone at ${gymOf(p)}`;
  const moved = programmesMoved(p, w);
  const otherMoved = moved.some((m) =>
    m.id && w.otherProgramId ? m.id === w.otherProgramId : m.name === w.otherProgram && m.starts === w.otherStarts
  );
  let body = `${start}.`;
  let takesOver = false;
  if (w.reason === 'own_programme' && w.otherProgram && !otherMoved) {
    if (w.otherStarts && p.today && w.otherStarts > p.today) {
      // Moved since by their coach to after the gym programme: nothing to take over from.
      body = `${start}. Their own programme “${w.otherProgram}” still starts ${day(w.otherStarts)}, after the gym programme.`;
    } else {
      body = `${start}, and takes over from “${w.otherProgram}”. Their own programme and everything logged on it stay on file.`;
      takesOver = true;
    }
  }
  if (moved.length > 0) {
    const quoted = moved.map((m) => `“${m.name}”`);
    const names = quoted.length > 1 ? `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}` : quoted[0];
    const whose = takesOver ? '' : moved.length > 1 ? 'Their own programmes ' : 'Their own programme ';
    const after = day(isoPlus(p.lastDay, 1));
    body += ` ${whose}${names} ${moved.length > 1 ? 'move' : 'moves'} to start ${after}, after the gym programme.`;
  }
  return { title: `Give “${p.programName}” to ${w.name}?`, body, confirmLabel: 'Give it to them' };
}

// Deleting a template deletes its rollouts too: the gym programme it is, and the starts it has scheduled. So while it is the gym programme
// (until its last day) or a start for everyone is scheduled, only a gym admin can delete it (refused in the database too, migration 0172).
// `scheduled` is the template's rollouts not given out yet.
type ScheduledStart = { audience: 'all' | 'selected'; start_date: string };

// For a coach who isn't a gym admin: why they can't delete it. null when they can.
export function deleteTemplateRefusal(gym: Pick<GymProgramme, 'gymName' | 'lastDay'> | undefined, scheduled: ScheduledStart[]): string | null {
  if (gym) return `This template is the gym programme at ${gymOf(gym)} until ${day(gym.lastDay)}, so only a gym admin can delete it.`;
  const forAll = scheduled.filter((r) => r.audience === 'all').sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (forAll.length > 0) return `This template is set to start for everyone at the gym on ${day(forAll[0].start_date)}, so only a gym admin can delete it.`;
  return null;
}

export function deleteTemplateConfirmation(
  name: string,
  gym: Pick<GymProgramme, 'gymName' | 'isOpen'> | undefined,
  scheduled: ScheduledStart[]
): { title: string; body: string } {
  let body = 'This removes every week, day and exercise in the template. Clients who already started this programme keep their own copy.';
  if (gym?.isOpen) body += ` It’s the gym programme at ${gymOf(gym)}, so members who join from now on won’t get it.`;
  const starts = [...scheduled].sort((a, b) => a.start_date.localeCompare(b.start_date));
  if (starts.length === 1) {
    body += ` Its start on ${day(starts[0].start_date)}${starts[0].audience === 'all' ? ' for everyone at the gym' : ''} is cancelled.`;
  } else if (starts.length > 1) {
    body += ` Its ${starts.length} scheduled starts are cancelled.`;
  }
  return { title: `Delete “${name}”?`, body };
}

export function waitingDone(outcome: WaitingOutcome, name: string): string {
  if (outcome === 'given') return `${name} is on it from today`;
  if (outcome === 'has_it') return `${name} already has it`;
  return `${name} keeps their own programme`;
}
