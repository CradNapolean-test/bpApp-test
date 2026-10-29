// Supabase returns PostgrestError -- a plain object, not an Error. Throwing it straight
// from a Server Action means Next.js serialises the whole object into the message, so the
// client saw `{code: "P0001", details: Null, hint: ..., message: ...}` instead of the
// actual reason (e.g. "Not enough credits"). Normalising here keeps every data-layer
// function's `if (error) raise(error)` one line while giving the UI something readable.

import { bodyweightMessage, measurementMessage } from '../limits';

// The limits added in migrations 0108-0114 are CHECK constraints, and Postgres words a breach as
// `new row for relation "daily_logs" violates check constraint "daily_logs_bodyweight_range"`.
// Members should read what to fix, not that.
const CONSTRAINT_MESSAGES: Record<string, string> = {
  chat_messages_text_length: 'That message is too long (4,000 characters at most).',
  measurement_logs_cm_range: measurementMessage,
  body_scans_value_ranges: 'One of the scan figures is outside the range allowed. Please check the numbers.',
  body_scans_notes_length: 'Scan notes can be 1,000 characters at most.',
  daily_logs_sleep_range: 'Sleep must be between 0 and 24 hours.',
  daily_logs_steps_range: 'Steps must be between 0 and 100,000.',
  daily_logs_water_range: 'Water must be between 0 and 15 litres.',
  daily_logs_bodyweight_range: bodyweightMessage,
  daily_logs_notes_length: 'Notes can be 1,000 characters at most.',
  daily_logs_calories_range: 'Calories must be between 0 and 100,000.',
  client_profiles_name_length: 'Name can be 100 characters at most.',
  client_profiles_phone_length: 'Phone number can be 30 characters at most.',
  client_profiles_address_length: 'Address can be 300 characters at most.',
  client_profiles_emergency_name_length: 'Emergency contact name can be 100 characters at most.',
  client_profiles_emergency_phone_length: 'Emergency contact number can be 30 characters at most.',
  client_profiles_goal_length: 'Goal description can be 5,000 characters at most.',
  client_profiles_experience_length: 'Experience can be 2,000 characters at most.',
  client_profiles_health_notes_length: 'Health notes can be 2,000 characters at most.',
  client_profiles_height_range: 'Height must be between 100 and 250 cm.',
  member_feedback_comment_length: 'Comments can be 1,000 characters at most.',
  recipes_name_length: 'Recipe names can be 100 characters at most.',
  recipes_servings_range: 'Servings must be between 1 and 100.',
  recipe_ingredients_portions_range: 'Amounts must be more than 0 and no more than 10,000.',
  meal_plan_entries_portions_range: 'Amounts must be more than 0 and no more than 10,000.',
  big_dog_results_text_length: 'That result is too long.',
  big_dog_results_value_range: 'That result is outside the range allowed.',
  big_dog_results_key_length: 'That exercise name is too long.',
  food_photo_entries_description_length: 'Descriptions can be 500 characters at most.',
  food_photo_entries_photo_or_note: 'Add a photo or a short description of the meal.',
  food_photo_entries_estimates_range: 'Those estimates are outside the range allowed.',
  manual_macro_entries_range: 'Calories and macros must be between 0 and 10,000 (calories up to 100,000).',
};

export function friendlyMessage(message: string): string {
  const match = /violates check constraint "([^"]+)"/.exec(message);
  if (match && CONSTRAINT_MESSAGES[match[1]]) return CONSTRAINT_MESSAGES[match[1]];
  if (/violates row-level security policy/i.test(message) && /\bfoods\b/.test(message)) {
    return "That food couldn't be saved. Check you're signed in, or enter it by hand instead.";
  }
  return message;
}

export function raise(error: { message?: string; hint?: string | null } | null): never {
  const message = error?.message?.trim();
  throw new Error(message && message.length > 0 ? friendlyMessage(message) : 'Request failed');
}
