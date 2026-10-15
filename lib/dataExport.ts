// "Download my data" (H3, DECISION D13): what goes into a member's own export, and what is left out. Pure functions; the server action in
// lib/data/exportMyData.ts reads the rows (as the member, so only what they can already see) and hands them here.

// Tables read by the member's own id, then the tables read through a parent row. Anything a member cannot read comes back empty, so a coach's
// private notes, red-flag follow-ups and journal entries are not in the file; the policy page says so.
export const OWN_TABLES: { table: string; column: string }[] = [
  { table: 'client_profiles', column: 'client_id' },
  { table: 'daily_logs', column: 'client_id' },
  { table: 'measurement_logs', column: 'client_id' },
  { table: 'body_scans', column: 'client_id' },
  { table: 'progress_photos', column: 'client_id' },
  { table: 'workout_programs', column: 'client_id' },
  { table: 'workout_logs', column: 'client_id' },
  { table: 'workout_day_feedback', column: 'client_id' },
  { table: 'workout_block_choices', column: 'client_id' },
  { table: 'client_exercise_maxes', column: 'client_id' },
  { table: 'habits', column: 'client_id' },
  { table: 'meal_plan_entries', column: 'client_id' },
  { table: 'meal_sections', column: 'client_id' },
  { table: 'food_favorites', column: 'client_id' },
  { table: 'recipes', column: 'client_id' },
  { table: 'bookings', column: 'client_id' },
  { table: 'client_memberships', column: 'client_id' },
  { table: 'membership_holds', column: 'client_id' },
  { table: 'credits_ledger', column: 'client_id' },
  { table: 'event_signups', column: 'client_id' },
  { table: 'form_assignments', column: 'client_id' },
  { table: 'big_dog_results', column: 'client_id' },
  { table: 'big_dog_shirts', column: 'client_id' },
  { table: 'education_assignments', column: 'client_id' },
  { table: 'education_course_assignments', column: 'client_id' },
  { table: 'education_lesson_completions', column: 'client_id' },
  { table: 'member_feedback', column: 'client_id' },
  { table: 'nutrition_feedback', column: 'client_id' },
  { table: 'notifications', column: 'client_id' },
  { table: 'reward_grants', column: 'client_id' },
];

// Child tables: [table, the column that points at the parent, the parent table whose ids to use].
export const CHILD_TABLES: { table: string; column: string; parent: string }[] = [
  { table: 'food_diary_entries', column: 'daily_log_id', parent: 'daily_logs' },
  { table: 'food_photo_entries', column: 'daily_log_id', parent: 'daily_logs' },
  { table: 'manual_macro_entries', column: 'daily_log_id', parent: 'daily_logs' },
  { table: 'form_responses', column: 'assignment_id', parent: 'form_assignments' },
  { table: 'workout_program_days', column: 'program_id', parent: 'workout_programs' },
];

type Row = Record<string, unknown>;

// Chat messages as text only: who sent it, when, and the words. Photos and voice notes are not copied into the file (they are files); they
// appear in the list of stored files below.
export function chatTextOnly(rows: Row[]): { id: unknown; sent_at: unknown; from: 'me' | 'someone else'; text: string }[] {
  return rows
    .filter((r) => typeof r.text === 'string' && (r.text as string).trim() !== '')
    .map((r) => ({ id: r.id, sent_at: r.created_at, from: r.sender_id === r.client_id ? 'me' : 'someone else', text: r.text as string }));
}

export interface StoredFile {
  kind: 'progress photo' | 'meal photo' | 'body scan printout' | 'chat photo' | 'chat voice note';
  path: string;
}

// The names of the member's stored files, so the export says what else is held about them. The files themselves are not inside the JSON.
export function storedFiles(input: { progress_photos?: Row[]; food_photo_entries?: Row[]; body_scans?: Row[]; chat_messages?: Row[] }): StoredFile[] {
  const files: StoredFile[] = [];
  const add = (kind: StoredFile['kind'], value: unknown) => {
    if (typeof value === 'string' && value) files.push({ kind, path: value });
  };
  for (const r of input.progress_photos ?? []) add('progress photo', r.storage_path);
  for (const r of input.food_photo_entries ?? []) add('meal photo', r.storage_path);
  for (const r of input.body_scans ?? []) add('body scan printout', r.printout_path);
  for (const r of input.chat_messages ?? []) {
    add('chat photo', r.image_path);
    add('chat voice note', r.audio_path);
  }
  return files;
}

export interface MemberExport {
  about: string;
  generated_at: string;
  account: { id: string; email: string | null };
  data: Record<string, unknown[]>;
  chat_messages: ReturnType<typeof chatTextOnly>;
  stored_files: StoredFile[];
}

export function buildExport(input: { userId: string; email: string | null; generatedAt: Date; tables: Record<string, Row[]>; chat: Row[] }): MemberExport {
  const data: Record<string, unknown[]> = {};
  for (const [name, rows] of Object.entries(input.tables)) data[name] = rows;
  return {
    about:
      "A copy of the information the app holds about you that you can see yourself. Photos, scan printouts and voice notes are files, so they are listed under stored_files rather than copied in. Your coach's private notes are not included. Ask your gym if you want those too.",
    generated_at: input.generatedAt.toISOString(),
    account: { id: input.userId, email: input.email },
    data,
    chat_messages: chatTextOnly(input.chat),
    stored_files: storedFiles({ ...input.tables, chat_messages: input.chat }),
  };
}

export function exportFilename(now: Date = new Date()): string {
  return `my-data-${now.toISOString().slice(0, 10)}.json`;
}

// How many exports a member may ask for in a day: each reads a lot of the database.
export const EXPORTS_PER_DAY = 3;
