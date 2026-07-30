'use client';

import { useState } from 'react';
import { GraduationCap } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { assignEducationContent, markEducationComplete } from '@/lib/data/education';
import type { EducationAssignmentWithContent, EducationContentRow } from '@/lib/data/types';

const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

function ReadingCard({ assignment }: { assignment: EducationAssignmentWithContent }) {
  const { run, busy } = useAction();

  async function handleComplete() {
    await run(() => markEducationComplete(assignment.id), { success: 'Marked as read' });
  }

  return (
    <div className="space-y-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{assignment.content.title}</h3>
      {assignment.content.body && <p className="text-sm text-black dark:text-zinc-50">{assignment.content.body}</p>}
      {assignment.content.link_url && (
        <a
          href={assignment.content.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block text-sm text-accent hover:underline"
        >
          Open link ↗
        </a>
      )}
      <div>
        <button
          onClick={handleComplete}
          disabled={busy}
          className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Mark as read'}
        </button>
      </div>
    </div>
  );
}

export function EducationTab({
  clientId,
  isCoachView,
  content,
  assignments,
}: {
  clientId: string;
  isCoachView: boolean;
  content: EducationContentRow[];
  assignments: EducationAssignmentWithContent[];
}) {
  const { run, busy: assigning } = useAction();
  const [selectedContent, setSelectedContent] = useState('');

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContent) return;
    await run(() => assignEducationContent(selectedContent, clientId), {
      success: 'Assigned',
      onDone: () => setSelectedContent(''),
    });
  }

  const pending = assignments.filter((a) => !a.completed_at);
  const completed = assignments.filter((a) => a.completed_at);

  return (
    <div className="space-y-6">
      {isCoachView && (
        <form onSubmit={handleAssign} className="flex flex-wrap items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Assign reading</label>
            <select className={inputCls} value={selectedContent} onChange={(e) => setSelectedContent(e.target.value)}>
              <option value="">Select…</option>
              {content.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={assigning || !selectedContent}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/10"
          >
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
        </form>
      )}

      {pending.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            {isCoachView ? 'Pending' : 'To read'}
          </h3>
          {isCoachView
            ? pending.map((a) => (
                <div key={a.id} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
                  {a.content.title} — waiting on client
                </div>
              ))
            : pending.map((a) => <ReadingCard key={a.id} assignment={a} />)}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Completed</h3>
          {completed.map((a) => (
            <div key={a.id} className="rounded-lg border border-black/10 p-3 text-sm dark:border-white/10">
              {a.content.title}
              <span className="ml-2 text-zinc-500">
                {a.completed_at ? `read ${new Date(a.completed_at).toLocaleDateString()}` : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {assignments.length === 0 && (
        <EmptyState
          icon={GraduationCap}
          title="Nothing assigned yet"
          hint={isCoachView ? 'Assign a reading above, or build one under Education.' : "Your coach hasn't assigned any reading yet."}
        />
      )}
    </div>
  );
}
