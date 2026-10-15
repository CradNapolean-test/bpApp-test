import { describe, expect, it } from 'vitest';
import { LOGIN_OFF, mayDisableLogin, mayEnableLogin, mayMakeResetLink, mayManageGym } from './gymAccess';

describe('mayManageGym', () => {
  it('lets the owner of the gym\'s organisation manage it', () => {
    expect(mayManageGym({ role: 'owner', myOrganisationId: 'org1', gymOrganisationId: 'org1', isAdminOfGym: false })).toBe(true);
  });

  it('refuses an owner from another organisation, or one with no organisation', () => {
    expect(mayManageGym({ role: 'owner', myOrganisationId: 'org1', gymOrganisationId: 'org2', isAdminOfGym: true })).toBe(false);
    expect(mayManageGym({ role: 'owner', myOrganisationId: null, gymOrganisationId: null, isAdminOfGym: false })).toBe(false);
    expect(mayManageGym({ role: 'owner', myOrganisationId: 'org1', gymOrganisationId: null, isAdminOfGym: false })).toBe(false);
  });

  it('lets a gym admin manage their own gym only', () => {
    expect(mayManageGym({ role: 'coach', myOrganisationId: null, gymOrganisationId: 'org1', isAdminOfGym: true })).toBe(true);
    expect(mayManageGym({ role: 'coach', myOrganisationId: null, gymOrganisationId: 'org1', isAdminOfGym: false })).toBe(false);
  });

  it('refuses members and anyone not signed in', () => {
    expect(mayManageGym({ role: 'client', myOrganisationId: null, gymOrganisationId: null, isAdminOfGym: true })).toBe(false);
    expect(mayManageGym({ role: null, myOrganisationId: null, gymOrganisationId: null, isAdminOfGym: true })).toBe(false);
  });
});

describe('mayDisableLogin', () => {
  const removed = { role: 'coach', deactivatedAt: '2026-10-15T10:00:00Z', gymCount: 0 };

  it('allows a coach the database marked as having no gym left', () => {
    expect(mayDisableLogin(removed, 'admin1', 'coach1')).toEqual({ ok: true });
  });

  it('refuses an active coach, even when asked by name', () => {
    expect(mayDisableLogin({ ...removed, deactivatedAt: null }, 'admin1', 'coach1')).toMatchObject({ ok: false });
    expect(mayDisableLogin({ ...removed, gymCount: 1 }, 'admin1', 'coach1')).toMatchObject({ ok: false });
  });

  it('refuses a member or an owner account', () => {
    expect(mayDisableLogin({ ...removed, role: 'client' }, 'admin1', 'x')).toMatchObject({ ok: false });
    expect(mayDisableLogin({ ...removed, role: 'owner' }, 'admin1', 'x')).toMatchObject({ ok: false });
  });

  it('refuses to switch off your own login', () => {
    expect(mayDisableLogin(removed, 'coach1', 'coach1')).toMatchObject({ ok: false });
  });
});

describe('mayEnableLogin', () => {
  it('only for a coach who was switched off', () => {
    expect(mayEnableLogin({ role: 'coach', deactivatedAt: '2026-10-15T10:00:00Z', gymCount: 0 })).toEqual({ ok: true });
    expect(mayEnableLogin({ role: 'coach', deactivatedAt: null, gymCount: 1 })).toMatchObject({ ok: false });
    expect(mayEnableLogin({ role: 'client', deactivatedAt: '2026-10-15T10:00:00Z', gymCount: 0 })).toMatchObject({ ok: false });
  });
});

describe('mayMakeResetLink', () => {
  const member = { role: 'client', coachId: 'coach1' };

  it('lets a member\'s own coach make the link', () => {
    expect(mayMakeResetLink({ callerId: 'coach1', callerIsAdminOfMemberGym: false, member })).toBe(true);
  });

  it('lets an admin of the member\'s gym make it', () => {
    expect(mayMakeResetLink({ callerId: 'admin1', callerIsAdminOfMemberGym: true, member })).toBe(true);
  });

  it('refuses another coach at the gym', () => {
    expect(mayMakeResetLink({ callerId: 'coach2', callerIsAdminOfMemberGym: false, member })).toBe(false);
  });

  it('refuses a link for anyone who is not a member, whoever asks', () => {
    expect(mayMakeResetLink({ callerId: 'coach1', callerIsAdminOfMemberGym: true, member: { role: 'coach', coachId: 'coach1' } })).toBe(false);
    expect(mayMakeResetLink({ callerId: 'coach1', callerIsAdminOfMemberGym: true, member: { role: 'owner', coachId: null } })).toBe(false);
  });
});

describe('ban length', () => {
  it('is a very long time, not a day', () => {
    expect(parseInt(LOGIN_OFF, 10)).toBeGreaterThan(24 * 365 * 10);
  });
});
