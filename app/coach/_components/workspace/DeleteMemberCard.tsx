'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { Button } from '@/app/_components/Button';
import { deleteMemberAsCoach } from '@/lib/data/deleteAccount';

// The coach deletes this member outright, without the member asking (someone who has left, a duplicate, a test
// account). Shown only to the member's own coach; the server checks that again. Same wording and DELETE step as the
// member's own "Delete my account", plus a final confirm that names the member so the wrong person is not removed.
export function DeleteMemberCard({ clientId, memberName }: { clientId: string; memberName: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const router = useRouter();
  const typed = text.trim().toUpperCase() === 'DELETE';

  async function handleDelete() {
    if (!typed) return;
    if (
      !(await confirm({
        title: `Delete ${memberName} for good?`,
        body: 'Their login, profile, check-ins, food and training logs, photos, messages, bookings and credit history are deleted now. This cannot be undone.',
        confirmLabel: 'Delete member',
        destructive: true,
      }))
    )
      return;
    // No refresh: this page is about to stop existing, so go straight back to the member list.
    await run(() => deleteMemberAsCoach(clientId, text), {
      success: `${memberName} was deleted`,
      refresh: false,
      onDone: () => {
        router.replace('/coach/clients');
        router.refresh();
      },
    });
  }

  return (
    <div className="rounded-2xl border border-red-500/20 bg-card p-4">
      <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Delete member</h3>
      <p className="mt-1 text-xs text-zinc-500">
        Permanently deletes {memberName}&apos;s account and everything in it: profile, check-ins, food and training logs, photos, messages,
        bookings and credit history. They are not emailed and their membership is not cancelled, so sort both out with them yourself.
      </p>
      {!open ? (
        <Button variant="danger" size="sm" className="mt-3" onClick={() => setOpen(true)}>
          Delete member
        </Button>
      ) : (
        <div className="mt-3 space-y-2">
          <label className="block text-xs font-semibold text-zinc-500" htmlFor="delete-member-confirm">
            Type DELETE to confirm
          </label>
          <input
            id="delete-member-confirm"
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoComplete="off"
            className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
          />
          <div className="flex gap-2">
            <Button variant="danger-solid" size="sm" disabled={!typed || busy} onClick={handleDelete}>
              Delete member
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => {
                setOpen(false);
                setText('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
