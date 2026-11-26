import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { gridCsv, scoresCsv, type MemberInfo, type RawScore } from './bigDogExport';
import { toCsv } from './csv';
import { peakWeekScoresFile } from './peakWeekScoresFile';

const ROOT = join(__dirname, '..');
const read = (path: string) => readFileSync(join(ROOT, path), 'utf8');

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name);
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(relative(ROOT, join(ROOT, path)).replace(/\\/g, '/'));
  }
  return out;
}
const APP = sourceFiles('app');
const importersOf = (needle: RegExp) => APP.filter((f) => needle.test(read(f)));

const score = (over: Partial<RawScore> = {}): RawScore => ({
  client_id: 'a',
  exercise_key: 'deadlift',
  level: 'strong',
  result_text: null,
  result_value: 120,
  self_reported: false,
  tested_date: '2026-11-01',
  created_at: '2026-11-01',
  ...over,
});
const members: Record<string, MemberInfo> = { a: { name: 'Sam Smith', gender: 'Male', coach: 'Brad' } };

describe('peakWeekScoresFile: the same files as on Rewards (BO9)', () => {
  it('names the file by layout and day', () => {
    expect(peakWeekScoresFile('scores', [score()], members, '2026-11-26').name).toBe('peak-week-scores-2026-11-26.csv');
    expect(peakWeekScoresFile('grid', [score()], members, '2026-11-26').name).toBe('peak-week-grid-2026-11-26.csv');
  });

  it('is the one-row-per-score and one-row-per-member CSVs', () => {
    const map = new Map(Object.entries(members));
    expect(peakWeekScoresFile('scores', [score()], members, '2026-11-26').text).toBe(scoresCsv([score()], map));
    expect(peakWeekScoresFile('grid', [score()], members, '2026-11-26').text).toBe(gridCsv([score()], map));
  });

  it('is just the Member header with no scores yet', () => {
    expect(peakWeekScoresFile('scores', [], {}, '2026-11-26').text).toBe(toCsv(['Member'], []));
    expect(peakWeekScoresFile('grid', [], {}, '2026-11-26').text).toBe(toCsv(['Member'], []));
  });
});

// Who can download the scores from Reports: the same people as on Rewards. Both pages let in a signed-in coach and nobody else (an
// owner, role 'owner', has neither), and the download reads the same scores: getScoresExport() with no gym passed, so the database's
// row level security on big_dog_results decides which members' scores come back, as before.
describe('who can download the Peak Week scores (BO9)', () => {
  const gate = /if \(!user\) redirect\('\/login'\);[\s\S]*?if \(profile\?\.role !== 'coach'\) redirect\('\/dashboard'\);/;

  it('Classes, where Reports is, lets in coaches only, as Business did', () => {
    expect(read('app/coach/classes/page.tsx')).toMatch(gate);
    expect(read('app/coach/business/page.tsx')).toMatch(gate);
  });

  it('the card is on the coach Reports only, and Reports only on the coach Classes page', () => {
    expect(importersOf(/from '\.\/PeakWeekScoresCard'|\/PeakWeekScoresCard'/)).toEqual(['app/coach/classes/_components/ReportsPane.tsx']);
    expect(read('app/coach/classes/_components/ReportsPane.tsx')).toMatch(/<PeakWeekScoresCard \/>/);
    expect(importersOf(/from '\.\/ReportsPane'/).filter((f) => f.startsWith('app/coach/'))).toEqual(['app/coach/classes/_components/ClassesHubShell.tsx']);
    expect(importersOf(/ClassesHubShell'/)).toEqual(['app/coach/classes/page.tsx']);
  });

  it('every Reports tab is open to every coach: no tab is held back by role', () => {
    expect(read('app/coach/classes/_components/ClassesHubShell.tsx')).toMatch(/const TABS = \['Sessions', 'Timetable', 'Red flags', 'Reports'\] as const;/);
    expect(read('app/coach/classes/_components/ClassesHubShell.tsx')).toMatch(/\{tab === 'Reports' && \(/);
  });

  it('reads the same scores, with no gym or filter passed', () => {
    const uses = APP.filter((f) => /getScoresExport\(/.test(read(f)));
    expect(uses).toEqual(['app/coach/classes/_components/PeakWeekScoresCard.tsx']);
    expect(read(uses[0])).toMatch(/await getScoresExport\(\);/);
  });

  it('nothing about them is left on Rewards', () => {
    const rewards = read('app/coach/community/_components/CommunityShell.tsx');
    expect(rewards).not.toMatch(/getScoresExport|scoresCsv|gridCsv|ScoresExportCard|One row per score/);
  });
});
