'use client';

import { useState } from 'react';
import { Trash2, X } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createGroup, deleteGroup, addClientToGroup, removeClientFromGroup } from '@/lib/data/clientGroups';
import type { ClientGroupWithMembers } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

// Mirrors BrowseExercisesModal.tsx's `fixed inset-0 z-50` + backdrop + centered panel pattern.
export function GroupsManager({
  groups,
  clients,
  onClose,
}: {
  groups: ClientGroupWithMembers[];
  clients: CoachClientRow[];
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    await run(() => createGroup(newName.trim()), { onDone: () => setNewName('') });
  }

  async function handleDelete(groupId: string) {
    if (!(await confirm({ title: 'Delete this group?', destructive: true }))) return;
    await run(() => deleteGroup(groupId));
  }

  async function handleToggleMember(groupId: string, clientId: string, isMember: boolean) {
    await run(() => (isMember ? removeClientFromGroup(groupId, clientId) : addClientToGroup(groupId, clientId)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Manage groups"
        className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-lg border border-black/10 bg-[var(--background)] p-5 shadow-xl dark:border-white/10"
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-black dark:text-zinc-50">Manage groups</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleCreate} className="mt-3 flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New group name"
            className="flex-1 rounded-md border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
          />
          <button
            type="submit"
            disabled={busy || !newName.trim()}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            Create
          </button>
        </form>

        <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto">
          {groups.length === 0 && <EmptyState compact title="No groups yet." />}
          {groups.map((group) => {
            const isExpanded = expandedId === group.id;
            return (
              <div key={group.id} className="rounded-md border border-black/10 dark:border-white/10">
                <div className="flex items-center justify-between gap-2 p-2.5">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : group.id)}
                    className="flex-1 text-left text-sm font-medium text-black dark:text-zinc-50"
                  >
                    {group.name} <span className="font-normal text-zinc-500">({group.memberIds.length})</span>
                  </button>
                  <button
                    onClick={() => handleDelete(group.id)}
                    aria-label="Delete group"
                    className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-black/5 hover:text-danger dark:hover:bg-white/5"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {isExpanded && (
                  <div className="space-y-1 border-t border-black/5 p-2.5 dark:border-white/5">
                    {clients.map((client) => {
                      const isMember = group.memberIds.includes(client.id);
                      return (
                        <label key={client.id} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={isMember}
                            onChange={() => handleToggleMember(group.id, client.id, isMember)}
                          />
                          {client.name ?? client.email}
                        </label>
                      );
                    })}
                    {clients.length === 0 && <p className="text-xs text-zinc-500">No clients yet.</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
