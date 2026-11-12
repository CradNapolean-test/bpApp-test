import { describe, expect, it } from 'vitest';
import { rosterMarkerChips } from './rosterMarkers';
import type { RosterEntry } from '@/lib/data/types';

const entry = (v: Partial<RosterEntry>): RosterEntry => ({ bookingId: 'b', clientId: 'c', clientName: 'A', status: 'booked', attended: false, noShow: false, ...v });
const labels = (v: Partial<RosterEntry>, cost = 1) => rosterMarkerChips(entry(v), cost).map((c) => c.label);

describe('rosterMarkerChips (CS4)', () => {
  it('shows nothing for a regular member with credits', () => {
    expect(labels({ credits: 4, injuryNotes: [] })).toEqual([]);
  });

  it('prefers "First class" over "New member"', () => {
    expect(labels({ firstClass: true, newMember: true })).toEqual(['First class']);
    expect(labels({ newMember: true })).toEqual(['New member']);
  });

  it('flags a hold, too few credits for the next session, and an injury', () => {
    expect(labels({ onHold: true, credits: 0, injuryNotes: ['Left knee'] })).toEqual(['Plan on hold', '0 credits left', 'Injury']);
    expect(labels({ credits: 1 }, 2)).toEqual(['1 credit left']);
    expect(labels({ credits: null })).toEqual([]);
  });
});
