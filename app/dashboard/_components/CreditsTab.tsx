'use client';

import { useEffect, useMemo, useState } from 'react';
import { CalendarClock, History, Minus, Plus, Sparkles } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { grantCredits } from '@/lib/data/classes';
import {
  clearScheduledEnd,
  endMembership,
  getCreditHistory,
  getMembershipHistory,
  grantCreditPack,
  removeCredits,
  startMembership,
} from '@/lib/data/memberships';
import { updateCheckinReminderDays } from '@/lib/data/clientProfile';
import { endHold, getActiveHold, startHold } from '@/lib/data/redFlags';
import { addDays, toIsoDate, todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { ClientMembershipRow, CreditBucketBalances, CreditPackRow, CreditsLedgerRow, MembershipHoldRow, MembershipPackageRow } from '@/lib/data/types';

const cardCls = 'rounded-2xl border border-black/[.06] bg-card p-4 dark:border-white/10';
const labelCls = 'block text-xs font-medium text-zinc-500';
const btnCls = 'rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-40';
const ghostBtnCls = 'rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-700 disabled:opacity-40 dark:border-white/15 dark:text-zinc-200';

const dayLabel = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dateLabel = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

// The upcoming Saturday (today if it is one): where TeamUp plans normally start.
function nextSaturday(todayIso: string): string {
  const d = new Date(todayIso + 'T00:00:00Z');
  return toIsoDate(addDays(d, (6 - d.getUTCDay() + 7) % 7));
}

// A challenge runs `weeks` weeks from its start (a Saturday start ends on a Saturday). Starting on
// any other day adds one buffer day, as the TeamUp set-up notes say.
function endFor(startIso: string, weeks: number | null | undefined): string {
  if (!weeks) return '';
  const start = new Date(startIso + 'T00:00:00Z');
  const buffer = start.getUTCDay() === 6 ? 0 : 1;
  return toIsoDate(addDays(start, weeks * 7 + buffer));
}

function friendlyReason(reason: string): string {
  const m = reason.match(/^membership reset: week of (\d{4}-\d{2}-\d{2})/);
  if (m) return `Weekly allowance reset · week of ${new Date(m[1] + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
  return reason;
}

type SheetKind = 'start' | 'end' | 'add' | 'remove' | 'hold' | null;

// Everything a coach does with a member's membership and credits: start or change a plan (on a
// chosen date), set or clear an end date, end it now, add or take off credits, and see what has
// happened so far. The check-in reminder setting sits at the bottom.
export function CreditsTab({
  clientId,
  creditsBalance,
  creditsBuckets,
  membership,
  packages,
  creditPacks,
  checkinReminderDays,
  lastCheckinReminderAt,
}: {
  clientId: string;
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
  creditPacks: CreditPackRow[];
  checkinReminderDays: number;
  lastCheckinReminderAt: string | null;
}) {
  const confirm = useConfirm();
  const { run, busy } = useAction();
  const todayIso = todayIsoInTz(DEFAULT_TIMEZONE);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [history, setHistory] = useState<{ memberships: ClientMembershipRow[]; credits: CreditsLedgerRow[] } | null>(null);
  const [reminderDays, setReminderDays] = useState(checkinReminderDays);
  // A hold keeps them off the red flag lists while they are away (holiday, injury).
  const [hold, setHold] = useState<MembershipHoldRow | null>(null);
  const [holdFrom, setHoldFrom] = useState(todayIso);
  const [holdNote, setHoldNote] = useState('');
  const [holdTick, setHoldTick] = useState(0);
  const [showAllCredits, setShowAllCredits] = useState(false);

  // Start-plan form
  const [packageId, setPackageId] = useState(membership?.package_id ?? '');
  const [startMode, setStartMode] = useState<'saturday' | 'today' | 'custom'>('saturday');
  const [customStart, setCustomStart] = useState(todayIso);
  const [endDate, setEndDate] = useState('');
  const [endTouched, setEndTouched] = useState(false);
  // End-date form
  const [planEnd, setPlanEnd] = useState('');
  // Credit forms
  const [amount, setAmount] = useState(1);
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');
  const [selectedPack, setSelectedPack] = useState('');

  useEffect(() => {
    let live = true;
    Promise.all([getMembershipHistory(clientId), getCreditHistory(clientId)]).then(([memberships, credits]) => {
      if (live) setHistory({ memberships, credits });
    });
    return () => {
      live = false;
    };
  }, [clientId, membership?.id, membership?.scheduled_end, creditsBalance]);

  useEffect(() => {
    let live = true;
    getActiveHold(clientId).then((h) => {
      if (live) setHold(h);
    });
    return () => {
      live = false;
    };
  }, [clientId, holdTick]);

  const startIso = startMode === 'saturday' ? nextSaturday(todayIso) : startMode === 'today' ? todayIso : customStart;
  const pkg = packages.find((p) => p.id === packageId) ?? null;
  const suggestedEnd = endFor(startIso, pkg?.duration_weeks);
  const shownEnd = endTouched ? endDate : suggestedEnd;
  const hasActive = membership != null;
  const futureStartBlocked = hasActive && startIso > todayIso;

  const status = useMemo(() => {
    if (!membership) return { label: 'No plan', tone: 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300' };
    if (membership.started_at > todayIso) return { label: `Starts ${dayLabel(membership.started_at)}`, tone: 'bg-warning/15 text-warning' };
    if (membership.scheduled_end) return { label: `Ends ${dayLabel(membership.scheduled_end)}`, tone: 'bg-warning/15 text-warning' };
    return { label: 'Active', tone: 'bg-success/15 text-success' };
  }, [membership, todayIso]);

  function openStart() {
    setPackageId(membership?.package_id ?? '');
    setStartMode(hasActive ? 'today' : 'saturday');
    setEndTouched(false);
    setEndDate('');
    setSheet('start');
  }

  async function submitStart() {
    if (!packageId) return;
    const ok = await run(() => startMembership(clientId, packageId, startIso, shownEnd || null), {
      success: startIso > todayIso ? `Plan set to start ${dayLabel(startIso)}` : 'Plan started',
    });
    if (ok) setSheet(null);
  }

  async function submitEnd() {
    if (!membership || !planEnd) return;
    const ok = await run(() => endMembership(membership.id, planEnd), { success: `Plan will end ${dayLabel(planEnd)}` });
    if (ok) setSheet(null);
  }

  async function endNow() {
    if (!membership) return;
    const okConfirm = await confirm({
      title: 'End this plan now?',
      body: 'Their weekly credits are removed today. Any bonus credits stay. Their bookings are not cancelled.',
      confirmLabel: 'End plan',
      destructive: true,
    });
    if (okConfirm) await run(() => endMembership(membership.id, null), { success: 'Plan ended' });
  }

  async function submitAdd() {
    const expiresAt = expires ? new Date(`${expires}T23:59:59`).toISOString() : null;
    const ok = await run(() => grantCredits(clientId, amount, reason.trim() || 'Added by coach', expiresAt), {
      success: `${amount} credit${amount === 1 ? '' : 's'} added`,
    });
    if (ok) setSheet(null);
  }

  async function submitRemove() {
    const ok = await run(() => removeCredits(clientId, amount, reason), { success: `${amount} credit${amount === 1 ? '' : 's'} removed` });
    if (ok) setSheet(null);
  }

  async function extraSession() {
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    await run(() => grantCredits(clientId, 1, 'Extra session', expiresAt), { success: 'Extra session added (valid 7 days)' });
  }

  async function grantPack() {
    const pack = creditPacks.find((p) => p.id === selectedPack);
    if (!pack) return;
    await run(() => grantCreditPack(clientId, pack), { success: `${pack.name} granted` });
    setSelectedPack('');
  }

  async function saveReminder(e: React.FormEvent) {
    e.preventDefault();
    await run(() => updateCheckinReminderDays(clientId, reminderDays), {
      success: reminderDays === 0 ? 'Check-in reminders turned off' : `Reminders set to ${reminderDays} days`,
    });
  }

  const openSheet = (kind: SheetKind) => {
    setAmount(1);
    setReason('');
    setExpires('');
    setPlanEnd(membership?.scheduled_end ?? '');
    setSheet(kind);
  };

  return (
    <div className="space-y-4">
      {/* ---- membership ---- */}
      <div className={cardCls}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Membership</p>
            <p className="mt-0.5 truncate text-lg font-extrabold text-black dark:text-zinc-50">{membership?.package?.name ?? 'No plan set up'}</p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${status.tone}`}>{status.label}</span>
        </div>

        {membership?.package && (
          <dl className="mt-3 divide-y divide-black/[.05] text-sm dark:divide-white/10">
            <div className="flex justify-between py-2">
              <dt className="text-zinc-500">Weekly allowance</dt>
              <dd className="font-semibold text-black dark:text-zinc-50">{membership.package.credits_per_week} credits, reset Mondays</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-zinc-500">Started</dt>
              <dd className="font-semibold text-black dark:text-zinc-50">{dateLabel(membership.started_at)}</dd>
            </div>
            <div className="flex justify-between py-2">
              <dt className="text-zinc-500">Ends</dt>
              <dd className="font-semibold text-black dark:text-zinc-50">{membership.scheduled_end ? dateLabel(membership.scheduled_end) : 'Ongoing'}</dd>
            </div>
          </dl>
        )}

        {hold && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-warning/10 px-3 py-2.5">
            <p className="text-sm text-zinc-700 dark:text-zinc-300">
              <b className="text-warning">On hold</b> since {dayLabel(hold.started_on)}
              {hold.note ? `, ${hold.note}` : ''}. They are left out of the red flag lists.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => endHold(hold.id, todayIso), { success: 'Hold ended', onDone: () => setHoldTick((n) => n + 1) })}
              className={ghostBtnCls}
            >
              Resume
            </button>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={openStart} className={btnCls}>
            {membership ? 'Change plan' : 'Start a plan'}
          </button>
          {membership && !membership.scheduled_end && (
            <button type="button" onClick={() => openSheet('end')} className={ghostBtnCls}>
              Set an end date
            </button>
          )}
          {membership?.scheduled_end && (
            <button type="button" disabled={busy} onClick={() => run(() => clearScheduledEnd(membership.id), { success: 'End date removed' })} className={ghostBtnCls}>
              Remove end date
            </button>
          )}
          {membership && !hold && (
            <button type="button" onClick={() => openSheet('hold')} className={ghostBtnCls}>
              Put on hold
            </button>
          )}
          {membership && (
            <button type="button" disabled={busy} onClick={endNow} className="rounded-full px-4 py-2 text-sm font-bold text-danger disabled:opacity-40">
              End now
            </button>
          )}
        </div>
      </div>

      {/* ---- credits ---- */}
      <div className={cardCls}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Credits</p>
        <p className="mt-0.5 text-3xl font-extrabold text-black dark:text-zinc-50">{creditsBalance}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {creditsBuckets.membership} from the weekly allowance · {creditsBuckets.bonus} bonus (carries over)
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <button type="button" disabled={busy} onClick={extraSession} className="flex flex-col items-center gap-1 rounded-xl bg-accent/12 py-3 text-xs font-bold text-accent disabled:opacity-40">
            <Sparkles className="h-4 w-4" /> Extra session
          </button>
          <button type="button" onClick={() => openSheet('add')} className="flex flex-col items-center gap-1 rounded-xl bg-black/[.04] py-3 text-xs font-bold text-zinc-700 dark:bg-white/[.06] dark:text-zinc-200">
            <Plus className="h-4 w-4" /> Add credits
          </button>
          <button type="button" onClick={() => openSheet('remove')} className="flex flex-col items-center gap-1 rounded-xl bg-black/[.04] py-3 text-xs font-bold text-zinc-700 dark:bg-white/[.06] dark:text-zinc-200">
            <Minus className="h-4 w-4" /> Remove
          </button>
        </div>
        <p className="mt-2 text-[11px] text-zinc-500">Extra session = one credit that expires after 7 days.</p>

        {creditPacks.length > 0 && (
          <div className="mt-4 flex items-end gap-2 border-t border-black/[.05] pt-3 dark:border-white/10">
            <div className="min-w-0 flex-1 space-y-1">
              <label className={labelCls}>Credit pack</label>
              <select className={inputCls} value={selectedPack} onChange={(e) => setSelectedPack(e.target.value)}>
                <option value="">Select…</option>
                {creditPacks.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.credits} credits{p.expires_after_days ? `, ${p.expires_after_days}d` : ''})
                  </option>
                ))}
              </select>
            </div>
            <button type="button" disabled={busy || !selectedPack} onClick={grantPack} className={btnCls}>
              Grant
            </button>
          </div>
        )}
      </div>

      {/* ---- history ---- */}
      <div className={cardCls}>
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
          <History className="h-3.5 w-3.5" /> History
        </p>
        {!history ? (
          <p className="mt-2 text-sm text-zinc-500">Loading…</p>
        ) : (
          <>
            <ul className="mt-2 space-y-1.5">
              {history.memberships.length === 0 && <li className="text-sm text-zinc-500">No plans yet.</li>}
              {history.memberships.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-semibold text-black dark:text-zinc-50">{m.package?.name ?? 'Plan'}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {dateLabel(m.started_at)} to {m.ended_at ? dateLabel(m.ended_at) : m.scheduled_end ? `${dateLabel(m.scheduled_end)} (planned)` : 'now'}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Recent credit activity</p>
            <ul className="mt-1 divide-y divide-black/[.05] dark:divide-white/10">
              {history.credits.length === 0 && <li className="py-2 text-sm text-zinc-500">No credit activity yet.</li>}
              {(showAllCredits ? history.credits : history.credits.slice(0, 5)).map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-black dark:text-zinc-50">{friendlyReason(c.reason)}</span>
                    <span className="block text-xs text-zinc-500">
                      {dateLabel(c.created_at.slice(0, 10))}
                      {c.expires_at && !c.expired_at ? ` · expires ${dateLabel(c.expires_at.slice(0, 10))}` : ''}
                    </span>
                  </span>
                  <span className={`shrink-0 text-sm font-bold ${c.delta > 0 ? 'text-success' : c.delta < 0 ? 'text-danger' : 'text-zinc-400'}`}>
                    {c.delta > 0 ? '+' : ''}
                    {c.delta === 0 ? '±0' : c.delta}
                  </span>
                </li>
              ))}
            </ul>
            {history.credits.length > 5 && (
              <button type="button" onClick={() => setShowAllCredits((v) => !v)} className="mt-1 py-1 text-sm font-bold text-accent">
                {showAllCredits ? 'Show fewer' : `Show all ${history.credits.length}`}
              </button>
            )}
          </>
        )}
      </div>

      {/* ---- reminders ---- */}
      <div className={cardCls}>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Check-in reminders</p>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Nudge this member if they haven&apos;t logged anything in a while. Set to 0 to turn off.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Last reminded:{' '}
          {lastCheckinReminderAt
            ? new Date(lastCheckinReminderAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true })
            : 'Never'}
        </p>
        <form onSubmit={saveReminder} className="mt-3 flex items-end gap-2">
          <div className="space-y-1">
            <label className={labelCls}>Days of inactivity</label>
            <input type="number" min={0} value={reminderDays} onChange={(e) => setReminderDays(Number(e.target.value))} className={inputCls} />
          </div>
          <button type="submit" disabled={busy} className={btnCls}>
            Save
          </button>
        </form>
      </div>

      {/* ---- sheets ---- */}
      {sheet === 'start' && (
        <BottomSheet title={membership ? 'Change plan' : 'Start a plan'} onClose={() => setSheet(null)}>
          <div className="space-y-4">
            <div className="space-y-1">
              <label className={labelCls}>Plan</label>
              <select className={inputCls} value={packageId} onChange={(e) => { setPackageId(e.target.value); setEndTouched(false); }}>
                <option value="">Select…</option>
                {packages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.credits_per_week}/week{p.duration_weeks ? `, ${p.duration_weeks} weeks` : ''})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Starts</label>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['saturday', `Saturday ${dayLabel(nextSaturday(todayIso)).replace(/^Sat /, '')}`],
                  ['today', 'Today'],
                  ['custom', 'Pick a date'],
                ] as ['saturday' | 'today' | 'custom', string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStartMode(key)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${startMode === key ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {startMode === 'custom' && <input type="date" className={inputCls} value={customStart} onChange={(e) => setCustomStart(e.target.value)} />}
              <p className="text-xs text-zinc-500">
                {startIso > todayIso ? `Weekly credits arrive on ${dayLabel(startIso)}.` : 'Weekly credits are added straight away.'}
              </p>
              {futureStartBlocked && (
                <p className="text-xs font-semibold text-danger">They already have a plan. End it first, or start the new one today.</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label className={labelCls}>Ends</label>
              <input
                type="date"
                className={inputCls}
                value={shownEnd}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setEndTouched(true);
                }}
              />
              <p className="text-xs text-zinc-500">
                {pkg?.duration_weeks && !endTouched
                  ? `${pkg.duration_weeks}-week plan: ends ${dayLabel(suggestedEnd)}${new Date(startIso + 'T00:00:00Z').getUTCDay() === 6 ? '' : ' (includes a buffer day)'}. Change it if needed.`
                  : shownEnd
                    ? 'Ends on this date.'
                    : 'Leave blank for an ongoing plan.'}
              </p>
              {shownEnd && (
                <button type="button" onClick={() => { setEndDate(''); setEndTouched(true); }} className="text-xs font-bold text-accent">
                  No end date
                </button>
              )}
            </div>

            <button type="button" disabled={busy || !packageId || futureStartBlocked} onClick={submitStart} className={`${btnCls} w-full py-3`}>
              {busy ? 'Saving…' : membership ? 'Change plan' : 'Start plan'}
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet === 'hold' && (
        <BottomSheet title="Put the membership on hold" onClose={() => setSheet(null)}>
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              While on hold they are left out of the weekly red flag lists. Resume them when they are back.
            </p>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">From</label>
              <input type="date" className={inputCls} value={holdFrom} onChange={(e) => setHoldFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-zinc-500">Reason (optional)</label>
              <input className={inputCls} value={holdNote} placeholder="e.g. holiday, injury" onChange={(e) => setHoldNote(e.target.value)} />
            </div>
            <button
              type="button"
              disabled={busy || !holdFrom}
              onClick={() =>
                run(() => startHold(clientId, holdFrom, holdNote.trim() || null), {
                  success: 'Put on hold',
                  onDone: () => {
                    setSheet(null);
                    setHoldNote('');
                    setHoldTick((n) => n + 1);
                  },
                })
              }
              className={`${btnCls} w-full py-3`}
            >
              {busy ? 'Saving…' : 'Put on hold'}
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet === 'end' && (
        <BottomSheet title="Set an end date" onClose={() => setSheet(null)}>
          <div className="space-y-3">
            <p className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
              The plan stays active until this date, then ends and the weekly credits are cleared.
            </p>
            <input type="date" min={toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), 1))} className={inputCls} value={planEnd} onChange={(e) => setPlanEnd(e.target.value)} />
            <button type="button" disabled={busy || !planEnd} onClick={submitEnd} className={`${btnCls} w-full py-3`}>
              {busy ? 'Saving…' : 'Set end date'}
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet === 'add' && (
        <BottomSheet title="Add credits" onClose={() => setSheet(null)}>
          <div className="space-y-3">
            <div className="space-y-1">
              <label className={labelCls}>Credits</label>
              <input type="number" min={1} className={inputCls} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Reason</label>
              <input type="text" className={inputCls} placeholder="e.g. Make-up session" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Expires (optional)</label>
              <input type="date" className={inputCls} value={expires} onChange={(e) => setExpires(e.target.value)} />
            </div>
            <button type="button" disabled={busy} onClick={submitAdd} className={`${btnCls} w-full py-3`}>
              {busy ? 'Adding…' : `Add ${amount} credit${amount === 1 ? '' : 's'}`}
            </button>
          </div>
        </BottomSheet>
      )}

      {sheet === 'remove' && (
        <BottomSheet title="Remove credits" onClose={() => setSheet(null)}>
          <div className="space-y-3">
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Use this to record an extra session they have used. The weekly allowance goes first, then bonus credits.</p>
            <div className="space-y-1">
              <label className={labelCls}>Credits</label>
              <input type="number" min={1} className={inputCls} value={amount} onChange={(e) => setAmount(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="space-y-1">
              <label className={labelCls}>Note</label>
              <input type="text" className={inputCls} placeholder="e.g. Extra session on Saturday" value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <button type="button" disabled={busy} onClick={submitRemove} className={`${btnCls} w-full py-3`}>
              {busy ? 'Removing…' : `Remove ${amount} credit${amount === 1 ? '' : 's'}`}
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
