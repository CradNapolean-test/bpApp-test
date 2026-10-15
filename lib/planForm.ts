// Checks for the plan (membership package) form (PK1, PK2): untick every screen and the plan saved as "no screens"; leave credits per week blank
// and it saved as 0; a name with spaces round it was saved as typed. Each is now refused or tidied before it is saved.
export const MAX_CREDITS_PER_WEEK = 100;

export type PlanCheck = { ok: true; name: string; creditsPerWeek: number } | { ok: false; error: string };

export function validatePlan(input: { name: string; creditsPerWeek: string; screensSelected: number }): PlanCheck {
  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Give the plan a name.' };
  const credits = input.creditsPerWeek.trim();
  if (!/^\d+$/.test(credits)) return { ok: false, error: 'Enter how many credits a week this plan includes, as a whole number (0 or more).' };
  const creditsPerWeek = Number(credits);
  if (creditsPerWeek > MAX_CREDITS_PER_WEEK) return { ok: false, error: `Credits per week can be at most ${MAX_CREDITS_PER_WEEK}.` };
  if (input.screensSelected < 1) return { ok: false, error: 'Tick at least one screen members on this plan can use.' };
  return { ok: true, name, creditsPerWeek };
}
