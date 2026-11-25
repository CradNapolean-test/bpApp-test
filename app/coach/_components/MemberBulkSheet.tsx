'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useActiveGymId } from './CoachGymsContext';
import { addMembersToGroup, addMembersToNewGroup, messageEach } from '@/lib/data/memberBulk';
import {
  BULK_MESSAGE_MAX,
  CONFIRM_ARM_MS,
  GROUP_NAME_MAX,
  confirmArmed,
  groupOutcome,
  memberCount,
  messageOutcome,
  sameGroupName,
  sendInBatches,
  type BulkFailure,
} from '@/lib/memberList';
import type { ClientGroupWithMembers } from '@/lib/data/types';

export type BulkMode = 'message' | 'group';
export interface BulkMember {
  id: string;
  name: string;
}

type Step = 'compose' | 'confirm' | 'working' | 'done';
type Outcome = { summary: string; failed: BulkFailure[] };

const primaryBtn = 'h-11 flex-1 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground hover:opacity-90 disabled:opacity-50';
const secondaryBtn =
  'h-11 rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black hover:bg-black/[.03] disabled:opacity-50 dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5';

// CL18: Message each (the same message into each member's own chat, from the coach) and Add to a group, for the members ticked on the
// Members list. Nothing is sent or saved until the second step, which names everyone it is for, is confirmed. The sheet cannot be closed
// while it is working. At the end it says what happened and who it failed for; `onFinished` gets those members back so they stay ticked.
export function MemberBulkSheet({
  mode,
  members,
  groups,
  onClose,
  onFinished,
}: {
  mode: BulkMode;
  members: BulkMember[];
  groups: ClientGroupWithMembers[];
  onClose: () => void;
  onFinished: (failedIds: string[]) => void;
}) {
  const router = useRouter();
  const gymId = useActiveGymId();
  const [step, setStep] = useState<Step>('compose');
  const [text, setText] = useState('');
  const [groupChoice, setGroupChoice] = useState<string>(groups[0]?.id ?? 'new');
  const [newName, setNewName] = useState('');
  const [progress, setProgress] = useState(0);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Set the moment the confirm button is pressed, so a second press can never start a second run.
  const started = useRef(false);
  // When the confirm step appeared. Its button is in the same place as Next, so it stays off for a moment: a double tap on Next must not
  // send before the coach has seen who it is for (review finding).
  const confirmShownAt = useRef(0);
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (step !== 'confirm') return;
    const t = window.setTimeout(() => setArmed(true), CONFIRM_ARM_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  const nameOf = new Map(members.map((m) => [m.id, m.name]));
  const count = memberCount(members.length);
  const existing = groupChoice === 'new' ? (groups.find((g) => sameGroupName(g.name, newName)) ?? null) : (groups.find((g) => g.id === groupChoice) ?? null);
  const targetName = existing?.name ?? newName.trim();
  const alreadyIn = existing ? members.filter((m) => existing.memberIds.includes(m.id)).length : 0;

  function close() {
    if (step === 'working') return;
    if (step === 'done') {
      onFinished(outcome?.failed.map((f) => f.clientId) ?? []);
      return;
    }
    onClose();
  }

  function review() {
    setProblem(null);
    if (mode === 'message') {
      if (!text.trim()) return setProblem('Write the message first.');
      if (text.trim().length > BULK_MESSAGE_MAX) return setProblem(`That message is too long (${BULK_MESSAGE_MAX.toLocaleString('en-GB')} characters at most).`);
    } else if (groupChoice === 'new') {
      if (!newName.trim()) return setProblem('Give the new group a name.');
      if (newName.trim().length > GROUP_NAME_MAX) return setProblem(`Group names can be ${GROUP_NAME_MAX} characters at most.`);
    }
    confirmShownAt.current = Date.now();
    setArmed(false);
    setStep('confirm');
  }

  async function sendAll() {
    if (started.current || !confirmArmed(confirmShownAt.current, Date.now())) return;
    started.current = true;
    setStep('working');
    setProgress(0);
    const { sent, failed } = await sendInBatches(
      members.map((m) => m.id),
      (batch) => messageEach(batch, text),
      setProgress
    );
    setOutcome({ summary: messageOutcome(sent.length, failed.length), failed });
    setStep('done');
  }

  async function addAll() {
    if (started.current || !confirmArmed(confirmShownAt.current, Date.now())) return;
    started.current = true;
    setStep('working');
    const ids = members.map((m) => m.id);
    try {
      const res = existing ? await addMembersToGroup(existing.id, ids, gymId) : await addMembersToNewGroup(newName, ids, gymId);
      if (res.ok) {
        setOutcome({ summary: groupOutcome(res.groupName, res.added.length, res.already.length, res.failed.length), failed: res.failed });
        // The group filter and Manage groups read the groups from the page.
        router.refresh();
      } else {
        setOutcome({ summary: `Nobody was added. ${res.error}`, failed: ids.map((clientId) => ({ clientId, error: res.error })) });
      }
    } catch {
      setOutcome({ summary: 'No answer from the server.', failed: ids.map((clientId) => ({ clientId, error: 'Check the group before you try again' })) });
      router.refresh();
    }
    setStep('done');
  }

  const title = mode === 'message' ? 'Message each' : 'Add to a group';

  return (
    <BottomSheet title={title} onClose={close}>
      {step === 'compose' && mode === 'message' && (
        <div className="space-y-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Each of the {count} gets this in their own chat with you, from you. Nobody sees who else got it.
          </p>
          <label htmlFor="bulk-message" className="sr-only">
            Message
          </label>
          <textarea
            id="bulk-message"
            rows={6}
            maxLength={BULK_MESSAGE_MAX}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Write your message"
            className="w-full rounded-xl border border-black/[.16] bg-card px-3.5 py-2.5 text-[15px] dark:border-white/15"
          />
          {text.length > BULK_MESSAGE_MAX - 500 && (
            <p className="text-xs text-zinc-500">
              {text.length.toLocaleString('en-GB')} of {BULK_MESSAGE_MAX.toLocaleString('en-GB')} characters
            </p>
          )}
          <Problem text={problem} />
          <div className="flex gap-2">
            <button type="button" onClick={review} className={primaryBtn}>
              Next: check who gets it
            </button>
            <button type="button" onClick={onClose} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'compose' && mode === 'group' && (
        <div className="space-y-3">
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm text-zinc-600 dark:text-zinc-400">Which group should the {count} go into?</legend>
            {groups.map((g) => (
              <label key={g.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-black/[.1] px-3 dark:border-white/10">
                <input type="radio" name="bulk-group" value={g.id} checked={groupChoice === g.id} onChange={() => setGroupChoice(g.id)} className="h-4 w-4 accent-[var(--accent)]" />
                <span className="min-w-0 flex-1 break-words text-sm font-semibold text-black dark:text-zinc-50">{g.name}</span>
                <span className="shrink-0 text-xs text-zinc-500">{memberCount(g.memberIds.length)}</span>
              </label>
            ))}
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-black/[.1] px-3 dark:border-white/10">
              <input type="radio" name="bulk-group" value="new" checked={groupChoice === 'new'} onChange={() => setGroupChoice('new')} className="h-4 w-4 accent-[var(--accent)]" />
              <span className="text-sm font-semibold text-black dark:text-zinc-50">A new group</span>
            </label>
          </fieldset>
          {groupChoice === 'new' && (
            <div className="space-y-1">
              <label htmlFor="bulk-group-name" className="text-sm font-medium text-zinc-500">
                New group&apos;s name
              </label>
              <input
                id="bulk-group-name"
                value={newName}
                maxLength={GROUP_NAME_MAX}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="For example: Morning crew"
                className="h-11 w-full rounded-xl border border-black/[.16] bg-card px-3.5 text-[15px] dark:border-white/15"
              />
              {existing && <p className="text-xs text-zinc-500">There is already a group called {existing.name}: they will go into that one.</p>}
            </div>
          )}
          <Problem text={problem} />
          <div className="flex gap-2">
            <button type="button" onClick={review} className={primaryBtn}>
              Next: check who goes in
            </button>
            <button type="button" onClick={onClose} className={secondaryBtn}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {step === 'confirm' && (
        <div className="space-y-3">
          <p className="text-[15px] font-bold text-black dark:text-zinc-50">
            {mode === 'message' ? `Send this message to these ${count}?` : `Add these ${count} to ${targetName}?`}
          </p>
          {mode === 'message' ? (
            <blockquote className="max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-xl bg-black/[.04] p-3 text-sm text-black dark:bg-white/[.06] dark:text-zinc-50">
              {text.trim()}
            </blockquote>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {existing ? '' : `This makes a new group called ${targetName}. `}
              {alreadyIn > 0 ? `${alreadyIn === 1 ? '1 of them is' : `${alreadyIn} of them are`} in it already and stay as they are.` : ''}
            </p>
          )}
          <MemberNames members={members} />
          <div className="flex gap-2">
            <button type="button" disabled={!armed} onClick={() => void (mode === 'message' ? sendAll() : addAll())} className={primaryBtn}>
              {mode === 'message' ? `Send to ${count}` : `Add ${count}`}
            </button>
            <button type="button" onClick={() => setStep('compose')} className={secondaryBtn}>
              Back
            </button>
          </div>
        </div>
      )}

      {step === 'working' && (
        <div aria-live="polite" className="space-y-2 py-2">
          {mode === 'message' ? (
            <>
              <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((progress / Math.max(1, members.length)) * 100)}%` }} />
              </div>
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                Sending: {progress} of {members.length} done. Keep this open until it finishes.
              </p>
            </>
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">Adding them to {targetName}…</p>
          )}
        </div>
      )}

      {step === 'done' && outcome && (
        <div className="space-y-3">
          <p role="status" className="text-[15px] font-bold text-black dark:text-zinc-50">
            {outcome.summary}
          </p>
          {outcome.failed.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                {mode === 'message' ? 'Not sent to:' : 'Not added:'} they stay ticked on the list, so you can try them again.
              </p>
              <ul className="max-h-48 space-y-1.5 overflow-y-auto">
                {outcome.failed.map((f) => (
                  <li key={f.clientId} className="rounded-xl border border-black/[.08] p-2.5 text-sm dark:border-white/10">
                    <p className="font-semibold text-black dark:text-zinc-50">{nameOf.get(f.clientId) ?? 'A member'}</p>
                    <p className="text-xs text-danger">{f.error}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button type="button" onClick={close} className={`${primaryBtn} w-full`}>
            Done
          </button>
        </div>
      )}
    </BottomSheet>
  );
}

function Problem({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {text}
    </p>
  );
}

// Everyone it is for, by name: the confirm step lists them all (scrolling when there are many).
function MemberNames({ members }: { members: BulkMember[] }) {
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-[0.08em] text-zinc-500">{memberCount(members.length)}</p>
      <ul className="max-h-48 overflow-y-auto rounded-xl border border-black/[.08] text-sm dark:border-white/10">
        {sorted.map((m) => (
          <li key={m.id} className="break-words border-t border-black/[.06] px-3 py-2 text-black first:border-t-0 dark:border-white/10 dark:text-zinc-50">
            {m.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
