import { describe, expect, it } from 'vitest';
import { gridCsv, scoresCsv } from './bigDogExport';
import type { MemberInfo, RawScore } from './bigDogExport';

const raw = (client_id: string, exercise_key: string, level: RawScore['level'], tested_date: string, extra: Partial<RawScore> = {}): RawScore => ({
  client_id, exercise_key, level, result_text: null, result_value: null, self_reported: false, tested_date, created_at: tested_date, ...extra,
});
const members = new Map<string, MemberInfo>([
  ['a', { name: 'Sam Smith', gender: 'Male', coach: 'Brad' }],
  ['b', { name: 'Ann, Lee', gender: 'Female', coach: null }],
]);

describe('scoresCsv', () => {
  it('lists the latest verified score per exercise, and a newer self-reported one as not verified', () => {
    const csv = scoresCsv(
      [
        raw('a', 'deadlift', 'strong', '2026-01-01', { result_value: 120 }),
        raw('a', 'deadlift', 'big_dog', '2026-03-01', { result_value: 165 }),
        raw('a', 'row_2000', 'rookie', '2026-02-01', { result_value: 540 }),
        raw('a', 'row_2000', 'big_dog', '2026-04-01', { self_reported: true, result_value: 430 }),
        raw('b', 'rower_30_30', 'strong', '2026-02-02', { result_text: '1100m' }),
      ],
      members
    ).split('\r\n');
    expect(csv[0]).toBe('Member,Gender,Coach,Exercise,Category,Result,Level,Verified,Date');
    expect(csv).toContain('"Ann, Lee",Female,,Rower 30:30 x8,Anaerobic fitness,1100m,Strong,Yes,2026-02-02');
    expect(csv).toContain('Sam Smith,Male,Brad,Deadlift 3RM,Lower body strength,165kg,Big Dog,Yes,2026-03-01');
    expect(csv).toContain('Sam Smith,Male,Brad,2000m row,Aerobic fitness,9:00,Rookie,Yes,2026-02-01');
    expect(csv).toContain('Sam Smith,Male,Brad,2000m row,Aerobic fitness,7:10,Big Dog,No,2026-04-01');
    expect(csv.filter((l) => l.includes('Deadlift')).length).toBe(1); // the older 120kg row is not repeated
  });
  it('leaves out cleared (level none) and unknown exercises', () => {
    const csv = scoresCsv([raw('a', 'deadlift', 'none', '2026-01-01'), raw('a', 'run_5000', 'big_dog', '2026-01-01')], members);
    expect(csv.trim().split('\r\n')).toHaveLength(1);
  });
});

describe('gridCsv', () => {
  it('has one row per member with results, level and shirt tier from verified scores only', () => {
    const lines = gridCsv(
      [
        raw('a', 'deadlift', 'big_dog', '2026-03-01', { result_value: 165 }),
        raw('a', 'back_squat', 'big_dog', '2026-03-01', { result_value: 145 }),
        raw('a', 'bench_press', 'big_dog', '2026-03-01', { result_value: 100 }),
        raw('a', 'chin_ups', 'big_dog', '2026-03-01', { self_reported: true, result_value: 12 }), // not counted
      ],
      members
    ).split('\r\n');
    expect(lines[0].startsWith('Member,Gender,Coach,Big Dog exercises,Shirt tier,Deadlift 3RM result,Deadlift 3RM level')).toBe(true);
    expect(lines[1].startsWith('Sam Smith,Male,Brad,3,Turquoise Big Dog,165kg,Big Dog,145kg,Big Dog,100kg,Big Dog,')).toBe(true);
    expect(lines).toHaveLength(3); // header, one member, trailing newline
  });
});
