import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfigFor } from '../../lib/blockScoring';
import { guessTrackingType } from '../../lib/trackingGuess';
import { isTrackingType } from '../../lib/workoutTracking';

// Static checks on 0156 (no database): its name list and block defaults must say what the app itself would pick, and the
// guards that protect coach settings and logged sets must be there.
const sql = fs.readFileSync(path.resolve(__dirname, '../migrations/0156_tracking_and_scoring_backfill.sql'), 'utf8');
const code = sql.replace(/--.*$/gm, '');

const valuesAfter = (table: string) => {
  const start = code.indexOf(`insert into ${table}`);
  const end = code.indexOf(';', start);
  return [...code.slice(start, end).matchAll(/\(\s*'((?:[^']|'')*)'\s*,\s*'((?:[^']|'')*)'\s*\)/g)].map((m) => [m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")]);
};

describe('0156 tracking and scoring backfill', () => {
  const names = valuesAfter('tracking_guess_0156');

  it('lists each name once, in lower case, with a real tracking type', () => {
    expect(names.length).toBeGreaterThan(100);
    expect(new Set(names.map(([n]) => n)).size).toBe(names.length);
    for (const [name, type] of names) {
      expect(name, name).toBe(name.trim().toLowerCase());
      expect(isTrackingType(type), name).toBe(true);
      expect(type, name).not.toBe('weight_reps');
    }
  });

  it('gives every name the type the app guesses for it', () => {
    for (const [name, type] of names) expect(guessTrackingType(name), name).toBe(type);
  });

  it('only changes rows still on weight x reps, only exercise rows, and never a programme row with a set logged', () => {
    expect(code.match(/tracking_type\s*=\s*'weight_reps'/g)?.length).toBe(3);
    expect(code.match(/block_type\s*=\s*'exercise'/g)?.length).toBe(2);
    expect(code).toMatch(/not exists\s*\(\s*select 1 from public\.workout_logs l\s+where l\.exercise_id = e\.id and \(l\.actual_reps is not null or l\.actual_load is not null\)/);
  });

  it('scores a block with what picking its format in the builder fills in', () => {
    const defaults = valuesAfter('block_defaults_0156');
    expect(defaults.map(([f]) => f).sort()).toEqual(['AMRAP', 'Big Chipper', 'Circuit', 'EMOM', 'Partner AMRAP', 'Tabata']);
    for (const [format, json] of defaults) expect(JSON.parse(json), format).toEqual(defaultConfigFor(format));
  });

  it('leaves a block alone when any of its rows already has a scoring', () => {
    expect(code.match(/block_config is null/g)?.length).toBe(2);
    expect(code.match(/o\.block_config is not null/g)?.length).toBe(2);
  });

  it('runs as one transaction with its helper tables dropped at the end', () => {
    expect(code).toMatch(/^\s*begin;/m);
    expect(code).toMatch(/^\s*commit;/m);
    expect(code.match(/create temporary table \w+ \([^;]*\) on commit drop;/g)?.length).toBe(2);
  });
});
