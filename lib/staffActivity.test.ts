import { describe, expect, it } from 'vitest';
import { describeStaffActivity, type StaffActivityRow } from './staffActivity';

const row = (over: Partial<StaffActivityRow>): StaffActivityRow => ({
  key: 'staff:1',
  at: '2026-11-26T09:00:00Z',
  action: 'coach_added',
  gymId: 'g1',
  gymName: 'Salford Quays',
  actorName: 'adam@ballisticperformance.co.uk',
  actorIsYou: false,
  coachName: 'Brad',
  toCoachName: null,
  memberName: null,
  memberCount: null,
  ...over,
});

describe('describeStaffActivity', () => {
  it('names who did it, tidying a login address', () => {
    expect(describeStaffActivity(row({}))).toBe('Adam added Brad to the gym');
    expect(describeStaffActivity(row({ action: 'coach_removed' }))).toBe('Adam removed Brad from the gym');
  });

  it('says "You" for the owner reading it', () => {
    expect(describeStaffActivity(row({ actorIsYou: true, action: 'admin_on' }))).toBe('You made Brad a gym admin');
    expect(describeStaffActivity(row({ actorIsYou: true, action: 'admin_off' }))).toBe('You took gym admin off Brad');
  });

  it('says how many members moved and between whom', () => {
    expect(describeStaffActivity(row({ action: 'members_moved', memberCount: 14, toCoachName: 'quays@ballisticperformance.co.uk' }))).toBe(
      'Adam moved 14 members from Brad to Quays'
    );
    expect(describeStaffActivity(row({ action: 'members_moved', memberCount: 1, toCoachName: 'Quays' }))).toBe('Adam moved 1 member from Brad to Quays');
  });

  it("names the member whose coach changed, and 'no coach' when they had none", () => {
    expect(describeStaffActivity(row({ action: 'member_coach_changed', memberName: 'Jo Bloggs', toCoachName: 'Adam' }))).toBe(
      "Adam changed Jo Bloggs's coach from Brad to Adam"
    );
    expect(describeStaffActivity(row({ action: 'member_coach_changed', memberName: 'Jo Bloggs', coachName: null, toCoachName: 'Adam' }))).toBe(
      "Adam changed Jo Bloggs's coach from no coach to Adam"
    );
  });

  it("doesn't invent a name when the database couldn't tell who did it", () => {
    expect(describeStaffActivity(row({ action: 'login_on', actorName: null }))).toBe("Brad's login was switched back on");
    expect(describeStaffActivity(row({ action: 'coach_added', actorName: null }))).toBe('Brad was added to the gym');
  });

  it('says so when the account is gone', () => {
    expect(describeStaffActivity(row({ coachName: null }))).toBe('Adam added a deleted account to the gym');
    expect(describeStaffActivity(row({ action: 'member_coach_changed', memberName: null, toCoachName: 'Adam' }))).toBe(
      "Adam changed a deleted member's coach from Brad to Adam"
    );
  });
});
