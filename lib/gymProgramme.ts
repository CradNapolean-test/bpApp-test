// Gym programmes (owner's list item 7, migration 0172). A programme started for everyone at a gym is the gym's programme: members who join
// the gym later get it when they finish setting up their profile, on the gym's current week (owner's decision: same workout as everyone that
// day, the gym calendar of D9), until its last week ends or a gym admin ends it. A member whose own programme runs over the same dates is
// not given it automatically: their coach decides. These are the words around it on the template, kept as plain functions so they can be
// tested.
import { DEFAULT_TIMEZONE, addDays, formatLongDate, formatShortDate, toIsoDate } from './utils/dates';
import { shortGymName } from './gymNames';
import { membersLabel } from './rolloutPlan';

export interface GymProgrammeWaiting {
  clientId: string;
  name: string;
  // 'own_programme': another programme of theirs runs over the same dates; 'failed': it could not be given when they finished setting up.
  reason: 'own_programme' | 'failed';
  otherProgram: string | null;
  // That programme's start date and last day (YYYY-MM-DD). It may not have started yet.
  otherStarts: string | null;
  otherUntil: string | null;
}

export interface GymProgramme {
  rolloutId: string;
  templateId: string;
  programName: string;
  gymName: string;
  startDate: string;
  // Week 1's Monday: the gym calendar everyone on it follows.
  weekOne: string;
  weeks: number;
  // The Sunday of its last week.
  lastDay: string;
  // The gym's today (YYYY-MM-DD); null from an older gym_programmes().
  today: string | null;
  currentWeek: number;
  // New members get it (not ended, last week not over).
  isOpen: boolean;
  endedAt: string | null;
  // Members still on it, and how many of them joined after it started.
  members: number;
  joinedLater: number;
  waiting: GymProgrammeWaiting[];
}

export type WaitingOutcome = 'given' | 'has_it' | 'kept';

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

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
      return {
        clientId,
        name: str(x.name) ?? 'A member',
        reason: x.reason === 'failed' ? 'failed' : 'own_programme',
        otherProgram: str(x.other_program),
        otherStarts: str(x.other_starts),
        otherUntil: str(x.other_until),
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

// "Gym programme: Salford Quays from 9 Nov · 16 members"
export function gymProgrammeLabel(p: Pick<GymProgramme, 'gymName' | 'weekOne' | 'members'>): string {
  return `Gym programme: ${gymOf(p)} from ${formatShortDate(p.weekOne)} · ${membersLabel(p.members)}`;
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

// Giving it moves their own programme when it starts today or later, before the gym programme's last day: it would otherwise take over on
// its start date. It then starts the Monday after the gym programme's last week (as _give_gym_programme does, migration 0172).
function movesOther(p: Pick<GymProgramme, 'today' | 'lastDay'>, w: GymProgrammeWaiting): boolean {
  return !!(w.otherStarts && p.today && w.otherStarts >= p.today && w.otherStarts <= p.lastDay);
}

export function giveWaitingConfirmation(p: GymProgramme, w: GymProgrammeWaiting): { title: string; body: string; confirmLabel: string } {
  const start = `It starts today on week ${p.currentWeek}, the same as everyone at ${gymOf(p)}`;
  let body = `${start}.`;
  if (w.reason === 'own_programme' && w.otherProgram) {
    if (movesOther(p, w)) {
      body = `${start}. Their own programme “${w.otherProgram}” moves to start ${day(toIsoDate(addDays(new Date(`${p.lastDay}T00:00:00Z`), 1)))}, after the gym programme.`;
    } else if (w.otherStarts && p.today && w.otherStarts > p.today) {
      // Moved since by their coach to after the gym programme: nothing to take over from.
      body = `${start}. Their own programme “${w.otherProgram}” still starts ${day(w.otherStarts)}, after the gym programme.`;
    } else {
      body = `${start}, and takes over from “${w.otherProgram}”. Their own programme and everything logged on it stay on file.`;
    }
  }
  return { title: `Give “${p.programName}” to ${w.name}?`, body, confirmLabel: 'Give it to them' };
}

export function waitingDone(outcome: WaitingOutcome, name: string): string {
  if (outcome === 'given') return `${name} is on it from today`;
  if (outcome === 'has_it') return `${name} already has it`;
  return `${name} keeps their own programme`;
}
