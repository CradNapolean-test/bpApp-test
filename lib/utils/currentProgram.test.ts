import { describe, expect, it } from 'vitest';
import { pickCurrentProgram } from './currentProgram';
import type { WorkoutProgramRow } from '@/lib/data/types';

const prog = (id: string, start_date: string | null, created_at: string) =>
  ({ id, start_date, created_at, client_id: 'c', name: id, workout_program_days: [] }) as WorkoutProgramRow;

describe('pickCurrentProgram', () => {
  it('picks the programme with the latest start date that has begun', () => {
    const a = prog('a', '2026-08-01', '2026-07-30T00:00:00Z');
    const b = prog('b', '2026-09-15', '2026-09-01T00:00:00Z');
    const { current, past } = pickCurrentProgram([a, b], '2026-10-03');
    expect(current?.id).toBe('b');
    expect(past.map((p) => p.id)).toEqual(['a']);
  });

  it('keeps a programme that has not started yet as upcoming, not current', () => {
    const a = prog('a', '2026-08-01', '2026-07-30T00:00:00Z');
    const next = prog('next', '2026-10-12', '2026-10-01T00:00:00Z');
    const { current, upcoming } = pickCurrentProgram([a, next], '2026-10-03');
    expect(current?.id).toBe('a');
    expect(upcoming.map((p) => p.id)).toEqual(['next']);
  });

  it('treats a programme with no start date as starting the day it was created', () => {
    const old = prog('old', '2026-08-01', '2026-07-30T00:00:00Z');
    const handBuilt = prog('hand', null, '2026-09-20T10:00:00Z');
    expect(pickCurrentProgram([old, handBuilt], '2026-10-03').current?.id).toBe('hand');
  });

  it('has no current programme when there are none or all are upcoming', () => {
    expect(pickCurrentProgram([], '2026-10-03').current).toBeNull();
    expect(pickCurrentProgram([prog('n', '2026-11-01', '2026-10-01T00:00:00Z')], '2026-10-03').current).toBeNull();
  });
});
