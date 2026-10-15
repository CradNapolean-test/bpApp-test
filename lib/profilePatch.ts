// Saving the Setup screen (R15, SU2, SU3).
//
// Before: the form held the WHOLE database row and a save wrote every column back. A coach change made while the member had Setup open
// (the review flag, tracking mode, targets, reminder days) was overwritten by the member's old copy, and when the coach had changed a
// field the database protects, the save failed with "Not authorized to change coach-managed profile fields", which the member could not
// make sense of. Now the form edits an allow-list of fields, a save sends only the ones that changed, and the protected-field errors
// are explained.

type Values = Record<string, unknown>;

// What a member can edit on Setup. Measurements, lifts, notification switches and the rest of the row have their own screens.
export const MEMBER_SETUP_FIELDS = [
  'name', 'gender', 'phone', 'date_of_birth', 'address', 'emergency_contact_name', 'emergency_contact_phone',
  'goal_description', 'experience', 'start_weight', 'goal_weight',
] as const;

// A coach also edits the calorie engine's inputs here.
export const COACH_SETUP_FIELDS = [
  ...MEMBER_SETUP_FIELDS,
  'age', 'body_fat_pct', 'activity_level', 'diet_approach', 'nutrition_goal', 'nutrition_setting', 'cycling',
] as const;

// An empty text box and no value are the same thing.
const same = (a: unknown, b: unknown) => (a === '' || a === undefined ? null : a) === (b === '' || b === undefined ? null : b);

// The fields to send: none the person did not change. With no stored profile yet (a member's first save) every allowed field is sent,
// because the row has to be created whole. The starting weight is the baseline the calorie engine and progress charts work from, so a
// member cannot change it after the first save (their coach can): `startWeightLocked`.
export function profilePatch(
  baseline: Values | null,
  form: Values,
  allowed: readonly string[],
  options: { startWeightLocked?: boolean } = {}
): Values {
  const patch: Values = {};
  for (const field of allowed) {
    if (field === 'start_weight' && options.startWeightLocked) continue;
    if (baseline === null || !same(baseline[field], form[field])) patch[field] = form[field] === '' ? null : form[field];
  }
  return patch;
}

// When fresh data arrives from the server while the form is open (after a save, or because the coach changed something), take it for
// every field the person has not touched, and keep what they are typing in the fields they have. Their typing is then compared with the
// new stored values, so a later save still sends only what they changed.
export function mergeIncoming(
  baseline: Values,
  form: Values,
  incoming: Values,
  allowed: readonly string[]
): { baseline: Values; form: Values } {
  const nextForm: Values = { ...form, ...incoming };
  for (const field of allowed) {
    const touched = !same(baseline[field], form[field]);
    if (touched) nextForm[field] = form[field];
  }
  return { baseline: { ...incoming }, form: nextForm };
}

const COACH_CHANGED = /coach-managed profile fields|manages your nutrition plan|only your coach/i;

// The database refuses a member's change to something their coach controls. Say what happened in words the member can act on.
export function friendlyProfileError(message: string): string {
  if (COACH_CHANGED.test(message)) return 'Your coach has updated these details. Reload the page to see the latest, then make your change again.';
  return message;
}
