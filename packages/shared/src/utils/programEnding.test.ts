import { describe, expect, it } from 'vitest';
import { resolveActiveProgram } from './checkin';
import {
  ENDED_FOLLOW_UP_DAYS,
  coachProgrammeEndLine,
  memberProgrammeNotice,
  needsNextProgramme,
  programmeEnd,
  programmeEndStage,
  type ProgrammeForEnding,
} from './programEnding';
import type { WorkoutProgramRow } from '../data/types';

// A programme with `weeks` weeks of Monday-to-Saturday days (only the week numbers matter here).
const prog = (id: string, start_date: string | null, weeks: number): ProgrammeForEnding => ({
  id,
  name: id,
  start_date,
  workout_program_days: Array.from({ length: weeks * 6 }, (_, i) => ({ week_num: Math.floor(i / 6) + 1 })),
});
const asRow = (p: ProgrammeForEnding) =>
  ({ ...p, client_id: 'c', created_at: '2026-10-01T00:00:00Z', workout_program_days: p.workout_program_days.map((d) => ({ ...d, workout_exercises: [] })) }) as unknown as WorkoutProgramRow;
const fmt = (iso: string) => iso;

// Lucy on 6 Nov 2026 (live review CV16): "October Weeks 5-8", 3 weeks from Mon 19 Oct, nothing queued.
const lucy = prog('October Weeks 5-8', '2026-10-19', 3);

describe('programmeEnd', () => {
  it('ends on the last day of its last week, counted from its own start date', () => {
    const end = programmeEnd([lucy], '2026-11-06');
    expect(end).toMatchObject({ programName: 'October Weeks 5-8', totalWeeks: 3, lastDay: '2026-11-08', daysLeft: 2, nextStart: null });
  });

  it('agrees with resolveActiveProgram: active up to the last day, gone the day after', () => {
    for (const [start, weeks] of [['2026-10-19', 3], ['2026-10-10', 1], ['2026-10-24', 3], ['2026-02-27', 4]] as const) {
      const p = prog('p', start, weeks);
      const end = programmeEnd([p], start)!;
      const dayAfter = new Date(`${end.lastDay}T00:00:00Z`);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      const after = dayAfter.toISOString().slice(0, 10);
      expect(resolveActiveProgram([asRow(p)], end.lastDay)?.weekNum).toBe(weeks);
      expect(resolveActiveProgram([asRow(p)], after)).toBeNull();
      expect(programmeEnd([p], after)?.daysLeft).toBe(-1);
    }
  });

  it('reads the programme the member is on now, not an older one', () => {
    const old = prog('old', '2026-10-10', 1);
    expect(programmeEnd([old, lucy], '2026-11-06')?.programName).toBe('October Weeks 5-8');
  });

  it('notes the next programme when one is scheduled', () => {
    const next = prog('November', '2026-11-09', 4);
    const later = prog('December', '2026-12-07', 4);
    expect(programmeEnd([later, lucy, next], '2026-11-06')?.nextStart).toBe('2026-11-09');
  });

  it('is null with no programme, only a future one, no start date, or no workouts yet', () => {
    expect(programmeEnd([], '2026-11-06')).toBeNull();
    expect(programmeEnd([prog('soon', '2026-11-09', 3)], '2026-11-06')).toBeNull();
    expect(programmeEnd([prog('hand built', null, 3)], '2026-11-06')).toBeNull();
    expect(programmeEnd([prog('empty', '2026-10-19', 0)], '2026-11-06')).toBeNull();
  });
});

describe('programmeEndStage', () => {
  it('is the last week for the final 7 days, then ended', () => {
    // Lucy's last day is Sun 8 Nov: her last week is Mon 2 to Sun 8 Nov.
    expect(programmeEndStage(programmeEnd([lucy], '2026-11-01')!)).toBe('running');
    expect(programmeEndStage(programmeEnd([lucy], '2026-11-02')!)).toBe('last_week');
    expect(programmeEndStage(programmeEnd([lucy], '2026-11-08')!)).toBe('last_week');
    expect(programmeEndStage(programmeEnd([lucy], '2026-11-09')!)).toBe('ended');
  });
});

describe('needsNextProgramme (the coach To do)', () => {
  it('lists a programme ending within 7 days with nothing next', () => {
    expect(needsNextProgramme(programmeEnd([lucy], '2026-11-06'))).toBe(true);
    expect(needsNextProgramme(programmeEnd([lucy], '2026-11-02'))).toBe(true);
  });

  it('does not list one with more than 7 days to go', () => {
    expect(needsNextProgramme(programmeEnd([lucy], '2026-11-01'))).toBe(false);
    // ABID: 3 weeks from Sat 24 Oct, last day Fri 13 Nov: 7 days to go on 6 Nov, so it shows from 7 Nov.
    const abid = prog('October Weeks 5-8', '2026-10-24', 3);
    expect(needsNextProgramme(programmeEnd([abid], '2026-11-06'))).toBe(false);
    expect(needsNextProgramme(programmeEnd([abid], '2026-11-07'))).toBe(true);
  });

  it('lists a programme that has finished with nothing next, for 28 days', () => {
    // 3 weeks from Mon 12 Oct: last day Sun 1 Nov.
    const amy = prog('October Weeks 5-8', '2026-10-12', 3);
    expect(needsNextProgramme(programmeEnd([amy], '2026-11-06'))).toBe(true);
    expect(needsNextProgramme(programmeEnd([amy], '2026-11-29'))).toBe(true);
    expect(programmeEnd([amy], '2026-11-29')?.daysLeft).toBe(-ENDED_FOLLOW_UP_DAYS);
    expect(needsNextProgramme(programmeEnd([amy], '2026-11-30'))).toBe(false);
  });

  it('clears once the next programme is scheduled, even with a gap before it', () => {
    expect(needsNextProgramme(programmeEnd([lucy, prog('next', '2026-11-09', 4)], '2026-11-06'))).toBe(false);
    expect(needsNextProgramme(programmeEnd([lucy, prog('next', '2026-11-23', 4)], '2026-11-10'))).toBe(false);
  });

  it('clears once the next programme has started', () => {
    expect(needsNextProgramme(programmeEnd([lucy, prog('next', '2026-11-09', 4)], '2026-11-09'))).toBe(false);
  });

  it('is false with nothing to count', () => {
    expect(needsNextProgramme(null)).toBe(false);
  });
});

describe('coachProgrammeEndLine', () => {
  it('says when it ends and that nothing is next', () => {
    expect(coachProgrammeEndLine(programmeEnd([lucy], '2026-11-06')!, fmt)).toBe('Last day 2026-11-08, nothing scheduled next');
    expect(coachProgrammeEndLine(programmeEnd([lucy], '2026-11-08')!, fmt)).toBe('Last day today, nothing scheduled next');
    expect(coachProgrammeEndLine(programmeEnd([lucy], '2026-11-10')!, fmt)).toBe('Finished 2026-11-08, nothing scheduled next');
    expect(coachProgrammeEndLine(programmeEnd([lucy, prog('next', '2026-11-16', 4)], '2026-11-06')!, fmt)).toBe(
      'Last day 2026-11-08 · next starts 2026-11-16'
    );
  });
});

describe('memberProgrammeNotice', () => {
  it('says nothing while the programme has more than a week to go', () => {
    expect(memberProgrammeNotice(programmeEnd([lucy], '2026-11-01'), fmt)).toBeNull();
    expect(memberProgrammeNotice(null, fmt)).toBeNull();
  });

  it('gives the owner decision wording in the last week', () => {
    expect(memberProgrammeNotice(programmeEnd([lucy], '2026-11-06'), fmt)).toEqual({
      stage: 'last_week',
      text: 'Last week of this programme: your coach is setting up the next one.',
      detail: 'Last day 2026-11-08.',
    });
    expect(memberProgrammeNotice(programmeEnd([lucy], '2026-11-08'), fmt)?.detail).toBe('Today is the last day.');
  });

  it('says the programme has finished and the coach is setting up the next one', () => {
    expect(memberProgrammeNotice(programmeEnd([lucy], '2026-11-09'), fmt)).toEqual({
      stage: 'ended',
      text: 'Your programme has finished. Your coach is setting up the next one.',
      detail: 'Finished 2026-11-08.',
    });
  });

  it('stops promising a new programme once the coach To do has dropped off', () => {
    expect(memberProgrammeNotice(programmeEnd([lucy], '2026-12-07'), fmt)).toEqual({
      stage: 'ended',
      text: 'Your programme finished 2026-11-08.',
      detail: 'Message your coach about the next one.',
    });
  });

  it("leaves the next programme to the screen's own Next line", () => {
    const next = prog('next', '2026-11-16', 4);
    expect(memberProgrammeNotice(programmeEnd([lucy, next], '2026-11-06'), fmt)).toBeNull();
    expect(memberProgrammeNotice(programmeEnd([lucy, next], '2026-11-10'), fmt)).toEqual({ stage: 'ended', text: 'This programme has finished.', detail: null });
  });
});
