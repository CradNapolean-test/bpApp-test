import { describe, expect, it } from 'vitest';
import { EMPTY_USAGE_MAP, NO_USAGE, deleteWording, isInUse, usageFor, usageFromRows, usageLine, usageSummary } from './exerciseUsage';

describe('usageSummary / usageLine (LB11)', () => {
  it("names templates and members' programmes together", () => {
    expect(usageSummary({ templates: 2, programmes: 5 })).toBe("2 templates, 5 members' programmes");
    expect(usageLine({ templates: 2, programmes: 5 })).toBe("In 2 templates, 5 members' programmes.");
  });

  it('says one of each in the singular, and leaves out a kind with none', () => {
    expect(usageSummary({ templates: 1, programmes: 1 })).toBe("1 template, 1 member's programme");
    expect(usageLine({ templates: 0, programmes: 3 })).toBe("In 3 members' programmes.");
    expect(usageLine({ templates: 4, programmes: 0 })).toBe('In 4 templates.');
  });

  it('says it is in nothing, and only claims "no member\'s programme" when that was counted', () => {
    expect(usageLine(NO_USAGE)).toBe("Not in any template or member's programme you can see.");
    expect(usageLine({ templates: 0, programmes: null })).toBe('Not in any programme template.');
    expect(usageLine({ templates: 2, programmes: null })).toBe('In 2 templates.');
  });
});

describe('deleteWording', () => {
  it("offers to retire an exercise only members' programmes use (it was offered for delete before)", () => {
    const w = deleteWording({ templates: 0, programmes: 5 });
    expect(w.inUse).toBe(true);
    expect(w.body).toContain("5 members' programmes");
    expect(w.body).toContain('Retire it instead');
  });

  it('confirms a delete when nothing counted uses it, saying what can still stop it', () => {
    expect(deleteWording(NO_USAGE)).toMatchObject({ inUse: false });
    expect(deleteWording({ templates: 0, programmes: null }).body).toContain("If a member's workout still does");
  });

  it('isInUse counts both kinds', () => {
    expect(isInUse({ templates: 0, programmes: 0 })).toBe(false);
    expect(isInUse({ templates: 0, programmes: null })).toBe(false);
    expect(isInUse({ templates: 1, programmes: 0 })).toBe(true);
  });
});

describe('usageFromRows', () => {
  it("maps the database's rows by exercise id, skipping a row with no id", () => {
    expect(
      usageFromRows([
        { exercise_library_id: 'ex-1', templates: 2, member_programmes: 5 },
        { exercise_library_id: 'ex-2', templates: 0, member_programmes: 1 },
        { exercise_library_id: null, templates: 9, member_programmes: 9 },
      ])
    ).toEqual({ 'ex-1': { templates: 2, programmes: 5 }, 'ex-2': { templates: 0, programmes: 1 } });
  });
});

describe("usageFor (review: before 0179 an exercise in no template must not read as in no member's programme)", () => {
  it("leaves the members' figure unknown for every exercise when members' programmes weren't counted", () => {
    const before0179 = { byId: { 'ex-1': { templates: 2, programmes: null } }, membersCounted: false };
    expect(usageFor(before0179, 'ex-1')).toEqual({ templates: 2, programmes: null });
    expect(usageFor(before0179, 'ex-2')).toEqual({ templates: 0, programmes: null });
    expect(usageLine(usageFor(before0179, 'ex-2'))).toBe('Not in any programme template.');
    expect(deleteWording(usageFor(EMPTY_USAGE_MAP, 'ex-2')).body).toContain("If a member's workout still does");
  });

  it('says none for an exercise the counted map leaves out, and says it is only what the coach can see', () => {
    const counted = { byId: { 'ex-1': { templates: 0, programmes: 3 } }, membersCounted: true };
    expect(usageFor(counted, 'ex-2')).toEqual(NO_USAGE);
    expect(deleteWording(usageFor(counted, 'ex-2')).body).toContain("you can see");
    expect(deleteWording(usageFor(counted, 'ex-2')).body).toContain("another gym's programme");
  });
});
