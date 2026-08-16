'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { addJournalEntry, deleteJournalEntry } from '@/lib/data/clientJournal';
import { updateClientAdminDetails } from '@/lib/data/clientProfile';
import type { ClientJournalEntryRow, ClientProfileRow } from '@/lib/data/types';

const SECTIONS: { kind: ClientJournalEntryRow['kind']; label: string; addLabel: string; placeholder: string }[] = [
  { kind: 'goal', label: 'Client Goals', addLabel: '+ Add Goal', placeholder: 'e.g. Lose 5kg by December' },
  { kind: 'injury', label: 'Injuries & Limitations', addLabel: '+ Add Injury', placeholder: 'e.g. Lower back, avoid loaded spinal flexion' },
  { kind: 'note', label: 'Client Notes', addLabel: '+ Add Note', placeholder: 'Freeform note -- never shown to the client' },
];

function JournalSection({
  clientId,
  kind,
  label,
  addLabel,
  placeholder,
  entries,
  readOnly,
}: {
  clientId: string;
  kind: ClientJournalEntryRow['kind'];
  label: string;
  addLabel: string;
  placeholder: string;
  entries: ClientJournalEntryRow[];
  readOnly: boolean;
}) {
  const [adding, setAdding] = useState(false);
  const [body, setBody] = useState('');
  const { run, busy } = useAction();
  const confirm = useConfirm();

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    await run(() => addJournalEntry(clientId, kind, body.trim()), {
      onDone: () => {
        setBody('');
        setAdding(false);
      },
    });
  }

  async function handleDelete(id: string) {
    if (!(await confirm({ title: 'Delete this entry?', destructive: true }))) return;
    await run(() => deleteJournalEntry(id));
  }

  return (
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
          {label} <span className="font-normal text-zinc-500">({entries.length})</span>
        </h3>
        {!readOnly && (
          <button
            onClick={() => setAdding((v) => !v)}
            className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
          >
            {adding ? 'Cancel' : addLabel}
          </button>
        )}
      </div>

      {!readOnly && adding && (
        <form onSubmit={handleAdd} className="mt-3 space-y-2">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={placeholder}
            rows={2}
            className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
            autoFocus
          />
          <button
            type="submit"
            disabled={busy || !body.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            Save
          </button>
        </form>
      )}

      <div className="mt-3 space-y-2">
        {entries.length === 0 && <EmptyState title={`No ${label.toLowerCase()} yet.`} compact />}
        {entries.map((entry) => (
          <div
            key={entry.id}
            className="flex items-start justify-between gap-2 rounded-md border border-black/5 p-2.5 dark:border-white/5"
          >
            <div className="min-w-0">
              {entry.related_date && (
                <p className="text-xs font-medium text-accent">
                  Re: {new Date(entry.related_date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} nutrition
                </p>
              )}
              <p className="whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{entry.body}</p>
              <p className="mt-1 text-xs text-zinc-400">{new Date(entry.created_at).toLocaleDateString()}</p>
            </div>
            {!readOnly && (
              <button
                onClick={() => handleDelete(entry.id)}
                aria-label="Delete"
                className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-danger dark:hover:bg-white/5"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Coach-only business/admin record -- distinct from the freeform journal sections below
// (join date/referral source are single values a coach would sort/filter the roster by, not
// a repeatable list). Never shown to the client, same as the rest of this tab.
function AdminDetailsSection({
  clientId,
  profile,
  readOnly,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  readOnly: boolean;
}) {
  const { run, busy } = useAction();
  const [joinDate, setJoinDate] = useState(profile?.join_date ?? '');
  const [referralSource, setReferralSource] = useState(profile?.referral_source ?? '');
  const [adminNotes, setAdminNotes] = useState(profile?.admin_notes ?? '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateClientAdminDetails(clientId, {
          joinDate: joinDate || null,
          referralSource: referralSource || null,
          adminNotes: adminNotes || null,
        }),
      { success: 'Client details saved' }
    );
  }

  if (!profile) return null;

  return (
    <form onSubmit={handleSave} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Client details</h3>
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Join date</label>
          <input
            type="date"
            value={joinDate}
            onChange={(e) => setJoinDate(e.target.value)}
            disabled={readOnly}
            className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10 disabled:opacity-60"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Referral source</label>
          <input
            value={referralSource}
            onChange={(e) => setReferralSource(e.target.value)}
            placeholder="e.g. Word of mouth"
            disabled={readOnly}
            className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10 disabled:opacity-60"
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-zinc-500">Contract / agreement notes</label>
          <textarea
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            rows={2}
            placeholder="Business/admin notes -- never shown to the client"
            disabled={readOnly}
            className="w-full rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10 disabled:opacity-60"
          />
        </div>
      </div>
      {!readOnly && (
        <button
          type="submit"
          disabled={busy}
          className="mt-3 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
        >
          Save
        </button>
      )}
    </form>
  );
}

export function NotesTab({
  clientId,
  entries,
  profile,
  readOnly = false,
}: {
  clientId: string;
  entries: ClientJournalEntryRow[];
  profile?: ClientProfileRow | null;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-4">
      {profile !== undefined && <AdminDetailsSection clientId={clientId} profile={profile} readOnly={readOnly} />}
      {SECTIONS.map((section) => (
        <JournalSection
          key={section.kind}
          clientId={clientId}
          kind={section.kind}
          label={section.label}
          addLabel={section.addLabel}
          placeholder={section.placeholder}
          entries={entries.filter((e) => e.kind === section.kind)}
          readOnly={readOnly}
        />
      ))}
    </div>
  );
}
