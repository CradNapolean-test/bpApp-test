// Who has a form or a course, worked out from the rows the coach can read (Library > Forms, LB19; Library > Education, LB17).
// Plain functions, so the screens and the tests share them.

// One sending of a form to a member (form_assignments): open until they answer it.
export interface FormRollupRow {
  template_id: string;
  client_id: string;
  assigned_at: string;
  completed_at: string | null;
}

export interface FormWaiting {
  clientId: string;
  name: string;
  // when the open one was sent
  sentAt: string;
  // they answered an earlier sending of this form
  answeredBefore: boolean;
}

export interface FormAnswered {
  clientId: string;
  name: string;
  answeredAt: string;
}

export interface FormStatus {
  waiting: FormWaiting[];
  answered: FormAnswered[];
}

const nameOf = (names: Record<string, string>, id: string) => names[id] ?? 'A member';
const time = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : 0);

// Each member once: waiting when they have the form open (a form can be sent again after it was answered, and the new one is what counts),
// else answered (with their latest answer). Waiting: longest waiting first. Answered: most recent first. Ties by name.
export function formStatus(rows: FormRollupRow[], templateId: string, names: Record<string, string>): FormStatus {
  const byMember = new Map<string, FormRollupRow[]>();
  for (const r of rows) {
    if (r.template_id !== templateId) continue;
    const list = byMember.get(r.client_id) ?? [];
    list.push(r);
    byMember.set(r.client_id, list);
  }
  const waiting: FormWaiting[] = [];
  const answered: FormAnswered[] = [];
  for (const [clientId, list] of byMember) {
    const open = list.filter((r) => !r.completed_at).sort((a, b) => time(a.assigned_at) - time(b.assigned_at));
    const done = list.filter((r) => r.completed_at).sort((a, b) => time(b.completed_at) - time(a.completed_at));
    if (open.length > 0) {
      waiting.push({ clientId, name: nameOf(names, clientId), sentAt: open[0].assigned_at, answeredBefore: done.length > 0 });
    } else if (done.length > 0) {
      answered.push({ clientId, name: nameOf(names, clientId), answeredAt: done[0].completed_at as string });
    }
  }
  waiting.sort((a, b) => time(a.sentAt) - time(b.sentAt) || a.name.localeCompare(b.name));
  answered.sort((a, b) => time(b.answeredAt) - time(a.answeredAt) || a.name.localeCompare(b.name));
  return { waiting, answered };
}

// "Sent to 5 · 3 answered", or null when nobody has been sent it.
export function formStatusLine(status: FormStatus): string | null {
  const total = status.waiting.length + status.answered.length;
  if (total === 0) return null;
  return `Sent to ${total} · ${status.answered.length} answered`;
}

// What sending to a group will do, before it is sent: the group's members who have the form open are skipped, and those who answered it
// before get it again. (The database also skips members at another gym and says so afterwards.)
export function groupSendPreview(memberIds: string[], rows: FormRollupRow[], templateId: string) {
  const unique = Array.from(new Set(memberIds));
  const open = new Set(rows.filter((r) => r.template_id === templateId && !r.completed_at).map((r) => r.client_id));
  const answered = new Set(rows.filter((r) => r.template_id === templateId && r.completed_at).map((r) => r.client_id));
  const toSend = unique.filter((id) => !open.has(id));
  return {
    total: unique.length,
    alreadyOpen: unique.length - toSend.length,
    answeredBefore: toSend.filter((id) => answered.has(id)).length,
    toSend: toSend.length,
  };
}

export interface GroupSendCounts {
  sent: number;
  alreadyOpen: number;
  otherGym: number;
  answeredBefore: number;
}

// The toast after a group send.
export function groupSendSummary(r: GroupSendCounts): string {
  const parts = [r.sent === 0 ? 'Nobody new to send it to' : `Sent to ${r.sent} member${r.sent === 1 ? '' : 's'}`];
  if (r.alreadyOpen > 0) parts.push(`${r.alreadyOpen} already had it open`);
  if (r.otherGym > 0) parts.push(`${r.otherGym} at another gym skipped`);
  return parts.join(' · ');
}

export interface RemindCounts {
  reminded: number;
  recentlyReminded: number;
  notWaiting: number;
}

export function remindSummary(r: RemindCounts): string {
  const parts = [r.reminded === 0 ? 'Nobody reminded' : `Reminded ${r.reminded} member${r.reminded === 1 ? '' : 's'}`];
  if (r.recentlyReminded > 0) parts.push(`${r.recentlyReminded} already reminded in the last 12 hours`);
  if (r.notWaiting > 0) parts.push(`${r.notWaiting} no longer waiting`);
  return parts.join(' · ');
}

// "Sam Smith", "Sam Smith and Jo Bloggs", "Sam Smith, Jo Bloggs and Ann Lee", "Sam Smith, Jo Bloggs, Ann Lee and 4 more".
export function nameList(names: string[], max = 6): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`;
}

// A course's rollup row (getCourseRollup): who has it and how many of its lessons they have done.
export interface CourseRollupLike {
  course_id: string;
  client_id: string;
  assigned_at: string;
  done: number;
}

export interface CourseMember {
  clientId: string;
  name: string;
  assignedAt: string;
  done: number;
  total: number;
  finished: boolean;
}

// Everyone who has the course, once each (an older double assignment counts once, its earliest date), A-Z with those who finished last.
export function courseMembers(
  rollup: CourseRollupLike[],
  courseId: string,
  lessonTotal: number,
  names: Record<string, string>
): CourseMember[] {
  const byMember = new Map<string, CourseMember>();
  for (const r of rollup) {
    if (r.course_id !== courseId) continue;
    const done = Math.min(r.done, lessonTotal);
    const prev = byMember.get(r.client_id);
    if (prev) {
      if (time(r.assigned_at) < time(prev.assignedAt)) prev.assignedAt = r.assigned_at;
      continue;
    }
    byMember.set(r.client_id, {
      clientId: r.client_id,
      name: nameOf(names, r.client_id),
      assignedAt: r.assigned_at,
      done,
      total: lessonTotal,
      finished: lessonTotal > 0 && done >= lessonTotal,
    });
  }
  return Array.from(byMember.values()).sort((a, b) => Number(a.finished) - Number(b.finished) || a.name.localeCompare(b.name));
}

// "Finished", "Not started", "4 of 27 lessons".
export function courseProgressText(m: Pick<CourseMember, 'done' | 'total' | 'finished'>): string {
  if (m.finished) return 'Finished';
  if (m.done === 0) return 'Not started';
  return `${m.done} of ${m.total} lesson${m.total === 1 ? '' : 's'}`;
}
