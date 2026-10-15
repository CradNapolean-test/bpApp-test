import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ROLLOUT_AUDIENCE,
  membersLabel,
  rolloutButtonLabel,
  rolloutConfirmation,
  rolloutSuccessMessage,
  type RolloutPlan,
} from './rolloutPlan';

const plan = (over: Partial<RolloutPlan> = {}): RolloutPlan => ({ audience: 'selected', memberCount: 3, startsNow: true, startLabel: 'Mon 2 Nov', ...over });

describe('Start this programme (R5)', () => {
  it('defaults to choosing members, never to everyone', () => {
    expect(DEFAULT_ROLLOUT_AUDIENCE).toBe('selected');
  });

  it('counts members in the right words', () => {
    expect(membersLabel(1)).toBe('1 member');
    expect(membersLabel(90)).toBe('90 members');
  });

  describe('the button', () => {
    it('shows the count for chosen members', () => {
      expect(rolloutButtonLabel(plan())).toBe('Start for 3 members today');
      expect(rolloutButtonLabel(plan({ memberCount: 1 }))).toBe('Start for 1 member today');
    });
    it('shows the real count for everyone', () => {
      expect(rolloutButtonLabel(plan({ audience: 'all', memberCount: 90 }))).toBe('Start for all 90 members today');
    });
    it('shows the date when it is scheduled for later', () => {
      expect(rolloutButtonLabel(plan({ startsNow: false }))).toBe('Schedule for 3 members on Mon 2 Nov');
      expect(rolloutButtonLabel(plan({ audience: 'all', memberCount: 90, startsNow: false }))).toBe('Schedule for all 90 members on Mon 2 Nov');
    });
    it('asks to choose members when none are chosen', () => {
      expect(rolloutButtonLabel(plan({ memberCount: 0 }))).toBe('Choose who gets it');
    });
    it('does not invent a number while the gym count is loading', () => {
      expect(rolloutButtonLabel(plan({ audience: 'all', memberCount: null }))).toBe('Start for everyone today');
    });
  });

  describe('the confirmation', () => {
    it('is required for everyone and states the number being replaced', () => {
      const c = rolloutConfirmation(plan({ audience: 'all', memberCount: 90 }));
      expect(c?.body).toBe('This will replace the current programme for 90 members today. Their old programmes and every weight and rep logged stay on file.');
      expect(c?.confirmLabel).toBe('Start for 90 members');
    });
    it('says when it happens if scheduled', () => {
      const c = rolloutConfirmation(plan({ audience: 'all', memberCount: 90, startsNow: false }));
      expect(c?.body).toMatch(/^On Mon 2 Nov this will replace the current programme for 90 members\./);
      expect(c?.confirmLabel).toBe('Schedule for 90 members');
    });
    it('is not needed for chosen members', () => {
      expect(rolloutConfirmation(plan())).toBeNull();
    });
  });

  it('reports what happened with the number the database returned', () => {
    expect(rolloutSuccessMessage({ startsNow: true, startLabel: 'x' }, 90)).toBe('Started for 90 members');
    expect(rolloutSuccessMessage({ startsNow: true, startLabel: 'x' }, 1)).toBe('Started for 1 member');
    expect(rolloutSuccessMessage({ startsNow: false, startLabel: 'Mon 2 Nov' }, 12)).toBe('Scheduled for 12 members on Mon 2 Nov');
  });
});
