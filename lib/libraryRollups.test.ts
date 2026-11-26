import { describe, expect, it } from 'vitest';
import {
  courseMembers,
  courseProgressText,
  formStatus,
  formStatusLine,
  groupSendPreview,
  groupSendSummary,
  nameList,
  remindSummary,
  type FormRollupRow,
} from './libraryRollups';

const row = (client: string, assigned: string, completed: string | null, template = 'parq'): FormRollupRow => ({
  template_id: template,
  client_id: client,
  assigned_at: `2026-11-${assigned}T09:00:00Z`,
  completed_at: completed ? `2026-11-${completed}T09:00:00Z` : null,
});

const names = { sam: 'Sam Smith', jo: 'Jo Bloggs', ann: 'Ann Lee', ben: 'Ben Hill' };

describe('formStatus (who has answered, LB19)', () => {
  const rows = [
    row('sam', '01', '03'),
    row('jo', '05', null),
    row('ann', '02', null),
    // Ben answered once and was sent it again: waiting on the new one
    row('ben', '01', '02'),
    row('ben', '10', null),
    // another form
    row('sam', '01', null, 'lifestyle'),
  ];

  it('puts each member once: waiting if they have it open, else answered', () => {
    const s = formStatus(rows, 'parq', names);
    expect(s.waiting.map((w) => w.name)).toEqual(['Ann Lee', 'Jo Bloggs', 'Ben Hill']);
    expect(s.answered.map((a) => a.name)).toEqual(['Sam Smith']);
    expect(s.waiting.find((w) => w.clientId === 'ben')).toMatchObject({ answeredBefore: true, sentAt: '2026-11-10T09:00:00Z' });
    expect(s.waiting.find((w) => w.clientId === 'jo')?.answeredBefore).toBe(false);
  });

  it('lists answered ones newest first, and names a member it cannot name "A member"', () => {
    const s = formStatus([row('sam', '01', '03'), row('zed', '01', '09')], 'parq', names);
    expect(s.answered.map((a) => [a.name, a.answeredAt.slice(8, 10)])).toEqual([
      ['A member', '09'],
      ['Sam Smith', '03'],
    ]);
  });

  it('says how many were sent it and answered', () => {
    expect(formStatusLine(formStatus(rows, 'parq', names))).toBe('Sent to 4 · 1 answered');
    expect(formStatusLine(formStatus(rows, 'nobody', names))).toBeNull();
  });
});

describe('groupSendPreview', () => {
  const rows = [row('sam', '01', null), row('jo', '01', '02'), row('ann', '01', null, 'lifestyle')];

  it('skips members who have the form open, counts who answered before, counts each member once', () => {
    expect(groupSendPreview(['sam', 'jo', 'ann', 'ann'], rows, 'parq')).toEqual({ total: 3, alreadyOpen: 1, answeredBefore: 1, toSend: 2 });
  });

  it('is all zeros for an empty group', () => {
    expect(groupSendPreview([], rows, 'parq')).toEqual({ total: 0, alreadyOpen: 0, answeredBefore: 0, toSend: 0 });
  });
});

describe('summaries', () => {
  it('says what a group send did', () => {
    expect(groupSendSummary({ sent: 3, alreadyOpen: 2, otherGym: 1, answeredBefore: 0 })).toBe(
      'Sent to 3 members · 2 already had it open · 1 at another gym skipped'
    );
    expect(groupSendSummary({ sent: 1, alreadyOpen: 0, otherGym: 0, answeredBefore: 0 })).toBe('Sent to 1 member');
    expect(groupSendSummary({ sent: 0, alreadyOpen: 4, otherGym: 0, answeredBefore: 0 })).toBe('Nobody new to send it to · 4 already had it open');
  });

  it('says what a reminder did', () => {
    expect(remindSummary({ reminded: 2, recentlyReminded: 1, notWaiting: 0 })).toBe('Reminded 2 members · 1 already reminded in the last 12 hours');
    expect(remindSummary({ reminded: 0, recentlyReminded: 0, notWaiting: 1 })).toBe('Nobody reminded · 1 no longer waiting');
  });

  it('names people in a sentence', () => {
    expect(nameList([])).toBe('');
    expect(nameList(['Sam'])).toBe('Sam');
    expect(nameList(['Sam', 'Jo'])).toBe('Sam and Jo');
    expect(nameList(['Sam', 'Jo', 'Ann'])).toBe('Sam, Jo and Ann');
    expect(nameList(['A', 'B', 'C', 'D', 'E'], 3)).toBe('A, B, C and 2 more');
  });
});

describe('courseMembers (who has a course, LB17)', () => {
  const rollup = [
    { course_id: 'c1', client_id: 'sam', assigned_at: '2026-11-02T00:00:00Z', done: 27 },
    { course_id: 'c1', client_id: 'jo', assigned_at: '2026-11-03T00:00:00Z', done: 4 },
    { course_id: 'c1', client_id: 'ann', assigned_at: '2026-11-05T00:00:00Z', done: 0 },
    // an old double assignment of Jo's: counted once, earliest date
    { course_id: 'c1', client_id: 'jo', assigned_at: '2026-10-01T00:00:00Z', done: 4 },
    { course_id: 'c2', client_id: 'ben', assigned_at: '2026-11-01T00:00:00Z', done: 1 },
  ];

  it('lists each member once, A-Z, finished ones last', () => {
    const list = courseMembers(rollup, 'c1', 27, names);
    expect(list.map((m) => m.name)).toEqual(['Ann Lee', 'Jo Bloggs', 'Sam Smith']);
    expect(list.find((m) => m.clientId === 'jo')?.assignedAt).toBe('2026-10-01T00:00:00Z');
    expect(list.map((m) => m.finished)).toEqual([false, false, true]);
  });

  it('never counts more done than the course has, and a course with no lessons is never finished', () => {
    expect(courseMembers([{ course_id: 'c', client_id: 'sam', assigned_at: '2026-11-01T00:00:00Z', done: 30 }], 'c', 27, names)[0]).toMatchObject({
      done: 27,
      finished: true,
    });
    expect(courseMembers([{ course_id: 'c', client_id: 'sam', assigned_at: '2026-11-01T00:00:00Z', done: 0 }], 'c', 0, names)[0].finished).toBe(false);
  });

  it('describes progress', () => {
    expect(courseProgressText({ done: 27, total: 27, finished: true })).toBe('Finished');
    expect(courseProgressText({ done: 0, total: 27, finished: false })).toBe('Not started');
    expect(courseProgressText({ done: 4, total: 27, finished: false })).toBe('4 of 27 lessons');
    expect(courseProgressText({ done: 0, total: 1, finished: false })).toBe('Not started');
  });
});
