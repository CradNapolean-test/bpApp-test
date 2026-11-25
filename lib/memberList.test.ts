import { describe, expect, it, vi } from 'vitest';
import {
  ENDING_SOON_DAYS,
  NO_ANSWER,
  checkInOf,
  checkInText,
  checkInWeeks,
  daysAgoText,
  groupOutcome,
  keepSelectable,
  lastClassText,
  listDay,
  messageOutcome,
  namesSummary,
  planEndOf,
  planEndText,
  sameGroupName,
  selectAllState,
  sendInBatches,
  splitBatches,
  toggleAll,
  toggleSelected,
  type BatchResult,
} from './memberList';

// Wednesday 25 Nov 2026: this week starts Mon 23 Nov, last week Mon 16 Nov, the week before Mon 9 Nov.
const TODAY = '2026-11-25';

describe('plan end (CL6)', () => {
  it('has nothing to say without a plan, and "Ongoing" for a plan with no last day', () => {
    expect(planEndOf(false, '2026-12-01', TODAY)).toEqual({ kind: 'none' });
    expect(planEndOf(true, null, TODAY)).toEqual({ kind: 'ongoing' });
    expect(planEndText(planEndOf(false, null, TODAY), TODAY)).toEqual({ text: '—', short: null, soon: false });
    expect(planEndText(planEndOf(true, null, TODAY), TODAY)).toEqual({ text: 'Ongoing', short: null, soon: false });
  });

  it('is "ending soon" in its last 2 weeks, the same 14 days as the Business overview', () => {
    expect(ENDING_SOON_DAYS).toBe(14);
    expect(planEndOf(true, '2026-12-09', TODAY)).toEqual({ kind: 'ends', endsOn: '2026-12-09', daysLeft: 14, soon: true });
    expect(planEndOf(true, '2026-12-10', TODAY)).toEqual({ kind: 'ends', endsOn: '2026-12-10', daysLeft: 15, soon: false });
    expect(planEndOf(true, TODAY, TODAY)).toMatchObject({ daysLeft: 0, soon: true });
  });

  it('writes the day, and on a phone the days left when it is ending soon', () => {
    expect(planEndText(planEndOf(true, '2026-12-28', TODAY), TODAY)).toEqual({ text: '28 Dec', short: 'Ends 28 Dec', soon: false });
    expect(planEndText(planEndOf(true, '2026-11-30', TODAY), TODAY)).toEqual({ text: '30 Nov', short: '5d left', soon: true });
    expect(planEndText(planEndOf(true, '2026-11-26', TODAY), TODAY)).toEqual({ text: 'Tomorrow', short: 'Ends tomorrow', soon: true });
    expect(planEndText(planEndOf(true, TODAY, TODAY), TODAY)).toEqual({ text: 'Today', short: 'Ends today', soon: true });
  });

  it('adds the year only when it is not this year', () => {
    expect(listDay('2027-01-03', TODAY)).toBe('3 Jan 2027');
    expect(listDay('2026-01-03', TODAY)).toBe('3 Jan');
    expect(planEndText(planEndOf(true, '2027-02-01', TODAY), TODAY)).toEqual({ text: '1 Feb 2027', short: 'Ends 1 Feb', soon: false });
    // The phone keeps the year for a day 10 months or more away.
    expect(planEndText(planEndOf(true, '2027-11-30', TODAY), TODAY).short).toBe('Ends 30 Nov 2027');
  });

  it('says a plan has ended when its last day passed before the overnight job closed it', () => {
    const p = planEndOf(true, '2026-11-24', TODAY);
    expect(p).toEqual({ kind: 'ended', endsOn: '2026-11-24' });
    expect(planEndText(p, TODAY)).toEqual({ text: 'Ended 24 Nov', short: 'Ended 24 Nov', soon: true });
  });
});

describe('check-in (CL6): the dashboard rule, coach_reviews kind "week"', () => {
  it('looks at the last two completed weeks, Monday to Sunday', () => {
    expect(checkInWeeks(TODAY)).toEqual({ thisWeek: '2026-11-23', lastWeek: '2026-11-16', weekBefore: '2026-11-09' });
    // A Sunday still belongs to the week that started the Monday before.
    expect(checkInWeeks('2026-11-29')).toEqual({ thisWeek: '2026-11-23', lastWeek: '2026-11-16', weekBefore: '2026-11-09' });
    expect(checkInWeeks('2026-11-30')).toEqual({ thisWeek: '2026-11-30', lastWeek: '2026-11-23', weekBefore: '2026-11-16' });
  });

  it('is waiting when last week has something logged and no Reviewed mark', () => {
    expect(checkInOf(['2026-11-16', '2026-11-22'], [], TODAY)).toEqual({ kind: 'waiting', weeks: ['2026-11-16'] });
  });

  it('counts the week before too, as the dashboard does, oldest first', () => {
    expect(checkInOf(['2026-11-12', '2026-11-20'], [], TODAY)).toEqual({ kind: 'waiting', weeks: ['2026-11-09', '2026-11-16'] });
    // Last week reviewed but the week before still waiting: still waiting.
    expect(checkInOf(['2026-11-12', '2026-11-20'], ['2026-11-16'], TODAY)).toEqual({ kind: 'waiting', weeks: ['2026-11-09'] });
  });

  it('is reviewed when last week has its mark and nothing is waiting', () => {
    expect(checkInOf(['2026-11-20'], ['2026-11-16'], TODAY)).toEqual({ kind: 'reviewed', week: '2026-11-16' });
    // A coach can mark a week with nothing logged in it: that is still reviewed.
    expect(checkInOf([], ['2026-11-16'], TODAY)).toEqual({ kind: 'reviewed', week: '2026-11-16' });
  });

  it('has nothing to say when nothing was logged, or only this week', () => {
    expect(checkInOf([], [], TODAY)).toEqual({ kind: 'none' });
    expect(checkInOf(['2026-11-23', '2026-11-25'], [], TODAY)).toEqual({ kind: 'none' });
    // Older weeks are no longer on the dashboard's list either.
    expect(checkInOf(['2026-11-03'], [], TODAY)).toEqual({ kind: 'none' });
    // Only the week before reviewed, last week empty: nothing for last week.
    expect(checkInOf(['2026-11-12'], ['2026-11-09'], TODAY)).toEqual({ kind: 'none' });
  });

  it('words each state for the column and the phone', () => {
    expect(checkInText({ kind: 'waiting', weeks: ['2026-11-16'] })).toEqual({
      text: 'To review',
      short: 'To review',
      detail: 'Week of 16 Nov waiting for your review',
    });
    expect(checkInText({ kind: 'waiting', weeks: ['2026-11-09', '2026-11-16'] })).toMatchObject({
      text: '2 to review',
      short: '2 to review',
      detail: 'Week of 9 Nov and Week of 16 Nov waiting for your review',
    });
    expect(checkInText({ kind: 'reviewed', week: '2026-11-16' })).toEqual({ text: 'Reviewed', short: 'Reviewed', detail: 'Week of 16 Nov reviewed' });
    expect(checkInText({ kind: 'none' })).toEqual({ text: '—', short: null, detail: 'Nothing logged last week' });
  });
});

describe('last class (CL6)', () => {
  it('counts days up to two weeks, then gives the day', () => {
    expect(daysAgoText(TODAY, TODAY)).toBe('Today');
    expect(daysAgoText('2026-11-24', TODAY)).toBe('Yesterday');
    expect(daysAgoText('2026-11-12', TODAY)).toBe('13d ago');
    expect(daysAgoText('2026-11-11', TODAY)).toBe('11 Nov');
    expect(daysAgoText('2025-12-30', TODAY)).toBe('30 Dec 2025');
  });

  it('is left off the phone line when there is none', () => {
    expect(lastClassText(null, TODAY)).toEqual({ text: '—', short: null });
    expect(lastClassText({ date: TODAY, className: 'HIIT' }, TODAY)).toEqual({ text: 'Today', short: 'Today' });
    expect(lastClassText({ date: '2026-11-20', className: null }, TODAY)).toEqual({ text: '5d ago', short: '5d ago' });
    expect(lastClassText({ date: '2026-10-01', className: null }, TODAY)).toEqual({ text: '1 Oct', short: '1 Oct' });
  });
});

describe('select mode (CL18)', () => {
  it('ticks and unticks one member', () => {
    const one = toggleSelected(new Set(), 'a');
    expect([...one]).toEqual(['a']);
    expect([...toggleSelected(one, 'a')]).toEqual([]);
  });

  it('"select all" ticks everyone shown, keeping members ticked under another filter', () => {
    expect([...toggleAll(new Set(['z']), ['a', 'b'])].sort()).toEqual(['a', 'b', 'z']);
    // Some shown already ticked: it ticks the rest rather than clearing.
    expect([...toggleAll(new Set(['a']), ['a', 'b'])].sort()).toEqual(['a', 'b']);
  });

  it('"select all" unticks the shown members when they are all ticked, and leaves the others', () => {
    expect([...toggleAll(new Set(['a', 'b', 'z']), ['a', 'b'])]).toEqual(['z']);
    expect([...toggleAll(new Set(['z']), [])]).toEqual(['z']);
  });

  it('shows all, some or none ticked for the select-all box', () => {
    expect(selectAllState(new Set(['a', 'b']), ['a', 'b'])).toBe('all');
    expect(selectAllState(new Set(['a']), ['a', 'b'])).toBe('some');
    expect(selectAllState(new Set(['z']), ['a', 'b'])).toBe('none');
    expect(selectAllState(new Set(['z']), [])).toBe('none');
  });

  it('drops a ticked member the coach can no longer act on', () => {
    expect([...keepSelectable(new Set(['a', 'gone']), new Set(['a', 'b']))]).toEqual(['a']);
    expect([...keepSelectable(new Set(['a']), new Map([['a', 1]]))]).toEqual(['a']);
  });

  it('names a few members, then counts the rest', () => {
    expect(namesSummary([])).toBe('');
    expect(namesSummary(['Anna'])).toBe('Anna');
    expect(namesSummary(['Anna', 'Ben'])).toBe('Anna and Ben');
    expect(namesSummary(['Anna', 'Ben', 'Cara'])).toBe('Anna, Ben and Cara');
    expect(namesSummary(['Anna', 'Ben', 'Cara', 'Dan'])).toBe('Anna, Ben, Cara and 1 other');
    expect(namesSummary(['Anna', 'Ben', 'Cara', 'Dan', 'Eve'])).toBe('Anna, Ben, Cara and 2 others');
  });

  it('treats a new group name that matches an existing one as that group', () => {
    expect(sameGroupName('Morning Crew ', 'morning crew')).toBe(true);
    expect(sameGroupName('Morning crew', 'Evening crew')).toBe(false);
  });

  it('splits into batches', () => {
    expect(splitBatches([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(splitBatches([], 2)).toEqual([]);
  });
});

describe('Message each, a batch at a time (CL18)', () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `m${i + 1}`);

  it('sends in batches of 20, one after another, and reports progress', async () => {
    const calls: string[][] = [];
    const progress: number[] = [];
    const send = vi.fn(async (batch: string[]): Promise<BatchResult> => {
      calls.push(batch);
      return { ok: true, sent: batch, failed: [] };
    });
    const res = await sendInBatches(ids(45), send, (n) => progress.push(n));
    expect(calls.map((b) => b.length)).toEqual([20, 20, 5]);
    expect(res.sent).toHaveLength(45);
    expect(res.failed).toEqual([]);
    expect(progress).toEqual([20, 40, 45]);
  });

  it('sends to each member once even if they were listed twice', async () => {
    const send = vi.fn(async (batch: string[]): Promise<BatchResult> => ({ ok: true, sent: batch, failed: [] }));
    const res = await sendInBatches(['a', 'b', 'a'], send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual(['a', 'b']);
    expect(res.sent).toEqual(['a', 'b']);
  });

  it('keeps going after a member fails, and names who it failed for', async () => {
    const send = vi.fn(async (batch: string[]): Promise<BatchResult> => ({
      ok: true,
      sent: batch.filter((id) => id !== 'm2'),
      failed: batch.includes('m2') ? [{ clientId: 'm2', error: 'Could not send' }] : [],
    }));
    const res = await sendInBatches(ids(3), send);
    expect(res.sent).toEqual(['m1', 'm3']);
    expect(res.failed).toEqual([{ clientId: 'm2', error: 'Could not send' }]);
  });

  it('marks a refused batch as failed with the reason, and still sends the next batch', async () => {
    let n = 0;
    const send = vi.fn(async (batch: string[]): Promise<BatchResult> => (n++ === 0 ? { ok: false, error: 'You are signed out.' } : { ok: true, sent: batch, failed: [] }));
    const res = await sendInBatches(ids(3), send, undefined, 2);
    expect(res.failed).toEqual([
      { clientId: 'm1', error: 'You are signed out.' },
      { clientId: 'm2', error: 'You are signed out.' },
    ]);
    expect(res.sent).toEqual(['m3']);
  });

  it('says "may or may not have gone" when a batch gets no answer, rather than "failed"', async () => {
    const send = vi.fn(async (): Promise<BatchResult> => {
      throw new Error('network');
    });
    const res = await sendInBatches(['a'], send);
    expect(res).toEqual({ sent: [], failed: [{ clientId: 'a', error: NO_ANSWER }] });
  });

  it('accounts for every member even if the answer leaves some out, and ignores members it was not sent', async () => {
    const send = vi.fn(async (): Promise<BatchResult> => ({ ok: true, sent: ['a', 'stranger'], failed: [] }));
    const res = await sendInBatches(['a', 'b'], send);
    expect(res.sent).toEqual(['a']);
    expect(res.failed).toEqual([{ clientId: 'b', error: 'Not sent' }]);
  });
});

describe('what happened, in words', () => {
  it('for Message each', () => {
    expect(messageOutcome(12, 0)).toBe('Sent to 12 members.');
    expect(messageOutcome(1, 0)).toBe('Sent to 1 member.');
    expect(messageOutcome(10, 2)).toBe('Sent to 10 members. Not sent to 2.');
    expect(messageOutcome(0, 3)).toBe('Not sent: it failed for all 3 members.');
  });

  it('for Add to a group', () => {
    expect(groupOutcome('Morning crew', 3, 0, 0)).toBe('Added 3 members to Morning crew.');
    expect(groupOutcome('Morning crew', 3, 2, 0)).toBe('Added 3 members to Morning crew. 2 were already in it.');
    expect(groupOutcome('Morning crew', 0, 1, 0)).toBe('1 was already in it.');
    expect(groupOutcome('Morning crew', 0, 0, 4)).toBe('Not added to Morning crew: 4 members.');
    expect(groupOutcome('Morning crew', 2, 0, 1)).toBe('Added 2 members to Morning crew. Not added: 1 member.');
  });
});
