// The Members list's extra columns (CL6) and its select mode (CL18): the rules, kept apart from the screen so they can be tested.
//   Plan end: the planned last day of the member's open plan (client_memberships.scheduled_end), "ending soon" in its last 2 weeks.
//   Check-in: the dashboard's weekly check-ins (lib/data/coachDashboard.ts): a completed week with something logged that has no
//     coach_reviews mark of kind 'week' is waiting for review. The dashboard lists the last two completed weeks, so this does too.
//   Last class: the latest booking the member was marked as attending.
import { addDays, daysBetween, formatShortDate, isoWeekKey, toIsoDate } from '@/lib/utils/dates';

// The same window as the Business overview's "Plans ending soon" (next 14 days, lib/data/coachDashboard.ts) and the owner's report.
export const ENDING_SOON_DAYS = 14;

export type PlanEnd =
  | { kind: 'none' } // no open plan
  | { kind: 'ongoing' } // an open plan with no planned last day
  | { kind: 'ends'; endsOn: string; daysLeft: number; soon: boolean }
  // The planned last day has passed but the overnight job has not closed the plan yet.
  | { kind: 'ended'; endsOn: string };

export function planEndOf(hasPlan: boolean, endsOn: string | null | undefined, todayIso: string): PlanEnd {
  if (!hasPlan) return { kind: 'none' };
  if (!endsOn) return { kind: 'ongoing' };
  const daysLeft = daysBetween(todayIso, endsOn);
  if (daysLeft < 0) return { kind: 'ended', endsOn };
  return { kind: 'ends', endsOn, daysLeft, soon: daysLeft <= ENDING_SOON_DAYS };
}

// A day as the list writes it: "28 Nov", or "3 Jan 2027" when it is not this year.
export function listDay(iso: string, todayIso: string): string {
  const day = formatShortDate(iso);
  return iso.slice(0, 4) === todayIso.slice(0, 4) ? day : `${day} ${iso.slice(0, 4)}`;
}

// The words for the Plan end column (`text`, with an "Ending soon" mark when `soon`) and for the phone's short line (`short`, beside an
// hourglass; null: leave it out). On the phone the days left are the mark: "3d left".
export function planEndText(p: PlanEnd, todayIso: string): { text: string; short: string | null; soon: boolean } {
  if (p.kind === 'none') return { text: '—', short: null, soon: false };
  if (p.kind === 'ongoing') return { text: 'Ongoing', short: null, soon: false };
  if (p.kind === 'ended') return { text: `Ended ${listDay(p.endsOn, todayIso)}`, short: `Ended ${listDay(p.endsOn, todayIso)}`, soon: true };
  const text = p.daysLeft === 0 ? 'Today' : p.daysLeft === 1 ? 'Tomorrow' : listDay(p.endsOn, todayIso);
  // The phone leaves the year off a day less than 10 months away: "Ends 4 Jan" can only be the coming one.
  if (!p.soon) return { text, short: `Ends ${p.daysLeft < 300 ? formatShortDate(p.endsOn) : listDay(p.endsOn, todayIso)}`, soon: false };
  const short = p.daysLeft === 0 ? 'Ends today' : p.daysLeft === 1 ? 'Ends tomorrow' : `${p.daysLeft}d left`;
  return { text, short, soon: true };
}

// ---- Check-in ----

// The weeks the check-in column looks at, from the gym's today: the last two completed weeks (Monday-start), newest first.
export function checkInWeeks(todayIso: string): { thisWeek: string; lastWeek: string; weekBefore: string } {
  const thisWeek = isoWeekKey(todayIso);
  const monday = new Date(thisWeek + 'T00:00:00Z');
  return { thisWeek, lastWeek: toIsoDate(addDays(monday, -7)), weekBefore: toIsoDate(addDays(monday, -14)) };
}

export type CheckIn =
  // Weeks with something logged and no "Reviewed" mark, oldest first (the one to open first).
  | { kind: 'waiting'; weeks: string[] }
  // Last week was reviewed and nothing is waiting.
  | { kind: 'reviewed'; week: string }
  // Nothing logged last week and nothing waiting.
  | { kind: 'none' }
  // The check-ins could not be read: say so rather than "nothing logged".
  | { kind: 'unknown' };

// `loggedDates`: days with something logged on them (hasLoggedData / LOGGED_DATA_FILTER). `reviewedWeeks`: the refs (Mondays) of the
// member's coach_reviews rows of kind 'week'.
export function checkInOf(loggedDates: readonly string[], reviewedWeeks: readonly string[], todayIso: string): CheckIn {
  const { lastWeek, weekBefore } = checkInWeeks(todayIso);
  const reviewed = new Set(reviewedWeeks);
  const logged = new Set(loggedDates.map((d) => isoWeekKey(d)));
  const waiting = [weekBefore, lastWeek].filter((w) => logged.has(w) && !reviewed.has(w));
  if (waiting.length > 0) return { kind: 'waiting', weeks: waiting };
  if (reviewed.has(lastWeek)) return { kind: 'reviewed', week: lastWeek };
  return { kind: 'none' };
}

// `short` goes beside the check-in icon on the phone; `detail` is for a screen reader and the hover title.
export function checkInText(c: CheckIn): { text: string; short: string | null; detail: string } {
  if (c.kind === 'waiting') {
    const text = c.weeks.length > 1 ? `${c.weeks.length} to review` : 'To review';
    return {
      text,
      short: text,
      detail: c.weeks.map((w) => `Week of ${formatShortDate(w)}`).join(' and ') + ` waiting for your review`,
    };
  }
  if (c.kind === 'reviewed') return { text: 'Reviewed', short: 'Reviewed', detail: `Week of ${formatShortDate(c.week)} reviewed` };
  if (c.kind === 'unknown') return { text: '—', short: null, detail: 'Not available' };
  return { text: '—', short: null, detail: 'Nothing logged last week' };
}

// ---- Last class ----

export interface LastClass {
  date: string;
  className: string | null;
}

// "Today", "Yesterday", "5d ago" for the last two weeks, then the day ("3 Nov").
export function daysAgoText(date: string, todayIso: string): string {
  const days = daysBetween(date, todayIso);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  return listDay(date, todayIso);
}

export function lastClassText(c: LastClass | null | undefined, todayIso: string): { text: string; short: string | null } {
  if (!c) return { text: '—', short: null };
  const when = daysAgoText(c.date, todayIso);
  return { text: when, short: when };
}

// ---- Select mode ----

// Ticks one member on or off.
export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// "Select all" for the members shown: ticks every one of them, or, when they are all ticked already, unticks them. Members ticked
// elsewhere (under another filter) stay as they are.
export function toggleAll(selected: ReadonlySet<string>, shownIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (shownIds.length > 0 && shownIds.every((id) => next.has(id))) for (const id of shownIds) next.delete(id);
  else for (const id of shownIds) next.add(id);
  return next;
}

export function selectAllState(selected: ReadonlySet<string>, shownIds: readonly string[]): 'all' | 'some' | 'none' {
  const n = shownIds.filter((id) => selected.has(id)).length;
  if (n === 0) return 'none';
  return n === shownIds.length ? 'all' : 'some';
}

// Drops anyone who can no longer be acted on (a member moved to another coach since the page was drawn).
export function keepSelectable(selected: ReadonlySet<string>, selectable: { has: (id: string) => boolean }): Set<string> {
  return new Set([...selected].filter((id) => selectable.has(id)));
}

// "Anna, Ben and Cara" / "Anna, Ben, Cara and 4 others": for the bar and the results, where the full list is shown elsewhere.
export function namesSummary(names: readonly string[], max = 3): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length <= max) return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const rest = names.length - max;
  return `${names.slice(0, max).join(', ')} and ${rest} other${rest === 1 ? '' : 's'}`;
}

export const memberCount = (n: number) => `${n} member${n === 1 ? '' : 's'}`;

// The message box's limit: chat_messages.text is capped at 4,000 characters (migration 0108), as the chat's own box is.
export const BULK_MESSAGE_MAX = 4000;
// Members sent to per request: each request stays short, and the screen can show how far it has got.
export const BULK_SEND_BATCH = 20;

// A new group's name: at most this long, and one that matches an existing group (ignoring case and spaces at the ends) means that group.
export const GROUP_NAME_MAX = 100;
export function sameGroupName(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// The confirm step's button sits where "Next" was, so a quick double tap on Next would land on Send (or Add) before the coach had seen
// who it is for. It does nothing until the confirm step has been on screen this long.
export const CONFIRM_ARM_MS = 600;
export function confirmArmed(shownAt: number, now: number, wait = CONFIRM_ARM_MS): boolean {
  return shownAt > 0 && now - shownAt >= wait;
}

export function splitBatches<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface BulkFailure {
  clientId: string;
  error: string;
}
export type BatchResult = { ok: true; sent: string[]; failed: BulkFailure[] } | { ok: false; error: string };

// When a request gets no answer (the connection dropped), some of that batch may have been sent: say so rather than "failed", so nobody is
// sent the same message twice without the coach looking first.
export const NO_ANSWER = 'No answer from the server, so it may or may not have gone: check their chat before you send it again';

// Message each, a batch at a time and one batch after another. Every member ends up in `sent` or `failed` exactly once, whatever the
// server answers; a refused or unanswered batch does not stop the batches after it.
export async function sendInBatches(
  ids: readonly string[],
  send: (batch: string[]) => Promise<BatchResult>,
  onProgress?: (done: number) => void,
  size = BULK_SEND_BATCH
): Promise<{ sent: string[]; failed: BulkFailure[] }> {
  const sent: string[] = [];
  const failed: BulkFailure[] = [];
  const seen = new Set<string>();
  for (const batch of splitBatches([...new Set(ids)], size)) {
    let res: BatchResult;
    try {
      res = await send(batch);
    } catch {
      res = { ok: false, error: NO_ANSWER };
    }
    // Only members of this batch count, and each only once.
    const inBatch = new Set(batch);
    const first = (id: string) => {
      if (!inBatch.has(id) || seen.has(id)) return false;
      seen.add(id);
      return true;
    };
    if (res.ok) {
      for (const id of res.sent) if (first(id)) sent.push(id);
      for (const f of res.failed) if (first(f.clientId)) failed.push(f);
    }
    const reason = res.ok ? 'Not sent' : res.error;
    for (const id of batch) if (first(id)) failed.push({ clientId: id, error: reason });
    onProgress?.(seen.size);
  }
  return { sent, failed };
}

// What happened, for the end of a bulk action. The members it failed for are listed under it by name.
export function messageOutcome(sent: number, failed: number): string {
  if (failed === 0) return `Sent to ${memberCount(sent)}.`;
  if (sent === 0) return `Not sent: it failed for all ${memberCount(failed)}.`;
  return `Sent to ${memberCount(sent)}. Not sent to ${failed}.`;
}

export function groupOutcome(groupName: string, added: number, already: number, failed: number): string {
  const parts: string[] = [];
  if (added > 0 || (already === 0 && failed === 0)) parts.push(`Added ${memberCount(added)} to ${groupName}.`);
  if (already > 0) parts.push(`${already === 1 ? '1 was' : `${already} were`} already in it.`);
  if (failed > 0) parts.push(`${added === 0 && already === 0 ? `Not added to ${groupName}:` : 'Not added:'} ${memberCount(failed)}.`);
  return parts.join(' ');
}
