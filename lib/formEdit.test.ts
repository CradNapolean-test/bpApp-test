import { describe, expect, it } from 'vitest';
import {
  buildQuestionPayload,
  describeChanges,
  diffQuestions,
  moveQuestion,
  optionsToText,
  parseOptions,
  removalNote,
  validateDrafts,
  type ExistingQuestion,
  type QuestionDraft,
} from './formEdit';

const draft = (over: Partial<QuestionDraft> = {}): QuestionDraft => ({
  key: over.id ?? 'new-1',
  id: null,
  question_text: 'How many days a week can you train?',
  question_type: 'short_text',
  optionsText: '',
  required: true,
  answerCount: 0,
  ...over,
});

describe('parseOptions', () => {
  it('reads one option per line, so an option can contain a comma', () => {
    expect(parseOptions('Salford, Quays\nWorsley\n')).toEqual(['Salford, Quays', 'Worsley']);
  });
  it('drops blank lines and repeats, and trims', () => {
    expect(parseOptions('  A \n\nB\nA\r\n  ')).toEqual(['A', 'B']);
  });
  it('round-trips with optionsToText', () => {
    expect(parseOptions(optionsToText(['One, two', 'Three']))).toEqual(['One, two', 'Three']);
    expect(optionsToText(null)).toBe('');
  });
});

describe('validateDrafts', () => {
  it('refuses a choice question with no options', () => {
    expect(validateDrafts([draft({ question_type: 'single_choice', question_text: 'Goal?', optionsText: '  \n' })])).toMatch(/Goal\?/);
  });
  it('accepts a choice question with options and ignores empty rows', () => {
    expect(validateDrafts([draft({ question_type: 'multi_choice', optionsText: 'A\nB' }), draft({ question_text: '  ', question_type: 'single_choice' })])).toBeNull();
  });
});

describe('buildQuestionPayload', () => {
  it('keeps the id of a saved question, orders by position and drops empty rows', () => {
    const payload = buildQuestionPayload([
      draft({ id: 'q1', question_text: 'First' }),
      draft({ question_text: '   ' }),
      draft({ question_text: 'Third' }),
    ]);
    expect(payload).toEqual([
      { id: 'q1', order_index: 0, question_text: 'First', question_type: 'short_text', options: null, required: true },
      { order_index: 1, question_text: 'Third', question_type: 'short_text', options: null, required: true },
    ]);
  });
  it('sends options only for choice questions', () => {
    const [choice, text] = buildQuestionPayload([
      draft({ question_type: 'single_choice', optionsText: 'Yes\nNo', question_text: 'Injured?' }),
      draft({ question_type: 'short_text', optionsText: 'left over', question_text: 'Notes' }),
    ]);
    expect(choice.options).toEqual(['Yes', 'No']);
    expect(text.options).toBeNull();
  });
  it('a reorder changes order_index but not ids', () => {
    const moved = moveQuestion([draft({ id: 'a', question_text: 'A' }), draft({ id: 'b', question_text: 'B' })], 1, -1);
    expect(buildQuestionPayload(moved).map((q) => [q.id, q.order_index])).toEqual([['b', 0], ['a', 1]]);
  });
});

describe('diffQuestions (what save_form_template will do)', () => {
  const existing: ExistingQuestion[] = [
    { id: 'answered', question_type: 'short_text', answerCount: 3 },
    { id: 'unanswered', question_type: 'number', answerCount: 0 },
    { id: 'also-answered', question_type: 'single_choice', answerCount: 1 },
  ];

  it('keeps a question that is still in the form (an edited word keeps its id and its answers)', () => {
    const payload = buildQuestionPayload([
      draft({ id: 'answered', question_text: 'Edited word' }),
      draft({ id: 'unanswered', question_type: 'number', question_text: 'Age' }),
      draft({ id: 'also-answered', question_type: 'single_choice', optionsText: 'A', question_text: 'Pick' }),
    ]);
    expect(diffQuestions(existing, payload)).toEqual({ kept: 3, added: 0, removedWithAnswers: 0, removedWithoutAnswers: 0, typeChangedWithAnswers: 0 });
  });

  it('adds a question that has no id', () => {
    const payload = buildQuestionPayload([draft({ id: 'answered' }), draft({ question_text: 'Brand new' })]);
    expect(diffQuestions(existing, payload).added).toBe(1);
  });

  it('removes a question with no answers outright', () => {
    const payload = buildQuestionPayload([draft({ id: 'answered' }), draft({ id: 'also-answered', question_type: 'single_choice', optionsText: 'A' })]);
    const changes = diffQuestions(existing, payload);
    expect(changes.removedWithoutAnswers).toBe(1);
    expect(changes.removedWithAnswers).toBe(0);
    expect(describeChanges(changes)).toBeNull();
  });

  it('archives a removed question that has answers, and says its answers stay on file', () => {
    const payload = buildQuestionPayload([draft({ id: 'unanswered', question_type: 'number' })]);
    const changes = diffQuestions(existing, payload);
    expect(changes.removedWithAnswers).toBe(2);
    expect(describeChanges(changes)).toMatch(/2 removed questions have answers/);
    expect(describeChanges(changes)).toMatch(/stay on file/);
  });

  it('a type change on an answered question archives the old one and starts a new one', () => {
    const payload = buildQuestionPayload([
      draft({ id: 'answered', question_type: 'number' }),
      draft({ id: 'unanswered', question_type: 'number' }),
      draft({ id: 'also-answered', question_type: 'single_choice', optionsText: 'A' }),
    ]);
    const changes = diffQuestions(existing, payload);
    expect(changes.typeChangedWithAnswers).toBe(1);
    expect(changes.kept).toBe(3);
    expect(describeChanges(changes)).toMatch(/1 question changed type/);
  });

  it('a type change on a question nobody answered is just an edit', () => {
    const payload = buildQuestionPayload([
      draft({ id: 'answered' }),
      draft({ id: 'unanswered', question_type: 'long_text' }),
      draft({ id: 'also-answered', question_type: 'single_choice', optionsText: 'A' }),
    ]);
    expect(diffQuestions(existing, payload).typeChangedWithAnswers).toBe(0);
  });

  it('treats a question with an unknown id as new (the database refuses it if it was changed by someone else)', () => {
    expect(diffQuestions(existing, buildQuestionPayload([draft({ id: 'ghost' })])).added).toBe(1);
  });
});

describe('removalNote', () => {
  it('is silent when nobody answered the question', () => {
    expect(removalNote(0)).toBeNull();
  });
  it('tells the coach the answers stay on file', () => {
    expect(removalNote(1)).toBe("1 answer already given. Its answer stays on file for you, members won't see it again.");
    expect(removalNote(4)).toBe("4 answers already given. Its answers stay on file for you, members won't see it again.");
  });
});

describe('moveQuestion', () => {
  it('moves up and down and leaves the list alone at the ends', () => {
    expect(moveQuestion(['a', 'b', 'c'], 1, -1)).toEqual(['b', 'a', 'c']);
    expect(moveQuestion(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
    expect(moveQuestion(['a', 'b'], 0, -1)).toEqual(['a', 'b']);
    expect(moveQuestion(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
});
