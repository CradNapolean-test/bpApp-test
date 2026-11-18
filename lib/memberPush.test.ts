import { describe, expect, it } from 'vitest';
import { creditsAddedMessage, planReadyMessage, programmeAssignedMessage, rolloutRecipients } from './memberPush';

describe('member messages for coach actions (D20)', () => {
  it('plan ready: the same words in the bell and the push, opening Nutrition', () => {
    const m = planReadyMessage();
    expect(m.push.title).toBe('Your plan is ready');
    expect(m.push.body).toBe(m.notice);
    expect(m.push.url).toBe('/dashboard?open=nutrition');
  });

  it('programme assigned: names the programme and opens Training', () => {
    const m = programmeAssignedMessage('Strength Block 1');
    expect(m.notice).toBe('Your coach has set you up with Strength Block 1. Open Training to see your workouts.');
    expect(m.push.url).toBe('/dashboard?open=training');
    expect(programmeAssignedMessage('   ').notice).toMatch(/a new programme/);
    expect(programmeAssignedMessage('x'.repeat(100)).notice).toMatch(/x{57}\.\.\. Open Training/);
  });

  it('a rollout tells everyone it gave a copy to, once each, by its own programme name, never whoever started it', () => {
    const rollouts = [
      { id: 'r1', program_name: 'Block 4', created_by: 'coach' },
      { id: 'r2', program_name: null, created_by: 'coach' },
      { id: 'r3', program_name: 'Nobody yet', created_by: 'coach' },
    ];
    const copies = [
      { client_id: 'a', rollout_id: 'r1' },
      { client_id: 'b', rollout_id: 'r1' },
      { client_id: 'a', rollout_id: 'r1' },
      { client_id: 'coach', rollout_id: 'r1' },
      { client_id: 'c', rollout_id: 'r2' },
      { client_id: 'd', rollout_id: null },
      { client_id: 'e', rollout_id: 'other' },
    ];
    expect(rolloutRecipients(rollouts, copies)).toEqual([
      { rolloutId: 'r1', programName: 'Block 4', clientIds: ['a', 'b'] },
      { rolloutId: 'r2', programName: null, clientIds: ['c'] },
    ]);
    expect(rolloutRecipients([], copies)).toEqual([]);
  });

  it('credits added: how many, and opens Book', () => {
    const one = creditsAddedMessage({ amount: 1 });
    expect(one.push.title).toBe('1 credit added');
    expect(one.notice).toBe("Your coach added 1 credit to your account. Book a class whenever you're ready.");
    expect(one.push.url).toBe('/dashboard?open=book');
    expect(creditsAddedMessage({ amount: 5 }).push.title).toBe('5 credits added');
  });

  it('a pack says its name, and an expiry says when they must be used by (gym time)', () => {
    const m = creditsAddedMessage({ amount: 10, packName: '10 class pack', expiresAt: '2026-12-31T23:30:00Z', timeZone: 'Europe/London' });
    expect(m.notice).toBe("Your coach added the 10 class pack (10 credits) to your account, to use by 31 Dec. Book a class whenever you're ready.");
    expect(creditsAddedMessage({ amount: 4, packName: 'Starter' }).notice).toMatch(/added the Starter pack \(4 credits\)/);
    expect(creditsAddedMessage({ amount: 2, expiresAt: 'nonsense' }).notice).not.toMatch(/to use by/);
  });
});
