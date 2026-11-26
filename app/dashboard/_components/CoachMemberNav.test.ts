import { describe, expect, it } from 'vitest';
import { activeCoachGroup, coachGroups, coachPageOrder, findCoachTab } from './CoachMemberNav';
import type { Screen } from './categories';

const progressOf = (disabled: Screen[] = []) => coachGroups(new Set(disabled), 'full_tracking').find((g) => g.key === 'progress')!;
const where = (disabled: Screen[], category: Parameters<typeof findCoachTab>[1], screen: Screen) => {
  const groups = coachGroups(new Set(disabled), 'full_tracking');
  const group = activeCoachGroup(groups, category, screen);
  const found = group && findCoachTab(group.tabs, category, screen);
  return group && found ? `${group.key} > ${found.tab.label} > ${found.page.label}` : null;
};

describe("a member's Progress tabs (CL11)", () => {
  it('has four tabs, with Insights, Body scans and Big Dog inside them', () => {
    const progress = progressOf();
    expect(progress.tabs.map((t) => t.label)).toEqual(['Summary', 'Charts', 'Photos', 'Strength']);
    expect(progress.tabs.map((t) => (t.inner ?? []).map((p) => p.label))).toEqual([['Summary', 'Insights'], ['Charts', 'Body scans'], [], ['Strength', 'Big Dog']]);
    // Each tab opens on its own page.
    expect(progress.tabs.map((t) => `${t.category}/${t.screen}`)).toEqual(['Progress/Overview', 'Progress/Metrics', 'Progress/Progress & Photos', 'Progress/Strength']);
  });

  it('fits a phone: the four labels are short', () => {
    // At 375 the row is 343px; 20px between tabs, 14px text at roughly 8px a letter.
    const labels = progressOf().tabs.map((t) => t.label);
    expect(labels.join('').length * 8 + (labels.length - 1) * 20).toBeLessThan(343);
  });

  it('old links to the removed tabs land on the tab that holds them, with that page picked', () => {
    expect(where([], 'Progress', 'Insights')).toBe('progress > Summary > Insights');
    expect(where([], 'Progress', 'Body Scans')).toBe('progress > Charts > Body scans');
    // The dashboard's "Open" and ?open=bigdog go to the Achievements category's Big Dog.
    expect(where([], 'Achievements', 'Big Dog')).toBe('progress > Strength > Big Dog');
    expect(where([], 'Progress', 'Overview')).toBe('progress > Summary > Summary');
    expect(where([], 'Progress', 'Progress & Photos')).toBe('progress > Photos > Photos');
  });

  it('a tab with one page left is named after it, and a tab with none goes', () => {
    const noSummary = progressOf(['Overview']);
    // Overview off takes Charts (Metrics) with it; Body scans is left on its own.
    expect(noSummary.tabs.map((t) => t.label)).toEqual(['Insights', 'Body scans', 'Photos', 'Strength']);
    expect(noSummary.tabs.every((t) => t.label === 'Strength' || !t.inner)).toBe(true);
    const bare = progressOf(['Insights', 'Body Scans', 'Strength', 'Progress & Photos']);
    expect(bare.tabs.map((t) => t.label)).toEqual(['Summary', 'Charts', 'Big Dog']);
    expect(where(['Strength'], 'Achievements', 'Big Dog')).toBe('progress > Big Dog > Big Dog');
  });

  it('pages slide in the order the tabs show them, inner pages included', () => {
    const order = coachPageOrder(coachGroups(new Set(), 'full_tracking')).map((p) => p.screen);
    const i = (s: Screen) => order.indexOf(s);
    expect(i('Overview')).toBeLessThan(i('Insights'));
    expect(i('Insights')).toBeLessThan(i('Metrics'));
    expect(i('Body Scans')).toBeLessThan(i('Progress & Photos'));
    expect(i('Strength')).toBeLessThan(i('Big Dog'));
  });
});
