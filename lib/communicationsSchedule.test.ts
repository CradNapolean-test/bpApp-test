import { describe, expect, it } from 'vitest';
import { COMMUNICATIONS_RUN_HOUR_UTC, nextRunAt, nextRunLabel } from './communicationsSchedule';

describe('nextRunAt', () => {
  it('is later today when the run has not happened yet', () => {
    expect(nextRunAt(new Date('2026-10-16T02:00:00Z')).toISOString()).toBe('2026-10-16T05:00:00.000Z');
  });

  it('is tomorrow once today\'s run time has passed', () => {
    expect(nextRunAt(new Date('2026-10-16T05:00:00Z')).toISOString()).toBe('2026-10-17T05:00:00.000Z');
    expect(nextRunAt(new Date('2026-10-16T18:30:00Z')).toISOString()).toBe('2026-10-17T05:00:00.000Z');
  });

  it('runs at the exported hour', () => {
    expect(COMMUNICATIONS_RUN_HOUR_UTC).toBe(5);
  });
});

describe('nextRunLabel', () => {
  it('says about 6 am UK time in summer (05:00 UTC is 06:00 in British Summer Time)', () => {
    expect(nextRunLabel(new Date('2026-07-10T09:00:00Z'))).toBe('goes out at the next daily run (about 6 am UK time, tomorrow)');
  });

  it('says about 5 am UK time in winter', () => {
    expect(nextRunLabel(new Date('2026-12-10T09:00:00Z'))).toBe('goes out at the next daily run (about 5 am UK time, tomorrow)');
  });

  it('names the day when the message is set for later than tomorrow', () => {
    const now = new Date('2026-07-10T09:00:00Z'); // a Friday
    const label = nextRunLabel(now, new Date('2026-07-14T10:00:00Z'));
    expect(label).toBe('goes out at the next daily run (about 6 am UK time, on Wed 15 Jul)');
  });

  it('says today when the run is still ahead', () => {
    expect(nextRunLabel(new Date('2026-07-10T01:00:00Z'))).toBe('goes out at the next daily run (about 6 am UK time, today)');
  });
});
