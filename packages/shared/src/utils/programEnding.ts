// When a member's workout programme ends, and what the coach and the member are told about it (TR3, CV16).
// Owner decision D2 (6 Nov 2026): the coach gets a To do 7 days before a member's programme ends, and the member sees
// "Last week of this programme: your coach is setting up the next one". Programmes used to run out with no warning: members
// were shown "this block has finished" with nothing next, and the coach's dashboard showed them as fine.
//
// The end is read from the same programme and the same week count as resolveActiveProgram (./checkin.ts): weeks
// count from the copy's own start date, so the last day is start + 7 x weeks - 1, and resolveActiveProgram stops finding a
// week the day after it. Whether a gym-wide programme should follow one gym calendar instead (TR19) is not decided; if
// that changes, it changes in checkin.ts and this follows.
//
// Twin of lib/utils/programEnding.ts (the web): keep the two the same.

import { addDays, daysBetween, toIsoDate } from './dates';
import { latestStartedProgram, programWeekCount } from './checkin';

// The last 7 days of a programme (its last week): the coach's To do and the member's notice both start here.
export const ENDING_SOON_DAYS = 7;
// After the last day, how long the coach's To do keeps a member with nothing scheduled next, and how long the member is told
// their coach is setting the next one up. After that it drops off the To do, so a member who has stopped following a
// programme doesn't stay on it for good, and the member's screen stops promising one.
export const ENDED_FOLLOW_UP_DAYS = 28;

// Only what the end needs, so the coach dashboard can pass its slim rows (week numbers, no exercises).
export interface ProgrammeForEnding {
  id: string;
  name: string;
  start_date: string | null;
  workout_program_days: { week_num: number }[];
}

export interface ProgrammeEnd {
  programId: string;
  programName: string;
  totalWeeks: number;
  // The programme's last day (the Sunday of its last week for one that starts on a Monday).
  lastDay: string;
  // Days from today to the last day: 0 = today is the last day, negative once it has finished (-1 = finished yesterday).
  daysLeft: number;
  // The earliest programme starting after today, when one is scheduled.
  nextStart: string | null;
}

export type ProgrammeEndStage = 'running' | 'last_week' | 'ended';

// The end of the programme the member is on now (or was on last), or null when there's nothing to count: no programme with a
// start date that has arrived, or one with no workouts in it yet.
export function programmeEnd(programs: ProgrammeForEnding[], todayIso: string): ProgrammeEnd | null {
  const program = latestStartedProgram(programs, todayIso);
  if (!program) return null;
  const totalWeeks = programWeekCount(program);
  if (totalWeeks <= 0) return null;
  const lastDay = toIsoDate(addDays(new Date(`${program.start_date}T00:00:00Z`), totalWeeks * 7 - 1));
  const nextStart =
    programs
      .map((p) => p.start_date)
      .filter((d): d is string => d != null && d > todayIso)
      .sort()[0] ?? null;
  return { programId: program.id, programName: program.name, totalWeeks, lastDay, daysLeft: daysBetween(todayIso, lastDay), nextStart };
}

export function programmeEndStage(end: ProgrammeEnd): ProgrammeEndStage {
  if (end.daysLeft >= ENDING_SOON_DAYS) return 'running';
  return end.daysLeft >= 0 ? 'last_week' : 'ended';
}

// The coach's "Programmes ending" To do: the programme ends within 7 days, or finished in the last 28, and nothing is
// scheduled after it. It clears itself once the coach schedules the next programme.
export function needsNextProgramme(end: ProgrammeEnd | null): end is ProgrammeEnd {
  if (!end || end.nextStart) return false;
  return end.daysLeft < ENDING_SOON_DAYS && end.daysLeft >= -ENDED_FOLLOW_UP_DAYS;
}

// One line for the coach: "Last day Sun 8 Nov, nothing scheduled next", "Finished Sun 1 Nov, nothing scheduled next".
// `fmt` formats an ISO date for display.
export function coachProgrammeEndLine(end: ProgrammeEnd, fmt: (iso: string) => string): string {
  const stage = programmeEndStage(end);
  const when =
    stage === 'ended' ? `Finished ${fmt(end.lastDay)}` : end.daysLeft === 0 ? 'Last day today' : stage === 'last_week' ? `Last day ${fmt(end.lastDay)}` : `Ends ${fmt(end.lastDay)}`;
  return end.nextStart ? `${when} · next starts ${fmt(end.nextStart)}` : `${when}, nothing scheduled next`;
}

export interface ProgrammeNotice {
  stage: 'last_week' | 'ended';
  text: string;
  detail: string | null;
}

// What the member is told on their workout screens, or null when there's nothing to say. When the next programme is already
// scheduled, the screens' own "Next: ... starts ..." line says what comes next, so this doesn't repeat it.
export function memberProgrammeNotice(end: ProgrammeEnd | null, fmt: (iso: string) => string): ProgrammeNotice | null {
  if (!end) return null;
  const stage = programmeEndStage(end);
  if (stage === 'running') return null;
  if (stage === 'last_week') {
    if (end.nextStart) return null;
    return {
      stage,
      text: 'Last week of this programme: your coach is setting up the next one.',
      detail: end.daysLeft === 0 ? 'Today is the last day.' : `Last day ${fmt(end.lastDay)}.`,
    };
  }
  if (end.nextStart) return { stage, text: 'This programme has finished.', detail: null };
  if (end.daysLeft >= -ENDED_FOLLOW_UP_DAYS) {
    return { stage, text: 'Your programme has finished. Your coach is setting up the next one.', detail: `Finished ${fmt(end.lastDay)}.` };
  }
  return { stage, text: `Your programme finished ${fmt(end.lastDay)}.`, detail: 'Message your coach about the next one.' };
}
