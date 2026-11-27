import { describe, expect, it } from 'vitest';
import { previewDayLabel, previewDays, previewStartDay } from './memberDayPreview';
import type { ProgramTemplateDayRow } from '@/lib/data/types';

const day = (id: string, week_num: number, day_position: number | null, sort_order: number, day_label = id): ProgramTemplateDayRow => ({
  id,
  template_id: 't',
  week_num,
  day_label,
  sort_order,
  phase_label: null,
  notes: null,
  day_position,
  program_template_exercises: [],
});

const template = { program_template_days: [day('w2-mon', 2, 1, 0), day('w1-sun', 1, 0, 0), day('w1-fri', 1, 5, 1), day('w1-none', 1, null, 2), day('w1-mon', 1, 1, 3)] };

describe('previewDays', () => {
  it('orders the workouts week by week, Monday first and Sunday last, then as the coach set them', () => {
    expect(previewDays(template).map((d) => d.id)).toEqual(['w1-mon', 'w1-fri', 'w1-sun', 'w1-none', 'w2-mon']);
  });
});

describe('previewStartDay', () => {
  it('opens on the workout asked for, else the first of the week shown, else the first of all', () => {
    expect(previewStartDay(template, 'w1-fri', 2)).toBe('w1-fri');
    expect(previewStartDay(template, null, 2)).toBe('w2-mon');
    expect(previewStartDay(template, 'gone', 9)).toBe('w1-mon');
    expect(previewStartDay({ program_template_days: [] }, null, 1)).toBeNull();
  });
});

describe('previewDayLabel', () => {
  it('names the week, the weekday and the workout, without saying the weekday twice', () => {
    expect(previewDayLabel(day('x', 2, 1, 0, 'Lower body'))).toBe('Week 2 · Mon · Lower body');
    expect(previewDayLabel(day('x', 1, 1, 0, 'Monday'))).toBe('Week 1 · Monday');
    expect(previewDayLabel(day('x', 1, null, 0, 'Extra'))).toBe('Week 1 · Extra');
  });
});
