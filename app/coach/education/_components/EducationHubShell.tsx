'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createEducationContent, deleteEducationContent } from '@/lib/data/education';
import type { EducationContentRow } from '@/lib/data/types';

export function EducationHubShell({
  initialContent,
  unreadCount,
}: {
  initialContent: EducationContentRow[];
  unreadCount: number;
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runDelete } = useAction();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () => createEducationContent({ title, body: body || null, link_url: linkUrl || null }),
      {
        success: 'Content added',
        onDone: () => {
          setTitle('');
          setBody('');
          setLinkUrl('');
        },
      }
    );
  }

  async function handleDelete(id: string, contentTitle: string) {
    const ok = await confirm({
      title: `Delete “${contentTitle}”?`,
      body: 'Every assignment of this reading is removed too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteEducationContent(id), { success: 'Content deleted' });
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <AppShell title="Education" topBar={<CoachNav unreadCount={unreadCount} />}>
      <div className="space-y-6">
        <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Title</label>
            <input required className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Body</label>
            <textarea rows={3} className={inputCls} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Link URL (optional)</label>
            <input className={inputCls} value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="https://…" />
          </div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {creating ? 'Adding…' : 'Add content'}
          </button>
        </form>

        {initialContent.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title="No education content yet"
            hint="Add an article or resource above, then assign it to clients from their Accountability tab."
          />
        ) : (
          <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
            {initialContent.map((c) => (
              <li key={c.id} className="flex items-center justify-between p-3 text-sm">
                <span>
                  {c.title}
                  {c.link_url ? ' · has link' : ''}
                </span>
                <button
                  onClick={() => handleDelete(c.id, c.title)}
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
