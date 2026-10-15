import { describe, expect, it } from 'vitest';
import { NOT_A_NUMBER, answerProblems, parseNumberAnswer } from './formAnswers';

describe('parseNumberAnswer (FM2)', () => {
  it('reads real numbers', () => {
    expect(parseNumberAnswer('12')).toEqual({ ok: true, value: 12 });
    expect(parseNumberAnswer(' 12.5 ')).toEqual({ ok: true, value: 12.5 });
    expect(parseNumberAnswer('-3')).toEqual({ ok: true, value: -3 });
    expect(parseNumberAnswer('.5')).toEqual({ ok: true, value: 0.5 });
    expect(parseNumberAnswer('0')).toEqual({ ok: true, value: 0 });
  });

  it('treats blank as not answered, not as an error', () => {
    expect(parseNumberAnswer('')).toEqual({ ok: true, value: null });
    expect(parseNumberAnswer('   ')).toEqual({ ok: true, value: null });
  });

  it('refuses what is only made of number characters', () => {
    for (const bad of ['-', '.', '1.2.3', '--5', '5-', '-.', '1e5', 'abc']) {
      expect(parseNumberAnswer(bad)).toEqual({ ok: false, error: NOT_A_NUMBER });
    }
  });
});

describe('answerProblems', () => {
  const questions = [
    { id: 'age', question_type: 'number', required: true },
    { id: 'weight', question_type: 'number', required: false },
    { id: 'goal', question_type: 'long_text', required: true },
    { id: 'days', question_type: 'multi_choice', required: true },
  ];

  it('is clean when everything required is answered properly', () => {
    expect(answerProblems(questions, { age: '34', goal: 'Get fit', days: ['Mon'] })).toEqual({ missing: [], invalid: {} });
  });

  it('a required number question answered with "-" is not answered (it used to pass and be dropped)', () => {
    const result = answerProblems(questions, { age: '-', goal: 'x', days: ['Mon'] });
    expect(result.invalid).toEqual({ age: NOT_A_NUMBER });
    expect(result.missing).toEqual([]);
  });

  it('flags a bad number even when the question is optional', () => {
    expect(answerProblems(questions, { age: '34', weight: '1.2.3', goal: 'x', days: ['Mon'] }).invalid).toEqual({ weight: NOT_A_NUMBER });
  });

  it('lists the required questions with no answer', () => {
    expect(answerProblems(questions, {}).missing).toEqual(['age', 'goal', 'days']);
    expect(answerProblems(questions, { age: '', goal: '  ', days: [] }).missing).toEqual(['age', 'goal', 'days']);
  });
});
