import { describe, expect, it } from 'vitest';
import {
  endGymProgrammeConfirmation,
  giveWaitingConfirmation,
  gymProgrammeLabel,
  gymProgrammeStatus,
  readGymProgramme,
  waitingCountLabel,
  waitingDone,
  waitingHeading,
  waitingReason,
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
  otherProgram: 'Sam 1:1',
  otherStarts: '2026-11-16',
  otherUntil: '2026-12-06',
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
    expect(p?.waiting).toEqual([own, { clientId: 'c2', name: 'A member', reason: 'failed', otherProgram: null, otherStarts: null, otherUntil: null }]);
  });

  it('refuses a row without its rollout, template or dates', () => {
    expect(readGymProgramme(null)).toBeNull();
    expect(readGymProgramme({ ...row, rollout_id: null })).toBeNull();
    expect(readGymProgramme({ ...row, week_one: undefined })).toBeNull();
    expect(readGymProgramme({ ...row, last_day: '' })).toBeNull();
  });
});

describe('on the template', () => {
  it('names the gym (without the brand), week 1 and the members on it', () => {
    expect(gymProgrammeLabel(gp())).toBe('Gym programme: Salford Quays from 9 Nov · 16 members');
    expect(gymProgrammeLabel(gp({ members: 1 }))).toBe('Gym programme: Salford Quays from 9 Nov · 1 member');
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

  it('reports what happened', () => {
    expect(waitingDone('given', 'Sam Jones')).toBe('Sam Jones is on it from today');
    expect(waitingDone('has_it', 'Sam Jones')).toBe('Sam Jones already has it');
    expect(waitingDone('kept', 'Sam Jones')).toBe('Sam Jones keeps their own programme');
  });
});
