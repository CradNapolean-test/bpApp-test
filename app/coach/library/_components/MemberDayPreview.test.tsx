import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// Every way the app writes a programme or a member's records, so the test fails if the preview reaches any of them.
const writes = vi.hoisted(() => [] as string[]);
const spyModule = vi.hoisted(() => (name: string) => new Proxy({}, { get: (_t, key) => (typeof key === 'string' && key !== 'then' ? (...args: unknown[]) => (writes.push(`${name}.${key}`), Promise.resolve(args)) : undefined) }));
vi.mock('@/lib/data/exerciseLibrary', () => spyModule('exerciseLibrary'));
vi.mock('@/lib/data/programTemplates', () => spyModule('programTemplates'));
vi.mock('@/lib/data/workouts', () => spyModule('workouts'));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => writes.push('router.refresh'), push: () => {} }), usePathname: () => '/coach/library' }));

import { MemberDayPreview } from './MemberDayPreview';
import { ToastProvider } from '@/app/_components/ToastProvider';
import type { ProgramTemplateExerciseRow, ProgramTemplateWithDays } from '@/lib/data/types';

const exercise = (id: string, name: string, sort_order: number, section = 'lift', block_no: number | null = null): ProgramTemplateExerciseRow =>
  ({
    id,
    template_day_id: 'd1',
    exercise_library_id: null,
    name,
    sets: 3,
    reps: '8',
    load: null,
    rpe: null,
    notes: null,
    video_url: null,
    superset_group: null,
    rest_seconds: null,
    sort_order,
    block_type: 'exercise',
    prescription_type: 'rpe',
    percent_1rm: null,
    section,
    block_no,
    block_format: null,
    block_config: null,
    block_part: null,
    tracking_type: 'weight_reps',
    target_seconds: null,
    target_distance: null,
    target_calories: null,
    progression_load_increment: null,
    progression_every_weeks: 1,
  }) as unknown as ProgramTemplateExerciseRow;

const template = {
  id: 't1',
  coach_id: 'c',
  gym_id: 'g',
  name: 'Made-up template',
  created_at: '2026-11-01',
  program_template_days: [
    { id: 'd1', template_id: 't1', week_num: 1, day_label: 'Lower body', sort_order: 0, phase_label: null, notes: 'Brace hard.', day_position: 1, program_template_exercises: [exercise('e1', 'Back squat', 0), exercise('e2', 'Romanian deadlift', 1, 'strong', 1)] },
    { id: 'd2', template_id: 't1', week_num: 1, day_label: 'Upper body', sort_order: 1, phase_label: null, notes: null, day_position: 3, program_template_exercises: [] },
  ],
} as unknown as ProgramTemplateWithDays;

describe('MemberDayPreview (LB16)', () => {
  it("draws the workout the way the member's screen lists it, read-only, and saves nothing", () => {
    const html = renderToStaticMarkup(<ToastProvider><MemberDayPreview template={template} initialDayId="d1" library={[]} onClose={() => {}} /></ToastProvider>);
    expect(html).toContain('Lower body');
    expect(html).toContain('Week 1 · preview');
    expect(html).toContain('Back squat');
    // Strong / Conditioning is the member's pick, as on their screen: offered, not shown until picked.
    expect(html).toContain('Strong');
    expect(html).not.toContain('Romanian deadlift');
    expect(html).toContain('Brace hard.');
    expect(html).toContain('Nothing here is saved');
    // No set logging, no finishing the workout, no editing.
    expect(html).not.toMatch(/Log set|Finish workout|Add exercise|aria-label="Delete/);
    expect(writes).toEqual([]);
  });

  it('lists every workout of the template to switch between', () => {
    const html = renderToStaticMarkup(<ToastProvider><MemberDayPreview template={template} initialDayId="d2" library={[]} onClose={() => {}} /></ToastProvider>);
    expect(html).toContain('Week 1 · Mon · Lower body');
    expect(html).toContain('Week 1 · Wed · Upper body');
    expect(html).toContain('This workout has no exercises yet.');
    expect(writes).toEqual([]);
  });

  it('reaches no code that writes: it imports only types from the data layer, and its handlers do nothing', () => {
    const source = readFileSync(join(__dirname, 'MemberDayPreview.tsx'), 'utf8');
    const dataImports = source.split('\n').filter((line) => line.startsWith('import') && line.includes('@/lib/data/'));
    expect(dataImports.every((line) => line.startsWith('import type'))).toBe(true);
    expect(source).not.toMatch(/useAction|useRouter|router\.refresh|submitForm|instantiate|scheduleProgrammeRollout|chooseBlock/);
    expect(source).toContain('canEdit={false}');
    for (const handler of ['onAdd', 'onUpdate', 'onUpdateMany', 'onDelete', 'onReorder']) expect(source).toContain(`${handler}={SAVES_NOTHING}`);
  });
});
