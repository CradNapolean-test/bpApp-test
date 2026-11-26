import { describe, expect, it } from 'vitest';
import { changeCoachConfirm, coachChangeProblem, newCoachOptions } from './coachChange';

describe('coachChangeProblem', () => {
  it('needs a member and a new coach', () => {
    expect(coachChangeProblem({ memberId: '', fromCoachId: 'a', toCoachId: 'b' })).toBe('Choose a member.');
    expect(coachChangeProblem({ memberId: 'm', fromCoachId: 'a', toCoachId: '' })).toBe('Choose the new coach.');
  });

  it("refuses the coach they already have", () => {
    expect(coachChangeProblem({ memberId: 'm', fromCoachId: 'a', toCoachId: 'a' })).toBe('That is already their coach.');
  });

  it('lets a member with no coach be given one', () => {
    expect(coachChangeProblem({ memberId: 'm', fromCoachId: null, toCoachId: 'a' })).toBeNull();
    expect(coachChangeProblem({ memberId: 'm', fromCoachId: 'a', toCoachId: 'b' })).toBeNull();
  });
});

describe('newCoachOptions', () => {
  const team = [
    { id: 'a', name: 'Adam' },
    { id: 'b', name: 'Brad' },
    { id: 'q', name: 'Quays' },
  ];

  it("offers the gym's coaches without the current one", () => {
    expect(newCoachOptions(team, 'b').map((c) => c.id)).toEqual(['a', 'q']);
  });

  it('offers every coach to a member with no coach', () => {
    expect(newCoachOptions(team, null)).toHaveLength(3);
  });
});

describe('changeCoachConfirm', () => {
  it('names the member, the coach they have and the one they get', () => {
    const c = changeCoachConfirm({ member: 'Jo Bloggs', from: 'Brad', to: 'Adam' });
    expect(c.title).toBe("Change Jo Bloggs's coach from Brad to Adam?");
    expect(c.body).toContain('Adam becomes their coach straight away');
    expect(c.body).toContain('Brad loses them');
    expect(c.body).toContain('Open red flags move too');
    expect(c.body).toContain('Jo Bloggs is not told automatically');
    expect(c.confirmLabel).toBe('Change coach');
  });

  it("says 'no coach' for a member who had none", () => {
    const c = changeCoachConfirm({ member: 'Jo', from: null, to: 'Adam' });
    expect(c.title).toBe("Change Jo's coach from no coach to Adam?");
    expect(c.body).not.toContain('loses them');
  });
});
