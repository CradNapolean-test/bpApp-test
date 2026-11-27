// Server code only: the page and loadLibraryTab (libraryTabActions.ts) call it with the signed-in coach's session.
import type { SupabaseClient } from '@supabase/supabase-js';
import { getExerciseLibrary, getExerciseUsage } from './exerciseLibrary';
import { getPendingRollouts, getProgramTemplatesWithDays } from './programTemplates';
import { getFormRollup, getFormTemplates } from './forms';
import { readMemberNames } from './memberNames';
import { getCourseRollup, getCourses } from './education';
import { getGroups } from './clientGroups';
import { getMyGyms } from './gym';
import { getMyClients, resolveScopingGymId } from './coach';
import type {
  ClientGroupWithMembers,
  CourseRollupRow,
  EducationCourseWithModules,
  ExerciseLibraryRow,
  FormTemplateRow,
  ProgrammeRolloutRow,
  ProgramTemplateWithDays,
} from './types';
import type { FormRollupRow } from '@/lib/libraryRollups';
import type { ExerciseUsage } from '@/lib/exerciseUsage';
import { EMPTY_LIBRARY_SUMMARY, type LibrarySummary, type LibraryTabSlug } from '@/lib/libraryTabs';

type Member = { id: string; name: string };

// One tab's data (LB25): exactly what that tab's pane is drawn from, and nothing of the other tabs.
export type LibraryTabData =
  | { tab: 'exercises'; exercises: ExerciseLibraryRow[]; usage: Record<string, ExerciseUsage> }
  | {
      tab: 'templates';
      templates: ProgramTemplateWithDays[];
      exercises: ExerciseLibraryRow[];
      groups: ClientGroupWithMembers[];
      members: Member[];
      rollouts: ProgrammeRolloutRow[];
    }
  | {
      tab: 'education';
      courses: EducationCourseWithModules[];
      members: Member[];
      groups: ClientGroupWithMembers[];
      rollup: CourseRollupRow[];
      otherGyms: { id: string; name: string }[];
      memberNames: Record<string, string>;
    }
  | {
      tab: 'forms';
      formTemplates: FormTemplateRow[];
      members: Member[];
      groups: ClientGroupWithMembers[];
      rollup: FormRollupRow[];
      memberNames: Record<string, string>;
    }
  | { tab: 'foods' };

async function myMembers(supabase: SupabaseClient, coachId: string): Promise<Member[]> {
  const clients = await getMyClients(supabase, coachId);
  return clients.map((c) => ({ id: c.id, name: c.name ?? c.email }));
}

// Who has each course or form can include other coaches' members at the gym: their names, where the coach may read them.
function otherMembersNames(supabase: SupabaseClient, members: Member[], ids: string[]): Promise<Record<string, string>> {
  const mine = new Set(members.map((m) => m.id));
  return readMemberNames(
    supabase,
    ids.filter((id) => !mine.has(id))
  );
}

// Reads one tab with the signed-in coach's own session, so the database's rules decide what is in it, as they did when the page read all
// five. The caller has already checked that the user is a signed-in coach.
export async function readLibraryTab(supabase: SupabaseClient, coachId: string, tab: LibraryTabSlug): Promise<LibraryTabData> {
  switch (tab) {
    case 'exercises': {
      const [exercises, usage] = await Promise.all([getExerciseLibrary(), getExerciseUsage()]);
      return { tab, exercises, usage };
    }
    case 'templates': {
      const [templates, exercises, groups, members, rollouts] = await Promise.all([
        getProgramTemplatesWithDays(),
        getExerciseLibrary(),
        getGroups(),
        myMembers(supabase, coachId),
        getPendingRollouts(),
      ]);
      return { tab, templates, exercises, groups, members, rollouts };
    }
    case 'education': {
      const [courses, groups, members, rollup, myGyms] = await Promise.all([
        getCourses(),
        getGroups(),
        myMembers(supabase, coachId),
        getCourseRollup(),
        getMyGyms().catch(() => []),
      ]);
      const memberNames = await otherMembersNames(supabase, members, rollup.map((r) => r.client_id));
      const otherGyms = myGyms.filter((g) => !g.isActive).map((g) => ({ id: g.gymId, name: g.gymName }));
      return { tab, courses, groups, members, rollup, otherGyms, memberNames };
    }
    case 'forms': {
      const [formTemplates, groups, members, rollup] = await Promise.all([
        getFormTemplates(),
        getGroups(),
        myMembers(supabase, coachId),
        getFormRollup(),
      ]);
      const memberNames = await otherMembersNames(supabase, members, rollup.map((r) => r.client_id));
      return { tab, formTemplates, groups, members, rollup, memberNames };
    }
    case 'foods':
      // The Foods pane fetches its own lists as the coach searches.
      return { tab };
  }
}

// The tiles' figures, as counts: the same rows the tabs list (the gym being worked in, under the same rules), without their contents.
export async function readLibrarySummary(supabase: SupabaseClient): Promise<LibrarySummary> {
  const gymId = await resolveScopingGymId(supabase);
  const count = async (query: PromiseLike<{ count: number | null; error: unknown }>) => {
    const { count: n, error } = await query;
    return error ? null : (n ?? 0);
  };
  const [exercises, withVideo, templates, rollingOut, courses, forms] = await Promise.all([
    count(supabase.from('exercise_library').select('id', { count: 'exact', head: true })),
    count(supabase.from('exercise_library').select('id', { count: 'exact', head: true }).like('video_url', 'https://%')),
    count(supabase.from('program_templates').select('id', { count: 'exact', head: true }).eq('gym_id', gymId)),
    count(supabase.from('programme_rollouts').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).is('applied_at', null)),
    count(supabase.from('education_courses').select('id', { count: 'exact', head: true }).eq('gym_id', gymId)),
    count(supabase.from('form_templates').select('id', { count: 'exact', head: true }).eq('gym_id', gymId)),
  ]);
  return {
    ...EMPTY_LIBRARY_SUMMARY,
    exercises: exercises ?? 0,
    exercisesWithoutVideo: Math.max(0, (exercises ?? 0) - (withVideo ?? 0)),
    templates: templates ?? 0,
    // Migration 0094 not applied: no rollouts, as the Templates tab shows.
    rollingOut: rollingOut ?? 0,
    courses: courses ?? 0,
    forms: forms ?? 0,
  };
}
