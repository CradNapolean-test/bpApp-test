import { EXERCISES, LEVEL_LABEL, TIER_TITLE, formatResult, tierForCount } from './bigDog';
import type { BigDogLevel } from './bigDog';
import { toCsv } from './csv';

// Peak Week scores as CSV for the owners' spreadsheet. Two layouts:
//  - "scores": one row per score (easy to filter, pivot or append to a sheet)
//  - "grid": one row per member with a result and level column for each of the 12 exercises
// Only coach-verified scores count towards a member's level and shirt; a newer self-reported score is listed
// separately in the scores layout (Verified = No) so it can be checked.

export interface RawScore {
  client_id: string;
  exercise_key: string;
  level: BigDogLevel;
  result_text: string | null;
  result_value: number | null;
  self_reported: boolean | null;
  tested_date: string;
  created_at: string;
}

export interface MemberInfo {
  name: string;
  gender: string | null;
  coach: string | null;
}

const newest = (a: RawScore, b: RawScore) => (`${a.tested_date}|${a.created_at}` >= `${b.tested_date}|${b.created_at}` ? a : b);

function describe(r: RawScore): string {
  const ex = EXERCISES.find((e) => e.key === r.exercise_key);
  if (r.result_text) return r.result_text;
  if (ex && r.result_value != null) return formatResult(ex.kind, r.result_value);
  return '';
}

// The latest verified score per member and exercise (a "none" row clears an exercise, as in the app).
function latestVerified(raw: RawScore[]): Map<string, RawScore> {
  const out = new Map<string, RawScore>();
  for (const r of raw) {
    if (r.self_reported) continue;
    const k = `${r.client_id}|${r.exercise_key}`;
    const cur = out.get(k);
    out.set(k, cur ? newest(cur, r) : r);
  }
  return out;
}

export function scoresCsv(raw: RawScore[], members: Map<string, MemberInfo>): string {
  const verified = latestVerified(raw.filter((r) => EXERCISES.some((e) => e.key === r.exercise_key)));
  const rows: { member: MemberInfo; r: RawScore; isVerified: boolean }[] = [];
  for (const r of verified.values()) {
    if (r.level === 'none') continue;
    rows.push({ member: members.get(r.client_id) ?? { name: 'Member', gender: null, coach: null }, r, isVerified: true });
  }
  // A self-reported score newer than the member's latest verified one for that exercise, still waiting for a coach.
  const pending = new Map<string, RawScore>();
  for (const r of raw) {
    if (!r.self_reported || !EXERCISES.some((e) => e.key === r.exercise_key)) continue;
    const k = `${r.client_id}|${r.exercise_key}`;
    const v = verified.get(k);
    if (v && `${v.tested_date}|${v.created_at}` >= `${r.tested_date}|${r.created_at}`) continue;
    const cur = pending.get(k);
    pending.set(k, cur ? newest(cur, r) : r);
  }
  for (const r of pending.values()) {
    rows.push({ member: members.get(r.client_id) ?? { name: 'Member', gender: null, coach: null }, r, isVerified: false });
  }
  const order = (key: string) => EXERCISES.findIndex((e) => e.key === key);
  rows.sort((a, b) => a.member.name.localeCompare(b.member.name) || order(a.r.exercise_key) - order(b.r.exercise_key));
  return toCsv(
    ['Member', 'Gender', 'Coach', 'Exercise', 'Category', 'Result', 'Level', 'Verified', 'Date'],
    rows.map(({ member, r, isVerified }) => {
      const ex = EXERCISES.find((e) => e.key === r.exercise_key)!;
      return [member.name, member.gender, member.coach, ex.name, ex.category, describe(r), LEVEL_LABEL[r.level], isVerified ? 'Yes' : 'No', r.tested_date];
    })
  );
}

export function gridCsv(raw: RawScore[], members: Map<string, MemberInfo>): string {
  const verified = latestVerified(raw);
  const ids = [...new Set(raw.map((r) => r.client_id))].sort((a, b) => (members.get(a)?.name ?? '').localeCompare(members.get(b)?.name ?? ''));
  const headers = ['Member', 'Gender', 'Coach', 'Big Dog exercises', 'Shirt tier'];
  for (const e of EXERCISES) headers.push(`${e.name} result`, `${e.name} level`);
  const rows = ids.map((id) => {
    const m = members.get(id) ?? { name: 'Member', gender: null, coach: null };
    const mine = EXERCISES.map((e) => verified.get(`${id}|${e.key}`));
    const bigDogs = mine.filter((r) => r?.level === 'big_dog').length;
    const tier = tierForCount(bigDogs);
    const cells: (string | number | null)[] = [m.name, m.gender, m.coach, bigDogs, tier === 'none' ? '' : TIER_TITLE[tier]];
    for (const r of mine) cells.push(r && r.level !== 'none' ? describe(r) : '', r && r.level !== 'none' ? LEVEL_LABEL[r.level] : '');
    return cells;
  });
  return toCsv(headers, rows);
}
