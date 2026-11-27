import type { ProgramTemplateDayRow, ProgramTemplateWithDays } from '@/lib/data/types';
import { WEEKDAY_SHORT } from '@/lib/utils/dates';

// The workouts a template's "Preview as member" (LB16) can show, in the order a member meets them: week by week, then the day's place in
// the week (its weekday when it has one), then the order the coach set.
export function previewDays(template: Pick<ProgramTemplateWithDays, 'program_template_days'>): ProgramTemplateDayRow[] {
  // Monday (1) to Saturday (6), Sunday (0) last, a workout with no weekday after those.
  const place = (d: ProgramTemplateDayRow) => (d.day_position == null ? 99 : d.day_position === 0 ? 7 : d.day_position);
  return [...template.program_template_days].sort((a, b) => a.week_num - b.week_num || place(a) - place(b) || a.sort_order - b.sort_order);
}

// The day the preview opens on: the one asked for when it is in the template, else the first of that week, else the first of all.
export function previewStartDay(template: Pick<ProgramTemplateWithDays, 'program_template_days'>, dayId: string | null, week: number | null): string | null {
  const days = previewDays(template);
  if (dayId && days.some((d) => d.id === dayId)) return dayId;
  return (days.find((d) => d.week_num === week) ?? days[0])?.id ?? null;
}

// "Week 2 · Mon · Lower body" for the preview's workout list.
export function previewDayLabel(d: Pick<ProgramTemplateDayRow, 'week_num' | 'day_label' | 'day_position'>): string {
  const weekday = d.day_position != null ? WEEKDAY_SHORT[d.day_position] : undefined;
  return [`Week ${d.week_num}`, weekday && !d.day_label.toLowerCase().startsWith(weekday.toLowerCase()) ? weekday : null, d.day_label]
    .filter(Boolean)
    .join(' · ');
}
