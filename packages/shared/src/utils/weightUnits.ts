// Bodyweight and goal weight in the member's own units (D16, MX9): kilograms, or stones and pounds. The database always holds kilograms
// (client_profiles.weight_unit, migration 0170, only says how to show them). Twin of lib/utils/weightUnits.ts (the web): keep the
// two the same.
//
// No drift: stones and pounds are read to a tenth of a pound, and a weight typed in them is stored to 0.01 kg, which is close enough that
// it always reads back as exactly what was typed. A weight that is shown and saved again unchanged is not saved at all (sameWeightReading),
// so it can never creep.

export type WeightUnit = 'kg' | 'st_lb';

export const KG_PER_LB = 0.45359237; // the international pound, exactly
export const LB_PER_ST = 14;

export const WEIGHT_UNIT_OPTIONS: { value: WeightUnit; label: string }[] = [
  { value: 'kg', label: 'kg' },
  { value: 'st_lb', label: 'st & lb' },
];

// What is stored, as a unit: anything but 'st_lb' (missing, before migration 0170) is kilograms.
export function weightUnitOf(value: unknown): WeightUnit {
  return value === 'st_lb' ? 'st_lb' : 'kg';
}

// A weight in tenths of a pound, the step stones and pounds are shown in.
function lbTenths(kg: number): number {
  return Math.round((Math.abs(kg) / KG_PER_LB) * 10);
}

function splitTenths(tenths: number): { st: number; lb: number } {
  const st = Math.floor(tenths / (LB_PER_ST * 10));
  return { st, lb: (tenths - st * LB_PER_ST * 10) / 10 };
}

// Kilograms as whole stones and pounds to a tenth (14 lb is carried into a stone).
export function kgToStLb(kg: number): { st: number; lb: number } {
  return splitTenths(lbTenths(kg));
}

// Stones and pounds as kilograms, to 0.01 kg.
export function stLbToKg(st: number, lb: number): number {
  return Math.round((st * LB_PER_ST + lb) * KG_PER_LB * 100) / 100;
}

// 4.5 -> "4.5", 4 -> "4".
export function formatLb(lb: number): string {
  return Number.isInteger(lb) ? String(lb) : lb.toFixed(1);
}

// "12 st 4.5 lb".
export function formatStLb(kg: number): string {
  const { st, lb } = kgToStLb(kg);
  return `${st} st ${formatLb(lb)} lb`;
}

// "78.2 kg" or "12 st 4.5 lb".
export function formatWeight(kg: number, unit: WeightUnit): string {
  return unit === 'st_lb' ? formatStLb(kg) : `${kg.toFixed(1)} kg`;
}

// A difference (lost, gained, still to go), always positive: "1.4 kg", or "3.1 lb" under a stone and "1 st 2 lb" from a stone up.
export function formatWeightDiff(kg: number, unit: WeightUnit): string {
  if (unit === 'kg') return `${Math.abs(kg).toFixed(1)} kg`;
  const tenths = lbTenths(kg);
  if (tenths < LB_PER_ST * 10) return `${formatLb(tenths / 10)} lb`;
  const { st, lb } = splitTenths(tenths);
  return `${st} st ${formatLb(lb)} lb`;
}

// A small figure box with its unit as the label: "78.2", or "12st 4.5".
export function formatWeightCompact(kg: number, unit: WeightUnit): string {
  if (unit === 'kg') return kg.toFixed(1);
  const { st, lb } = kgToStLb(kg);
  return `${st}st ${formatLb(lb)}`;
}

// A chart's axis: "78.2", or "12st 4" (pounds to the nearest whole one).
export function formatWeightShort(kg: number, unit: WeightUnit): string {
  if (unit === 'kg') return kg.toFixed(1);
  const { st, lb } = splitTenths(Math.round(lbTenths(kg) / 10) * 10);
  return `${st}st ${lb}`;
}

// The coach sees the member's own units with kilograms alongside: "12 st 4.5 lb (78.2 kg)"; a kilogram member's is just "78.2 kg".
export function formatWeightForCoach(kg: number, unit: WeightUnit): string {
  return unit === 'st_lb' ? `${formatStLb(kg)} (${kg.toFixed(1)} kg)` : `${kg.toFixed(1)} kg`;
}

// A difference for the coach, the same way: "3.1 lb (1.4 kg)".
export function formatWeightDiffForCoach(kg: number, unit: WeightUnit): string {
  return unit === 'st_lb' ? `${formatWeightDiff(kg, 'st_lb')} (${formatWeightDiff(kg, 'kg')})` : formatWeightDiff(kg, 'kg');
}

// The two boxes as they show a stored weight: { st: "12", lb: "4.5" }, or both blank.
export function stLbFields(kg: number | null | undefined): { st: string; lb: string } {
  if (kg == null || !Number.isFinite(kg) || kg <= 0) return { st: '', lb: '' };
  const { st, lb } = kgToStLb(kg);
  return { st: String(st), lb: formatLb(lb) };
}

// What was typed in the stones and pounds boxes, as kilograms. Both blank clears the weight (null). Stones are whole; pounds go up to
// 13.9 (a comma works as the decimal point) and are read to a tenth.
export function parseStLb(stText: string, lbText: string): { ok: true; kg: number | null } | { ok: false; error: string } {
  const stRaw = stText.trim();
  const lbRaw = lbText.trim().replace(',', '.');
  if (stRaw === '' && lbRaw === '') return { ok: true, kg: null };
  if (stRaw !== '' && !/^\d{1,2}$/.test(stRaw)) return { ok: false, error: 'Stones should be a whole number.' };
  const lbNum = lbRaw === '' ? 0 : /^\d+(\.\d*)?$|^\.\d+$/.test(lbRaw) ? Number(lbRaw) : NaN;
  const lb = Math.round(lbNum * 10) / 10;
  if (!Number.isFinite(lb) || lb < 0 || lb >= LB_PER_ST) return { ok: false, error: 'Pounds should be a number from 0 to 13.9.' };
  return { ok: true, kg: stLbToKg(stRaw === '' ? 0 : Number(stRaw), lb) };
}

// Whether saving `next` would change how the stored weight reads in this unit. When it would not, the save is skipped, so a weight that
// is only shown and typed back never moves.
export function sameWeightReading(stored: number | null | undefined, next: number | null, unit: WeightUnit): boolean {
  if (stored == null || next == null) return stored == null && next == null;
  return unit === 'st_lb' ? lbTenths(stored) === lbTenths(next) : stored === next;
}
