import { describe, expect, it } from 'vitest';
import {
  builtWeeksNote,
  changeLengthConfirmation,
  defaultGymProgrammeWeeks,
  deleteTemplateConfirmation,
  deleteTemplateRefusal,
  endGymProgrammeConfirmation,
  followOnLabel,
  followOnStart,
  giveWaitingConfirmation,
  gymProgrammeDates,
  gymProgrammeLabel,
  gymProgrammeRunsLabel,
  gymProgrammeSpans,
  gymProgrammeStatus,
  overlapNote,
  readGymProgramme,
  waitingCountLabel,
  waitingDone,
  waitingHeading,
  waitingReason,
  weeksLabel,
  type GymProgramme,
  type GymProgrammeWaiting,
} from './gymProgramme';

// As gym_programmes() answers on 20 Nov 2026 for Salford Quays.
const row = {
  rollout_id: 'r1',
  template_id: 't1',
  program_name: 'November Weeks 9-11',
  gym_name: 'Ballistic Performance - Salford Quays',
  start_date: '2026-11-10',
  week_one: '2026-11-09',
  weeks: 3,
  last_day: '2026-11-29',
  today: '2026-11-20',
  current_week: 2,
  is_open: true,
  ended_at: null,
  members: 16,
  joined_later: 0,
  waiting: [],
};
const gp = (over: Partial<GymProgramme> = {}): GymProgramme => ({ ...(readGymProgramme(row) as GymProgramme), ...over });
const own: GymProgrammeWaiting = {
  clientId: 'c1',
  name: 'Sam Jones',
  reason: 'own_programme',
  otherProgramId: null,
  otherProgram: 'Sam 1:1',
  otherStarts: '2026-11-16',
  otherUntil: '2026-12-06',
  moves: null,
};
// A 1:1 programme a coach made for a new member, starting the coming Monday.
const upcoming: GymProgrammeWaiting = { ...own, otherStarts: '2026-11-23', otherUntil: '2026-12-13' };

describe('reading gym_programmes()', () => {
  it('keeps every field', () => {
    expect(readGymProgramme(row)).toEqual({
      rolloutId: 'r1',
      templateId: 't1',
      programName: 'November Weeks 9-11',
      gymName: 'Ballistic Performance - Salford Quays',
      startDate: '2026-11-10',
      weekOne: '2026-11-09',
      weeks: 3,
      lastDay: '2026-11-29',
      today: '2026-11-20',
      currentWeek: 2,
      isOpen: true,
      endedAt: null,
      members: 16,
      joinedLater: 0,
      waiting: [],
    });
  });

  it('reads the waiting members and drops anything without a member', () => {
    const p = readGymProgramme({
      ...row,
      waiting: [
        { client_id: 'c1', name: 'Sam Jones', reason: 'own_programme', other_program: 'Sam 1:1', other_starts: '2026-11-16', other_until: '2026-12-06' },
        { client_id: 'c2', name: '', reason: 'failed', other_program: null, other_until: null },
        { name: 'no id' },
        null,
      ],
    });
    expect(p?.waiting).toEqual([
      own,
      { clientId: 'c2', name: 'A member', reason: 'failed', otherProgramId: null, otherProgram: null, otherStarts: null, otherUntil: null, moves: null },
    ]);
  });

  it('reads the programmes giving it would move, dropping any without an id or start', () => {
    const p = readGymProgramme({
      ...row,
      waiting: [
        {
          client_id: 'c1',
          name: 'Sam Jones',
          reason: 'own_programme',
          other_program_id: 'p1',
          other_program: 'Sam 1:1',
          other_starts: '2026-11-16',
          other_until: '2026-12-06',
          moves: [{ id: 'p2', name: 'Sam block 2', starts: '2026-11-23' }, { id: 'p3', name: '', starts: '2026-11-27' }, { id: 'p4' }, null],
        },
        { client_id: 'c2', reason: 'failed', moves: [] },
      ],
    });
    expect(p?.waiting[0].otherProgramId).toBe('p1');
    expect(p?.waiting[0].moves).toEqual([
      { id: 'p2', name: 'Sam block 2', starts: '2026-11-23' },
      { id: 'p3', name: 'Their programme', starts: '2026-11-27' },
    ]);
    expect(p?.waiting[1].moves).toEqual([]);
  });

  it('refuses a row without its rollout, template or dates', () => {
    expect(readGymProgramme(null)).toBeNull();
    expect(readGymProgramme({ ...row, rollout_id: null })).toBeNull();
    expect(readGymProgramme({ ...row, week_one: undefined })).toBeNull();
    expect(readGymProgramme({ ...row, last_day: '' })).toBeNull();
  });
});

describe('on the template', () => {
  it('names the gym (without the brand), the dates it runs, its length and the members on it', () => {
    expect(gymProgrammeLabel(gp())).toBe('Gym programme: Salford Quays · Mon 9 Nov - Sun 29 Nov (3 weeks) · 16 members');
    expect(gymProgrammeLabel(gp({ members: 1, weekOne: '2026-11-30', lastDay: '2026-12-06', weeks: 1 }))).toBe(
      'Gym programme: Salford Quays · Mon 30 Nov - Sun 6 Dec (1 week) · 1 member'
    );
  });

  it('says plainly when the template has fewer or more weeks built than the gym programme runs', () => {
    expect(builtWeeksNote(3, 3)).toBeNull();
    expect(builtWeeksNote(3, 2)).toBe('2 of 3 weeks built');
    expect(builtWeeksNote(1, 0)).toBe('0 of 1 week built');
    expect(builtWeeksNote(3, 4)).toBe('only weeks 1-3 run for the gym');
    expect(builtWeeksNote(1, 2)).toBe('only week 1 runs for the gym');
    expect(builtWeeksNote(0, 2)).toBeNull();
  });

  it('says where everyone is and until when new members get it', () => {
    expect(gymProgrammeStatus(gp())).toBe(
      'Week 2 of 3. Members who join Salford Quays get it when they finish setting up their profile, on the gym’s current week, until Sun 29 Nov.'
    );
    expect(gymProgrammeStatus(gp({ joinedLater: 2 }))).toMatch(/until Sun 29 Nov\. 2 joined later\.$/);
  });

  it('once ended, says new members don’t get it and the members on it keep it', () => {
    expect(gymProgrammeStatus(gp({ isOpen: false, endedAt: '2026-11-20T10:15:00+00:00' }))).toBe(
      'Week 2 of 3. Ended 20 Nov: new members don’t get it. The members on it keep it to Sun 29 Nov.'
    );
  });

  it('deleting the template: a coach who isn’t a gym admin is told only a gym admin can, while it is the gym programme or starts for everyone', () => {
    expect(deleteTemplateRefusal(gp(), [])).toBe('This template is the gym programme at Salford Quays until Sun 29 Nov, so only a gym admin can delete it.');
    expect(
      deleteTemplateRefusal(undefined, [
        { audience: 'selected', start_date: '2026-11-23' },
        { audience: 'all', start_date: '2026-12-07' },
        { audience: 'all', start_date: '2026-11-30' },
      ])
    ).toBe('This template is set to start for everyone at the gym on Mon 30 Nov, so only a gym admin can delete it.');
    // a start for chosen members, or nothing: they can (the confirm says what goes with it)
    expect(deleteTemplateRefusal(undefined, [{ audience: 'selected', start_date: '2026-11-23' }])).toBeNull();
    expect(deleteTemplateRefusal(undefined, [])).toBeNull();
  });

  it('deleting the template: the confirm says the gym programme stops reaching new members and its scheduled starts are cancelled', () => {
    const plain = 'This removes every week, day and exercise in the template. Clients who already started this programme keep their own copy.';
    expect(deleteTemplateConfirmation('Weeks 9-11', undefined, [])).toEqual({ title: 'Delete “Weeks 9-11”?', body: plain });
    // an older gym programme ended when this one was given out (migration 0172), so nothing older takes over
    expect(deleteTemplateConfirmation('Weeks 9-11', gp(), []).body).toBe(
      `${plain} It’s the gym programme at Salford Quays, so members who join from now on won’t get it.`
    );
    // ended early: new members don't get it either way
    expect(deleteTemplateConfirmation('Weeks 9-11', gp({ isOpen: false }), []).body).toBe(plain);
    expect(deleteTemplateConfirmation('Weeks 9-11', undefined, [{ audience: 'all', start_date: '2026-11-30' }]).body).toBe(
      `${plain} Its start on Mon 30 Nov for everyone at the gym is cancelled.`
    );
    expect(deleteTemplateConfirmation('Weeks 9-11', undefined, [{ audience: 'selected', start_date: '2026-11-23' }]).body).toBe(
      `${plain} Its start on Mon 23 Nov is cancelled.`
    );
    expect(
      deleteTemplateConfirmation('Weeks 9-11', undefined, [
        { audience: 'selected', start_date: '2026-11-23' },
        { audience: 'all', start_date: '2026-11-30' },
      ]).body
    ).toBe(`${plain} Its 2 scheduled starts are cancelled.`);
  });

  it('the end confirm names the programme, the members who keep it and that nothing logged changes', () => {
    const c = endGymProgrammeConfirmation(gp());
    expect(c.title).toBe('End the gym programme at Salford Quays?');
    expect(c.body).toBe(
      'Members who join Salford Quays from now on won’t get “November Weeks 9-11”. The 16 members on it keep it to Sun 29 Nov, and nothing they’ve logged changes. To give the gym a programme again, start one for everyone.'
    );
    expect(c.confirmLabel).toBe('End gym programme');
  });
});

describe('members it was not given to', () => {
  it('counts them and says why', () => {
    expect(waitingHeading(gp({ waiting: [own] }))).toBe('Not given to 1 member who joined');
    // on the template card too, while it is open
    expect(waitingCountLabel(gp({ waiting: [own, upcoming] }))).toBe('2 not given');
    expect(waitingCountLabel(gp())).toBeNull();
    expect(waitingCountLabel(gp({ waiting: [own], isOpen: false }))).toBeNull();
    expect(waitingReason(gp(), own)).toBe('On their own programme “Sam 1:1” until Sun 6 Dec');
    expect(waitingReason(gp(), { ...own, otherUntil: null })).toBe('On their own programme “Sam 1:1”');
    expect(waitingReason(gp(), { ...own, otherProgram: null })).toBe('On their own programme');
    expect(waitingReason(gp(), { ...own, reason: 'failed' })).toBe('It couldn’t be given when they finished setting up');
  });

  it('a programme of theirs that has not started yet is said to start, not to be running', () => {
    expect(waitingReason(gp(), upcoming)).toBe('Their own programme “Sam 1:1” starts Mon 23 Nov');
    // starting today, they are on it
    expect(waitingReason(gp(), { ...upcoming, otherStarts: '2026-11-20' })).toBe('On their own programme “Sam 1:1” until Sun 13 Dec');
    // without the gym's today (an older gym_programmes()), as before
    expect(waitingReason(gp({ today: null }), upcoming)).toBe('On their own programme “Sam 1:1” until Sun 13 Dec');
  });

  it('giving it says it takes over from their own programme, which stays on file', () => {
    const c = giveWaitingConfirmation(gp(), own);
    expect(c.title).toBe('Give “November Weeks 9-11” to Sam Jones?');
    expect(c.body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays, and takes over from “Sam 1:1”. Their own programme and everything logged on it stay on file.'
    );
    expect(giveWaitingConfirmation(gp(), { ...own, reason: 'failed', otherProgram: null }).body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays.'
    );
  });

  it('giving it says their programme that starts before the gym programme ends now starts the Monday after it', () => {
    const moved = 'It starts today on week 2, the same as everyone at Salford Quays. Their own programme “Sam 1:1” moves to start Mon 30 Nov, after the gym programme.';
    expect(giveWaitingConfirmation(gp(), upcoming).body).toBe(moved);
    // starting today too: the two would tie, so it moves as well
    expect(giveWaitingConfirmation(gp(), { ...upcoming, otherStarts: '2026-11-20' }).body).toBe(moved);
    // starting after the gym programme's last day: it does not take over part-way, so nothing moves
    expect(giveWaitingConfirmation(gp(), { ...upcoming, otherStarts: '2026-11-30' }).body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays. Their own programme “Sam 1:1” still starts Mon 30 Nov, after the gym programme.'
    );
  });

  it('giving it names every programme of theirs it moves, not only the one in the way', () => {
    const block2 = { id: 'p2', name: 'Sam block 2', starts: '2026-11-23' };
    // a running 1:1 in the way, and a later one the coach made since
    expect(giveWaitingConfirmation(gp(), { ...own, otherProgramId: 'p1', moves: [block2] }).body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays, and takes over from “Sam 1:1”. Their own programme and everything logged on it stay on file. “Sam block 2” moves to start Mon 30 Nov, after the gym programme.'
    );
    // listed because giving it failed when they joined
    expect(giveWaitingConfirmation(gp(), { ...own, reason: 'failed', otherProgram: null, otherStarts: null, otherUntil: null, moves: [block2] }).body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays. Their own programme “Sam block 2” moves to start Mon 30 Nov, after the gym programme.'
    );
    // the one in the way is moved too, with another
    const upcomingOwn = { ...upcoming, otherProgramId: 'p1', moves: [{ id: 'p1', name: 'Sam 1:1', starts: '2026-11-23' }, { id: 'p3', name: 'Sam extras', starts: '2026-11-25' }] };
    expect(giveWaitingConfirmation(gp(), upcomingOwn).body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays. Their own programmes “Sam 1:1” and “Sam extras” move to start Mon 30 Nov, after the gym programme.'
    );
    expect(
      giveWaitingConfirmation(gp(), { ...upcomingOwn, moves: [...upcomingOwn.moves, { id: 'p4', name: 'Sam mobility', starts: '2026-11-29' }] }).body
    ).toMatch(/Their own programmes “Sam 1:1”, “Sam extras” and “Sam mobility” move to start Mon 30 Nov/);
    // the list says nothing moves: the one in the way starts after the gym programme (moved since)
    expect(giveWaitingConfirmation(gp(), { ...upcoming, otherProgramId: 'p1', otherStarts: '2026-11-30', moves: [] }).body).toBe(
      'It starts today on week 2, the same as everyone at Salford Quays. Their own programme “Sam 1:1” still starts Mon 30 Nov, after the gym programme.'
    );
  });

  it('reports what happened', () => {
    expect(waitingDone('given', 'Sam Jones')).toBe('Sam Jones is on it from today');
    expect(waitingDone('has_it', 'Sam Jones')).toBe('Sam Jones already has it');
    expect(waitingDone('kept', 'Sam Jones')).toBe('Sam Jones keeps their own programme');
  });
});

describe('its length, fixed when it starts (owner, 21 Nov 2026: 4, 4 and 3-week blocks, then a 1-week peak week)', () => {
  it('runs from the Monday of the start date’s week to the Sunday of its last week', () => {
    // November Weeks 9-11, for everyone from Tue 10 Nov
    expect(gymProgrammeDates('2026-11-10', 3)).toEqual({ weekOne: '2026-11-09', lastDay: '2026-11-29' });
    // peak week, from Mon 30 Nov
    expect(gymProgrammeDates('2026-11-30', 1)).toEqual({ weekOne: '2026-11-30', lastDay: '2026-12-06' });
    // a Sunday start is the last day of its Monday's week
    expect(gymProgrammeDates('2026-11-29', 1)).toEqual({ weekOne: '2026-11-23', lastDay: '2026-11-29' });
    expect(gymProgrammeRunsLabel('2026-11-30', 1)).toBe('Mon 30 Nov - Sun 6 Dec, 1 week');
    expect(gymProgrammeRunsLabel('2026-12-07', 4)).toBe('Mon 7 Dec - Sun 3 Jan, 4 weeks');
    expect(weeksLabel(1)).toBe('1 week');
    expect(weeksLabel(12)).toBe('12 weeks');
  });

  it('Start a programme offers the template’s weeks first, within 1 to 12', () => {
    expect(defaultGymProgrammeWeeks(4)).toBe(4);
    expect(defaultGymProgrammeWeeks(3)).toBe(3);
    expect(defaultGymProgrammeWeeks(1)).toBe(1);
    expect(defaultGymProgrammeWeeks(0)).toBe(1);
    expect(defaultGymProgrammeWeeks(16)).toBe(12);
  });

  const pending = (over: Partial<{ audience: 'all' | 'selected'; program_name: string; start_date: string; weeks: number | null }> = {}) => ({
    audience: 'all' as const,
    program_name: 'Peak week',
    start_date: '2026-11-30',
    weeks: 1,
    ...over,
  });

  it('the next block starts by default the Monday after the last one running or scheduled ends', () => {
    const now = gymProgrammeSpans(gp(), []);
    expect(now).toEqual([{ name: 'November Weeks 9-11', startDate: '2026-11-10', lastDay: '2026-11-29' }]);
    const f = followOnStart(now, '2026-11-21');
    expect(f?.startDate).toBe('2026-11-30');
    expect(f && followOnLabel(f)).toBe('Starts Mon 30 Nov, the day after November Weeks 9-11 ends');
    // peak week already scheduled: the next block follows it
    const both = gymProgrammeSpans(gp(), [pending(), pending({ audience: 'selected', program_name: 'Sam 1:1', start_date: '2026-12-14', weeks: null })]);
    expect(both.map((s) => s.name)).toEqual(['November Weeks 9-11', 'Peak week']);
    expect(followOnLabel(followOnStart(both, '2026-11-21')!)).toBe('Starts Mon 7 Dec, the day after Peak week ends');
    // nothing running (ended early) or scheduled: no default, the sheet keeps today
    expect(gymProgrammeSpans(gp({ isOpen: false }), [])).toEqual([]);
    expect(followOnStart([], '2026-11-21')).toBeNull();
  });

  it('says the new one takes over on its start date when the dates overlap', () => {
    const spans = gymProgrammeSpans(gp(), [pending({ program_name: 'Block 2', start_date: '2026-12-14', weeks: 4 })]);
    // following on: nothing to say
    expect(overlapNote('2026-11-30', 1, spans)).toBeNull();
    // starting while November Weeks 9-11 still runs
    expect(overlapNote('2026-11-23', 1, spans)).toBe('“November Weeks 9-11” runs to Sun 29 Nov: this one takes over from it on Mon 23 Nov.');
    // running into a scheduled one: that one takes over on its own start date
    expect(overlapNote('2026-11-30', 3, spans)).toBe('“Block 2” starts Mon 14 Dec and takes over from this one that day.');
  });

  it('a gym admin changing its length is told the new dates, or that it ends today', () => {
    const longer = changeLengthConfirmation(gp({ today: '2026-11-21' }), 4);
    expect(longer).toEqual({
      title: 'Make “November Weeks 9-11” 4 weeks?',
      body: 'It runs Mon 9 Nov - Sun 6 Dec, and members who join Salford Quays get it until Sun 6 Dec. Nothing changes for the members on it.',
      confirmLabel: 'Change length',
      endsToday: false,
    });
    // 1 week would have ended on Sun 15 Nov, before today (as the database does: it ends today)
    const shorter = changeLengthConfirmation(gp({ today: '2026-11-21' }), 1);
    expect(shorter.title).toBe('End “November Weeks 9-11” today?');
    expect(shorter.body).toBe(
      '1 week would have ended it on Sun 15 Nov, so it ends today: members who join Salford Quays from now on won’t get it. The members on it keep it, and nothing they’ve logged changes.'
    );
    expect(shorter.endsToday).toBe(true);
    // 2 weeks ends this Sunday, still to come
    expect(changeLengthConfirmation(gp({ today: '2026-11-21' }), 2).body).toMatch(/until Sun 22 Nov\./);
  });
});
