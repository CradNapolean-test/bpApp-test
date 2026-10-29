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
    const answered = Array.isArray(a) ? a.length > 0 : (a ?? '').trim() !== '';
    if (q.required && !answered) missing.push(q.id);
  }
  return { missing, invalid };
}
