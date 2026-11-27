import { beforeEach, describe, expect, it, vi } from 'vitest';
import { answerProblems, formAnswerText, newTypePayload, scaleValue, yesNoValue } from './formAnswers';
import { PHONE_PENDING_NOTE, buildQuestionPayload, draftOptions, isAlwaysOptional, scaleOptions, validateDrafts, type QuestionDraft } from './formEdit';
// The phone app's own rules, as released (read only here): what it does with a type it doesn't know.
import { answerProblems as phoneAnswerProblems } from '../packages/shared/src/utils/formAnswers';
import { buildSubmission as phoneBuildSubmission } from '../packages/shared/src/utils/forms';

const createClient = vi.hoisted(() => vi.fn());
vi.mock('@/lib/supabase/server', () => ({ createClient }));
import { newFormQuestionTypesReady } from './data/forms';

// Yes / no and 1-10 scale questions (LB22).

const draft = (over: Partial<QuestionDraft>): QuestionDraft => ({
  key: 'k',
  id: null,
  question_text: 'Any pain when you train?',
  question_type: 'yes_no',
  optionsText: '',
  scaleLow: '',
  scaleHigh: '',
  required: true,
  answerCount: 0,
  ...over,
});

describe('the answers (member side, web)', () => {
  it('sends yes / no as true or false and a scale as its whole number', () => {
    expect(newTypePayload('yes_no', 'yes')).toBe(true);
    expect(newTypePayload('yes_no', 'no')).toBe(false);
    expect(newTypePayload('scale', '7')).toBe(7);
    expect(newTypePayload('scale', '10')).toBe(10);
    expect(newTypePayload('short_text', 'yes')).toBeUndefined();
  });

  it('treats anything else as not answered, so it is left out instead of sent wrong', () => {
    for (const odd of [undefined, '', 'Yes', 'true', ['yes']]) expect(yesNoValue(odd)).toBeNull();
    for (const odd of [undefined, '', '0', '11', '7.5', ' 7x', '-1', ['7']]) expect(scaleValue(odd)).toBeNull();
    expect(scaleValue(' 3 ')).toBe(3);
  });

  it('never calls one of these answers invalid, so it can never stop a form being sent', () => {
    const questions = [
      { id: 'a', question_type: 'yes_no', required: false },
      { id: 'b', question_type: 'scale', required: false },
    ];
    expect(answerProblems(questions, { a: 'maybe', b: '42' })).toEqual({ missing: [], invalid: {} });
    expect(answerProblems(questions, {})).toEqual({ missing: [], invalid: {} });
    // Were one ever required (once the phone app is updated), an unanswered one would be missing like any other question.
    expect(answerProblems([{ id: 'a', question_type: 'yes_no', required: true }], {})).toEqual({ missing: ['a'], invalid: {} });
    expect(answerProblems([{ id: 'a', question_type: 'yes_no', required: true }], { a: 'no' })).toEqual({ missing: [], invalid: {} });
  });

  it('shows the answers as Yes / No and "7 out of 10" wherever form answers show', () => {
    expect(formAnswerText('yes_no', true)).toBe('Yes');
    expect(formAnswerText('yes_no', false)).toBe('No');
    expect(formAnswerText('scale', 7)).toBe('7 out of 10');
    expect(formAnswerText('scale', null)).toBe('—');
    expect(formAnswerText('multi_choice', ['A', 'B'])).toBe('A, B');
    expect(formAnswerText('number', 12.5)).toBe('12.5');
  });
});

describe('the form editor', () => {
  it('saves yes / no and scale as optional whatever the box says, and other types as ticked', () => {
    const payload = buildQuestionPayload([draft({ required: true }), draft({ question_type: 'scale', required: true }), draft({ question_type: 'short_text', required: true })]);
    expect(payload.map((q) => q.required)).toEqual([false, false, true]);
    expect(isAlwaysOptional('yes_no') && isAlwaysOptional('scale') && !isAlwaysOptional('number')).toBe(true);
    expect(PHONE_PENDING_NOTE).toBe('Members using the phone app can answer this once the app is updated.');
  });

  it("keeps a scale's words under 1 and 10 as [low, high], or none", () => {
    expect(buildQuestionPayload([draft({ question_type: 'scale', scaleLow: ' Not at all ', scaleHigh: '' })])[0].options).toEqual(['Not at all', '']);
    expect(scaleOptions({ scaleLow: ' ', scaleHigh: '' })).toBeNull();
    expect(buildQuestionPayload([draft({ question_type: 'yes_no', optionsText: 'left\nover' })])[0].options).toBeNull();
    expect(draftOptions('scale', ['Low', 'High'])).toEqual({ optionsText: '', scaleLow: 'Low', scaleHigh: 'High' });
    expect(draftOptions('single_choice', ['A', 'B'])).toEqual({ optionsText: 'A\nB', scaleLow: '', scaleHigh: '' });
  });

  it("refuses a scale word longer than the database takes (60 characters)", () => {
    expect(validateDrafts([draft({ question_type: 'scale', scaleHigh: 'x'.repeat(61) })])).toContain('up to 60 characters');
    expect(validateDrafts([draft({ question_type: 'scale', scaleHigh: 'x'.repeat(60) })])).toBeNull();
  });
});

describe('the phone app as released (it knows neither type)', () => {
  // A form as the editor saves it: a required text question, and a yes / no and a scale question (saved optional).
  const saved = buildQuestionPayload([
    draft({ question_type: 'short_text', question_text: 'Name', required: true }),
    draft({ question_type: 'yes_no', required: true }),
    draft({ question_type: 'scale', question_text: 'Energy?', required: true }),
  ]).map((q, i) => ({ ...q, id: `q${i}`, template_id: 't', archived_at: null }));

  it('lets a member on the phone send the form: the two questions it cannot show are never missing', () => {
    expect(phoneAnswerProblems(saved, { q0: 'Sam' })).toEqual({ missing: [], invalid: {} });
    // The phone's types don't list the new types; at run time it gets them from the database as plain text, as here.
    const submission = phoneBuildSubmission(saved as unknown as Parameters<typeof phoneBuildSubmission>[0], { q0: 'Sam' });
    expect(submission.missing).toEqual([]);
    // Only the answer it has is sent; the database accepts a question left out.
    expect(submission.payload).toEqual([{ question_id: 'q0', answer: 'Sam' }]);
  });

  it('would have stopped the member had either been required, which is why they are optional for now', () => {
    const required = saved.map((q) => ({ ...q, required: true }));
    expect(phoneAnswerProblems(required, { q0: 'Sam' }).missing).toEqual(['q1', 'q2']);
  });
});

describe('newFormQuestionTypesReady (the editor offers the types only once 0179 is applied)', () => {
  beforeEach(() => createClient.mockReset());
  const withRpc = (result: { data: unknown; error: { code: string } | null }) => createClient.mockResolvedValue({ rpc: async () => result });

  it('is true when the database lists both types', async () => {
    withRpc({ data: ['short_text', 'long_text', 'number', 'single_choice', 'multi_choice', 'yes_no', 'scale'], error: null });
    expect(await newFormQuestionTypesReady()).toBe(true);
  });

  it("is false before 0179 (the function isn't there) or when it lists them not", async () => {
    withRpc({ data: null, error: { code: 'PGRST202' } });
    expect(await newFormQuestionTypesReady()).toBe(false);
    withRpc({ data: ['short_text'], error: null });
    expect(await newFormQuestionTypesReady()).toBe(false);
  });
});
