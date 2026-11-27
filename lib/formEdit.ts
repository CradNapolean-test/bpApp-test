// The form editor's state turned into what save_form_template (migration 0135) takes, and a plain-English preview of what a save will
// do to answers already given (R3). The database does the real diff in one transaction; diffQuestions below mirrors its rules so the
// editor can say what is about to happen before the coach confirms.
import type { FormQuestionType } from '@/lib/data/types';

export const CHOICE_TYPES: FormQuestionType[] = ['single_choice', 'multi_choice'];

// Yes / no and 1-10 scale questions (LB22, migration 0179). The phone app as released draws no box for a type it doesn't know, and holds back
// a form whose required question has no answer, so until the phone app is updated these are always optional: a member on the phone can
// still send the form, just without that answer. The database holds the same rule (form_questions_yes_no_scale_optional).
export const PHONE_PENDING_TYPES: FormQuestionType[] = ['yes_no', 'scale'];
export const PHONE_PENDING_NOTE = 'Members using the phone app can answer this once the app is updated.';
export const SCALE_LABEL_MAX = 60;

export function isAlwaysOptional(type: FormQuestionType): boolean {
  return PHONE_PENDING_TYPES.includes(type);
}

export interface QuestionDraft {
  // Stable key for React lists (an existing question's id, or a made-up one for a new question).
  key: string;
  // The saved question's id; null for a question added in this editing session.
  id: string | null;
  question_text: string;
  question_type: FormQuestionType;
  // One option per line, so an option can contain a comma.
  optionsText: string;
  // A scale question's words under 1 and 10 (both optional).
  scaleLow?: string;
  scaleHigh?: string;
  required: boolean;
  // How many answers this question already has (0 for a new question).
  answerCount: number;
}

export interface QuestionPayload {
  id?: string;
  order_index: number;
  question_text: string;
  question_type: FormQuestionType;
  options: string[] | null;
  required: boolean;
}

export interface ExistingQuestion {
  id: string;
  question_type: FormQuestionType;
  answerCount: number;
}

export interface QuestionChanges {
  kept: number;
  added: number;
  removedWithAnswers: number;
  removedWithoutAnswers: number;
  // Questions whose type changed while they had answers: the old one is archived and a new, empty one takes its place.
  typeChangedWithAnswers: number;
}

export function isChoice(type: FormQuestionType): boolean {
  return CHOICE_TYPES.includes(type);
}

// One option per line; blank lines and repeats are dropped.
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const options: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const option = line.trim();
    if (option && !seen.has(option)) {
      seen.add(option);
      options.push(option);
    }
  }
  return options;
}

export function optionsToText(options: string[] | null | undefined): string {
  return (options ?? []).join('\n');
}

// A saved question's options as the editor holds them: choices one per line, a scale's [low, high] labels in their own boxes.
export function draftOptions(type: FormQuestionType, options: string[] | null | undefined): Pick<QuestionDraft, 'optionsText' | 'scaleLow' | 'scaleHigh'> {
  if (type === 'scale') return { optionsText: '', scaleLow: options?.[0] ?? '', scaleHigh: options?.[1] ?? '' };
  return { optionsText: isChoice(type) ? optionsToText(options) : '', scaleLow: '', scaleHigh: '' };
}

// What a scale question stores: [low, high] when either has words, else nothing.
export function scaleOptions(draft: Pick<QuestionDraft, 'scaleLow' | 'scaleHigh'>): string[] | null {
  const low = (draft.scaleLow ?? '').trim();
  const high = (draft.scaleHigh ?? '').trim();
  return low || high ? [low, high] : null;
}

// A question with no text is an empty row the coach never filled in: it is left out when saving (and counts as removed if it was saved).
const isBlank = (draft: QuestionDraft) => draft.question_text.trim().length === 0;

// The first thing that stops the form saving, or null. A choice question with no options must not save.
export function validateDrafts(drafts: QuestionDraft[]): string | null {
  for (const draft of drafts) {
    if (isBlank(draft)) continue;
    if (isChoice(draft.question_type) && parseOptions(draft.optionsText).length === 0) {
      return `Add at least one option to "${draft.question_text.trim()}", one per line.`;
    }
    if (draft.question_type === 'scale' && (scaleOptions(draft) ?? []).some((label) => label.length > SCALE_LABEL_MAX)) {
      return `The words under 1 and 10 of "${draft.question_text.trim()}" can be up to ${SCALE_LABEL_MAX} characters each.`;
    }
  }
  return null;
}

export function buildQuestionPayload(drafts: QuestionDraft[]): QuestionPayload[] {
  return drafts
    .filter((draft) => !isBlank(draft))
    .map((draft, index) => {
      const payload: QuestionPayload = {
        order_index: index,
        question_text: draft.question_text.trim(),
        question_type: draft.question_type,
        options: isChoice(draft.question_type) ? parseOptions(draft.optionsText) : draft.question_type === 'scale' ? scaleOptions(draft) : null,
        required: isAlwaysOptional(draft.question_type) ? false : draft.required,
      };
      if (draft.id) payload.id = draft.id;
      return payload;
    });
}

export function diffQuestions(existing: ExistingQuestion[], payload: QuestionPayload[]): QuestionChanges {
  const byId = new Map(existing.map((q) => [q.id, q]));
  const changes: QuestionChanges = { kept: 0, added: 0, removedWithAnswers: 0, removedWithoutAnswers: 0, typeChangedWithAnswers: 0 };
  const keptIds = new Set<string>();
  for (const q of payload) {
    const was = q.id ? byId.get(q.id) : undefined;
    if (!was) {
      changes.added += 1;
      continue;
    }
    keptIds.add(was.id);
    changes.kept += 1;
    if (was.question_type !== q.question_type && was.answerCount > 0) changes.typeChangedWithAnswers += 1;
  }
  for (const q of existing) {
    if (keptIds.has(q.id)) continue;
    if (q.answerCount > 0) changes.removedWithAnswers += 1;
    else changes.removedWithoutAnswers += 1;
  }
  return changes;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

// What to tell the coach before saving, or null when the save does not touch any answered question.
export function describeChanges(changes: QuestionChanges): string | null {
  const parts: string[] = [];
  if (changes.removedWithAnswers > 0) {
    const n = changes.removedWithAnswers;
    parts.push(
      `${n} removed ${plural(n, 'question has', 'questions have')} answers. The answers stay on file for you; members won't see ${plural(n, 'it', 'them')} again.`
    );
  }
  if (changes.typeChangedWithAnswers > 0) {
    const n = changes.typeChangedWithAnswers;
    parts.push(
      `${n} ${plural(n, 'question changed', 'questions changed')} type, so the old answers are kept on file and the question starts empty.`
    );
  }
  return parts.length > 0 ? parts.join(' ') : null;
}

// The confirmation for taking one question out of the editor, or null when nobody has answered it.
export function removalNote(answerCount: number): string | null {
  if (answerCount <= 0) return null;
  return `${answerCount} ${plural(answerCount, 'answer', 'answers')} already given. Its ${plural(answerCount, 'answer stays', 'answers stay')} on file for you, members won't see it again.`;
}

// Moves one item up (-1) or down (1); out-of-range moves leave the list as it is.
export function moveQuestion<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
