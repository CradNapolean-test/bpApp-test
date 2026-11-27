// What a member typed into a form question, before it is sent (FM2).
//
// A number question took any text made of digits, dots and dashes. "-" or "1.2.3" counted as ANSWERED (so a required question passed), then
// turned into nothing when sent and was silently left out. Now a number question only accepts a real number, says so when it is not one,
// and an invalid figure never counts as an answer.

export type NumberAnswer = { ok: true; value: number | null } | { ok: false; error: string };

export const NOT_A_NUMBER = 'Enter a number, like 12 or 12.5.';

// '' is "not answered yet" (value null, not an error); a real number is its value; anything else is refused.
export function parseNumberAnswer(text: string): NumberAnswer {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(trimmed)) return { ok: false, error: NOT_A_NUMBER };
  const value = Number(trimmed);
  return Number.isFinite(value) ? { ok: true, value } : { ok: false, error: NOT_A_NUMBER };
}

export type FormAnswer = string | string[];

interface QuestionLike {
  id: string;
  question_type: string;
  required: boolean;
}

// What stops this form being sent: required questions with no (valid) answer, and number answers that are not numbers.
export function answerProblems(
  questions: QuestionLike[],
  answers: Record<string, FormAnswer | undefined>
): { missing: string[]; invalid: Record<string, string> } {
  const missing: string[] = [];
  const invalid: Record<string, string> = {};
  for (const q of questions) {
    const a = answers[q.id];
    if (q.question_type === 'number') {
      const parsed = parseNumberAnswer(typeof a === 'string' ? a : '');
      if (!parsed.ok) {
        invalid[q.id] = parsed.error;
        continue;
      }
      if (q.required && parsed.value === null) missing.push(q.id);
      continue;
    }
    if (q.question_type === 'yes_no' || q.question_type === 'scale') {
      // Never "invalid": anything that isn't a yes / no or a point on the scale is just not answered (LB22).
      if (q.required && newTypePayload(q.question_type, a) == null) missing.push(q.id);
      continue;
    }
    const answered = Array.isArray(a) ? a.length > 0 : (a ?? '').trim() !== '';
    if (q.required && !answered) missing.push(q.id);
  }
  return { missing, invalid };
}

// ---- Yes / no and 1-10 scale questions (LB22, migration 0179) ----
// On the form they are held as text like every other answer ('yes' / 'no', '1' to '10'), so a draft kept on the device still reads back.
// Anything else (an old or odd draft) simply counts as not answered: it never stops a form being sent.

export const SCALE_MIN = 1;
export const SCALE_MAX = 10;
export const SCALE_POINTS = Array.from({ length: SCALE_MAX - SCALE_MIN + 1 }, (_, i) => SCALE_MIN + i);

// 'yes' -> true, 'no' -> false (any case: a draft from before the coach turned a "Yes / No" choice question into yes / no reads "Yes"),
// anything else -> null (not answered). The database takes the same (0179).
export function yesNoValue(a: FormAnswer | undefined): boolean | null {
  const t = typeof a === 'string' ? a.trim().toLowerCase() : '';
  if (t === 'yes') return true;
  if (t === 'no') return false;
  return null;
}

// '1' to '10' -> that whole number; anything else -> null (not answered).
export function scaleValue(a: FormAnswer | undefined): number | null {
  if (typeof a !== 'string' || !/^\d{1,2}$/.test(a.trim())) return null;
  const n = Number(a.trim());
  return n >= SCALE_MIN && n <= SCALE_MAX ? n : null;
}

// What is sent for one of these answers (true / false, or the whole number), or null to leave it out. undefined: not one of these types.
export function newTypePayload(questionType: string, a: FormAnswer | undefined): boolean | number | null | undefined {
  if (questionType === 'yes_no') return yesNoValue(a);
  if (questionType === 'scale') return scaleValue(a);
  return undefined;
}

// An answer as shown in a finished form, for the member and the coach: Yes / No, "7 out of 10", a list, the text, or a dash.
export function formAnswerText(questionType: string, answer: unknown): string {
  if (questionType === 'yes_no' && typeof answer === 'boolean') return answer ? 'Yes' : 'No';
  if (questionType === 'scale' && typeof answer === 'number') return `${answer} out of ${SCALE_MAX}`;
  if (Array.isArray(answer)) return answer.length ? answer.join(', ') : '—';
  return answer == null || answer === '' ? '—' : String(answer);
}
