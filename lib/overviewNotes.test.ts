import { describe, expect, it } from 'vitest';
import { overviewNotes } from './overviewNotes';

const note = (id: string, coach: string, created: string, kind = 'note') => ({ id, coach_id: coach, kind, created_at: created });

describe('overviewNotes', () => {
  it("shows the coach's own notes before a colleague's newer ones", () => {
    const { notes, allMine } = overviewNotes(
      [note('theirs', 'other', '2026-11-20T10:00:00Z'), note('mine-old', 'me', '2026-11-01T10:00:00Z'), note('mine-new', 'me', '2026-11-10T10:00:00Z')],
      'me'
    );
    expect(notes.map((n) => n.id)).toEqual(['mine-new', 'mine-old']);
    expect(allMine).toBe(true);
  });

  it("fills the space left with other coaches' notes, newest first, marked as not the coach's", () => {
    const { notes, allMine } = overviewNotes(
      [note('a', 'other', '2026-11-01T10:00:00Z'), note('b', 'other', '2026-11-05T10:00:00Z'), note('mine', 'me', '2026-10-01T10:00:00Z')],
      'me'
    );
    expect(notes.map((n) => [n.id, n.mine])).toEqual([
      ['mine', true],
      ['b', false],
    ]);
    expect(allMine).toBe(false);
  });

  it('leaves goals out: they live in the goal on Details now (CL10)', () => {
    const { notes } = overviewNotes([note('g', 'me', '2026-11-02T10:00:00Z', 'goal'), note('n', 'me', '2026-11-01T10:00:00Z')], 'me');
    expect(notes.map((n) => n.id)).toEqual(['n']);
  });

  it('leaves injuries out (they have their own box) and is empty with no notes', () => {
    expect(overviewNotes([note('i', 'me', '2026-11-01T10:00:00Z', 'injury')], 'me')).toEqual({ notes: [], allMine: false });
  });

  it('marks every note as another coach’s when nobody is signed in', () => {
    const { notes } = overviewNotes([note('a', 'me', '2026-11-01T10:00:00Z')], null);
    expect(notes[0].mine).toBe(false);
  });
});
