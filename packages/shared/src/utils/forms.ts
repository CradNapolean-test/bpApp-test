import type { FormQuestionRow } from '../data/types';
import { answerProblems, parseNumberAnswer } from './formAnswers';

// Filling in a coach's form (member side). Pure rules shared by the phone app and anything else that needs them; the
// screen only draws the questions. Same behaviour as the web FormsTab.

export type FormAnswer = string | string[];

// Longest answer the app lets a member type; migration 0111 caps what the database will take (a little more, since it
// measures the stored JSON).
export const MAX_SHORT_ANSWER = 300;
export const MAX_LONG_ANSWER = 2000;

export function isAnswered(a: FormAnswer | undefined): boolean {
  return Array.isArray(a) ? a.length > 0 : (a ?? '').trim() !== '';
}

// A number question takes digits, one decimal point and a minus sign, nothing else.
export function cleanNumberInput(text: string): string {
  return text.replace(/[^0-9.-]/g, '');
}

// What is stored for one answer: text as given, a number for a number question, the list for multi-choice, null when blank.
export function toPayload(q: Pick<FormQuestionRow, 'question_type'>, a: FormAnswer | undefined): unknown {
  if (q.question_type === 'multi_choice') return Array.isArray(a) ? a : [];
  if (!isAnswered(a)) return null;
  const text = String(a).trim();
  if (q.question_type === 'number') {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return text;
}

// A number question counts as answered only when what was typed is a real number: "-" or "1.2.3" is not an answer (FM2).
export function answeredCount(questions: Pick<FormQuestionRow, 'id' | 'question_type'>[], answers: Record<string, FormAnswer>): number {
  return questions.filter((q) => {
    const a = answers[q.id];
    if (q.question_type === 'number') {
      const parsed = parseNumberAnswer(typeof a === 'string' ? a : '');
      return parsed.ok && parsed.value !== null;
    }
    return isAnswered(a);
  }).length;
}

// `invalid` holds the number questions whose text is not a real number, with what to tell the member; they block sending (FM2).
export type Submission = { missing: string[]; invalid: Record<string, string>; payload: { question_id: string; answer: unknown }[] };

// The required questions still empty (ids, in question order) and what would be sent. An unanswered optional question is
// simply left out: the database refuses an empty answer, and it shows as a dash in the finished form either way.
export function buildSubmission(questions: FormQuestionRow[], answers: Record<string, FormAnswer>): Submission {
  const { missing, invalid } = answerProblems(questions, answers);
  const payload = questions
    .map((q) => ({ question_id: q.id, answer: toPayload(q, answers[q.id]) }))
    .filter((p) => p.answer !== null);
  return { missing, invalid, payload };
}

// An answer as shown in a finished form.
export function answerText(answer: unknown): string {
  if (Array.isArray(answer)) return answer.length ? answer.join(', ') : '—';
  return answer == null || answer === '' ? '—' : String(answer);
}

// "6 questions · about 3 min", as on the web card.
export function estimatedMinutes(questionCount: number): number {
  return Math.max(1, Math.round(questionCount * 0.5));
}

// A saved draft is only trusted if it has the right shape: strings and lists of strings, keyed by question id of this form.
export function parseDraft(raw: string | null, questions: Pick<FormQuestionRow, 'id'>[]): Record<string, FormAnswer> {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
    const known = new Set(questions.map((q) => q.id));
    const out: Record<string, FormAnswer> = {};
    for (const [id, v] of Object.entries(data as Record<string, unknown>)) {
      if (!known.has(id)) continue;
      if (typeof v === 'string') out[id] = v;
      else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[id] = v as string[];
    }
    return out;
  } catch {
    return {};
  }
}
