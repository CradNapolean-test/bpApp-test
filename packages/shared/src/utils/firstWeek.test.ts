import { describe, expect, it } from 'vitest';
import { firstWeekChecklist, firstWeekDay, pickIntakeForm, type FirstWeekFacts } from './firstWeek';

const tz = 'Europe/London';
const none: FirstWeekFacts = { hasPhotos: false, hasWeighIn: false, intake: null, hasBooking: false, saidHello: false };
// Finished onboarding at 23:30 UK time on Mon 2 Nov (23:30 UTC, GMT).
const onboardedAt = '2026-11-02T23:30:00Z';

describe('firstWeekDay', () => {
  it('counts from the day onboarding was finished, in the member own timezone', () => {
    expect(firstWeekDay(onboardedAt, '2026-11-02', tz)).toBe(1);
    expect(firstWeekDay(onboardedAt, '2026-11-08', tz)).toBe(7);
  });
  it('is null after the seventh day, before onboarding, or without it', () => {
    expect(firstWeekDay(onboardedAt, '2026-11-09', tz)).toBeNull();
    expect(firstWeekDay(onboardedAt, '2026-11-01', tz)).toBeNull();
    expect(firstWeekDay(null, '2026-11-02', tz)).toBeNull();
  });
  it('uses the member timezone, not UTC, for the start day', () => {
    // 00:30 on 3 Nov in Auckland is still 2 Nov in UTC.
    expect(firstWeekDay('2026-11-02T11:30:00Z', '2026-11-03', 'Pacific/Auckland')).toBe(1);
  });
});

describe('pickIntakeForm', () => {
  const a = (id: string, assigned_at: string, name: string, isDefault = false, completed_at: string | null = null) => ({
    id,
    assigned_at,
    completed_at,
    template: { name, is_default_onboarding: isDefault },
  });
  it('picks the default onboarding form when it is assigned', () => {
    expect(pickIntakeForm([a('1', '2026-11-01', 'PAR-Q'), a('2', '2026-11-02', 'Client Intake', true, '2026-11-03')])).toEqual({
      id: '2',
      name: 'Client Intake',
      done: true,
    });
  });
  it('else the first form assigned', () => {
    expect(pickIntakeForm([a('2', '2026-11-04', 'Lifestyle'), a('1', '2026-11-02', 'PAR-Q')])).toEqual({ id: '1', name: 'PAR-Q', done: false });
  });
  it('is null with no form, or only forms whose template is gone', () => {
    expect(pickIntakeForm([])).toBeNull();
    expect(pickIntakeForm([{ id: '1', assigned_at: '2026-11-02', completed_at: null, template: null }])).toBeNull();
  });
});

describe('firstWeekChecklist', () => {
  it('lists the five steps in order, with the coach name and the form name', () => {
    const w = firstWeekChecklist({
      onboardedAt,
      today: '2026-11-04',
      tz,
      facts: { ...none, intake: { id: 'f', name: 'Client Intake', done: false } },
      coachName: 'Brad',
    })!;
    expect(w.day).toBe(3);
    expect(w.items.map((i) => i.title)).toEqual([
      'Take your start photos',
      'Log your first weigh-in',
      'Fill in Client Intake',
      'Book a class',
      'Say hello to Brad',
    ]);
    expect(w.doneCount).toBe(0);
  });

  it('ticks each step from what the member has done', () => {
    const w = firstWeekChecklist({ onboardedAt, today: '2026-11-04', tz, facts: { ...none, hasPhotos: true, hasBooking: true } })!;
    expect(w.items.filter((i) => i.done).map((i) => i.key)).toEqual(['photos', 'book']);
    expect(w.doneCount).toBe(2);
  });

  it('leaves out the form when none is assigned, and what the member cannot open', () => {
    const w = firstWeekChecklist({
      onboardedAt,
      today: '2026-11-04',
      tz,
      facts: { ...none, intake: { id: 'f', name: 'Client Intake', done: false } },
      show: { photos: false, weighIn: false, forms: false },
    })!;
    expect(w.items.map((i) => i.key)).toEqual(['book', 'hello']);
    expect(firstWeekChecklist({ onboardedAt, today: '2026-11-04', tz, facts: none })!.items.map((i) => i.key)).toEqual([
      'photos',
      'weigh_in',
      'book',
      'hello',
    ]);
  });

  it('says "your coach" when the name is not known', () => {
    const w = firstWeekChecklist({ onboardedAt, today: '2026-11-04', tz, facts: none, coachName: null })!;
    expect(w.items.at(-1)!.title).toBe('Say hello to your coach');
  });

  it('goes when everything is done', () => {
    const all = { hasPhotos: true, hasWeighIn: true, intake: { id: 'f', name: 'Client Intake', done: true }, hasBooking: true, saidHello: true };
    expect(firstWeekChecklist({ onboardedAt, today: '2026-11-04', tz, facts: all })).toBeNull();
  });

  it('goes when the week is over, done or not', () => {
    expect(firstWeekChecklist({ onboardedAt, today: '2026-11-09', tz, facts: none })).toBeNull();
    expect(firstWeekChecklist({ onboardedAt: null, today: '2026-11-04', tz, facts: none })).toBeNull();
  });
});
