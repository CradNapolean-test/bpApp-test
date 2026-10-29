import { describe, expect, it } from 'vitest';

import type { FormQuestionRow } from '../data/types';
import { answerText, answeredCount, buildSubmission, cleanNumberInput, estimatedMinutes, isAnswered, parseDraft, toPayload } from './forms';

const q = (id: string, type: FormQuestionRow['question_type'], required = true): FormQuestionRow => ({
  id,
  template_id: 't',
  order_index: 0,
  question_text: id,
  question_type: type,
  options: type.endsWith('choice') ? ['a', 'b'] : null,
  required,
  archived_at: null,
});

describe('isAnswered', () => {
  it('treats blank text and empty lists as not answered', () => {
    expect(isAnswered(undefined)).toBe(false);
    expect(isAnswered('')).toBe(false);
    expect(isAnswered('   ')).toBe(false);
    expect(isAnswered([])).toBe(false);
    expect(isAnswered('x')).toBe(true);
    expect(isAnswered(['a'])).toBe(true);
  });
});

describe('toPayload', () => {
  it('stores text trimmed, numbers as numbers and multi-choice as a list', () => {
    expect(toPayload(q('a', 'short_text'), '  hello ')).toBe('hello');
    expect(toPayload(q('a', 'number'), '12.5')).toBe(12.5);
    expect(toPayload(q('a', 'number'), '-3')).toBe(-3);
    expect(toPayload(q('a', 'multi_choice'), ['a', 'b'])).toEqual(['a', 'b']);
    expect(toPayload(q('a', 'single_choice'), 'b')).toBe('b');
  });
  it('gives null for a blank answer or a number that is not one', () => {
    expect(toPayload(q('a', 'short_text'), '')).toBeNull();
    expect(toPayload(q('a', 'number'), '')).toBeNull();
    expect(toPayload(q('a', 'number'), '1.2.3')).toBeNull();
    expect(toPayload(q('a', 'number'), '-')).toBeNull();
  });
  it('sends an empty list for multi-choice, which the web also does', () => {
    expect(toPayload(q('a', 'multi_choice'), undefined)).toEqual([]);
  });
});

describe('cleanNumberInput', () => {
  it('keeps digits, dots and minus signs only', () => {
    expect(cleanNumberInput('12a.5 kg')).toBe('12.5');
    expect(cleanNumberInput('-7')).toBe('-7');
    expect(cleanNumberInput('1,000')).toBe('1000');
  });
});

describe('buildSubmission', () => {
  const questions = [q('one', 'short_text'), q('two', 'number', false), q('three', 'multi_choice'), q('four', 'long_text', false)];
  it('lists the required questions still empty, in order', () => {
    expect(buildSubmission(questions, {}).missing).toEqual(['one', 'three']);
    expect(buildSubmission(questions, { one: 'x' }).missing).toEqual(['three']);
    expect(buildSubmission(questions, { one: 'x', three: ['a'] }).missing).toEqual([]);
  });
  it('leaves unanswered optional questions out of what is sent', () => {
    const { payload } = buildSubmission(questions, { one: 'x', three: ['a', 'b'], two: '4' });
    expect(payload).toEqual([
      { question_id: 'one', answer: 'x' },
      { question_id: 'two', answer: 4 },
      { question_id: 'three', answer: ['a', 'b'] },
    ]);
  });
});

describe('number questions (FM2)', () => {
  const numberQs = [q('n1', 'number'), q('n2', 'number', false)];
  it('does not count "-" or "1.2.3" as an answer, and says so instead of silently dropping it', () => {
    const r = buildSubmission(numberQs, { n1: '-', n2: '1.2.3' });
    expect(r.invalid).toEqual({ n1: 'Enter a number, like 12 or 12.5.', n2: 'Enter a number, like 12 or 12.5.' });
    expect(r.payload).toEqual([]);
  });
  it('accepts a real number, including a negative or a decimal', () => {
    const r = buildSubmission(numberQs, { n1: '-3.5', n2: '12' });
    expect(r.invalid).toEqual({});
    expect(r.missing).toEqual([]);
    expect(r.payload).toEqual([{ question_id: 'n1', answer: -3.5 }, { question_id: 'n2', answer: 12 }]);
  });
  it('a required number question left empty is missing, not invalid', () => {
    const r = buildSubmission(numberQs, { n1: '', n2: '' });
    expect(r.missing).toEqual(['n1']);
    expect(r.invalid).toEqual({});
  });
  it('does not count an invalid number towards the answered total', () => {
    expect(answeredCount(numberQs, { n1: '-', n2: '4' })).toBe(1);
  });
});

describe('answeredCount', () => {
  it('counts answered questions only', () => {
    expect(answeredCount([{ id: 'a', question_type: 'short_text' }, { id: 'b', question_type: 'short_text' }, { id: 'c', question_type: 'multi_choice' }], { a: 'x', b: '', c: ['z'] })).toBe(2);
  });
});

describe('answerText', () => {
  it('shows a dash for nothing, a list joined, anything else as text', () => {
    expect(answerText(null)).toBe('—');
    expect(answerText('')).toBe('—');
    expect(answerText([])).toBe('—');
    expect(answerText(['a', 'b'])).toBe('a, b');
    expect(answerText(42)).toBe('42');
  });
});

describe('estimatedMinutes', () => {
  it('is half a minute a question, at least one minute', () => {
    expect(estimatedMinutes(1)).toBe(1);
    expect(estimatedMinutes(6)).toBe(3);
    expect(estimatedMinutes(11)).toBe(6);
  });
});

describe('parseDraft', () => {
  const questions = [{ id: 'a' }, { id: 'b' }];
  it('reads a saved draft', () => {
    expect(parseDraft(JSON.stringify({ a: 'x', b: ['1', '2'] }), questions)).toEqual({ a: 'x', b: ['1', '2'] });
  });
  it('drops answers for questions that are not in this form and values of the wrong shape', () => {
    expect(parseDraft(JSON.stringify({ a: 'x', zzz: 'y', b: 7 }), questions)).toEqual({ a: 'x' });
  });
  it('survives rubbish', () => {
    expect(parseDraft(null, questions)).toEqual({});
    expect(parseDraft('not json', questions)).toEqual({});
    expect(parseDraft('[1,2]', questions)).toEqual({});
    expect(parseDraft('"s"', questions)).toEqual({});
  });
});
