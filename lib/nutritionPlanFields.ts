// CL8 (owner, 21 Nov 2026): a member's nutrition plan (the calorie engine's inputs) and their daily targets override moved out of the
// coach's Details into the coach's view of the member's Nutrition. Each screen now saves only its own fields: Details the member's
// details and goal (the same fields a member edits), the Nutrition plan card these. Together they are the coach's old Setup list
// (COACH_SETUP_FIELDS in lib/profilePatch.ts), which nutritionPlanFields.test.ts holds them to.
import { MEMBER_SETUP_FIELDS } from './profilePatch';

export const NUTRITION_PLAN_FIELDS = ['age', 'body_fat_pct', 'activity_level', 'diet_approach', 'nutrition_goal', 'nutrition_setting', 'cycling'] as const;

export type NutritionPlanField = (typeof NUTRITION_PLAN_FIELDS)[number];

// What the coach's Details saves.
export const COACH_DETAILS_FIELDS = MEMBER_SETUP_FIELDS;
