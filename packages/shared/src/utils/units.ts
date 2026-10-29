// Weights and heights the member may type in the units they know (UK members often only know stones and feet).
// The database always holds kilograms and centimetres.

export const KG_PER_ST = 6.35029;
export const KG_PER_LB = 0.453592;
export const CM_PER_IN = 2.54;

// Stones and pounds to kilograms, to one decimal; null when nothing (or less) was entered.
export function stLbToKg(st: number | string, lb: number | string): number | null {
  const kg = (Number(st) || 0) * KG_PER_ST + (Number(lb) || 0) * KG_PER_LB;
  return kg > 0 ? Math.round(kg * 10) / 10 : null;
}

// Feet and inches to whole centimetres; null when nothing (or less) was entered.
export function ftInToCm(ft: number | string, inch: number | string): number | null {
  const cm = ((Number(ft) || 0) * 12 + (Number(inch) || 0)) * CM_PER_IN;
  return cm > 0 ? Math.round(cm) : null;
}

// Kilograms shown as stones and pounds (pounds to one decimal), carrying 14 lb into a stone.
export function kgToStLb(kg: number): { st: number; lb: number } {
  const totalLb = Math.round((kg / KG_PER_LB) * 10) / 10;
  let st = Math.floor(totalLb / 14);
  let lb = Math.round((totalLb - st * 14) * 10) / 10;
  if (lb >= 14) {
    st += 1;
    lb = 0;
  }
  return { st, lb };
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const totalIn = Math.round(cm / CM_PER_IN);
  return { ft: Math.floor(totalIn / 12), inch: totalIn % 12 };
}
