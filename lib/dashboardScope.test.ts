import { describe, expect, it } from 'vitest';
import { dashboardScopeHref, dashboardScopeKey } from './dashboardScope';

describe('dashboardScopeHref', () => {
  it('names the scope, and the coach only for one coach\'s members', () => {
    expect(dashboardScopeHref('mine')).toBe('/coach?scope=mine');
    expect(dashboardScopeHref('gym', 'c1')).toBe('/coach?scope=gym');
    expect(dashboardScopeHref('coach', 'c1')).toBe('/coach?scope=coach&coach=c1');
    expect(dashboardScopeHref('coach')).toBe('/coach?scope=coach');
  });
});

describe('dashboardScopeKey', () => {
  it('tells one coach from another, and ignores a coach for the other scopes', () => {
    expect(dashboardScopeKey('coach', 'c1')).not.toBe(dashboardScopeKey('coach', 'c2'));
    expect(dashboardScopeKey('gym', 'c1')).toBe(dashboardScopeKey('gym'));
    expect(dashboardScopeKey('mine')).not.toBe(dashboardScopeKey('gym'));
  });
});
