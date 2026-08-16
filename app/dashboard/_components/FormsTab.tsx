'use client';

import { useState } from 'react';
import { Camera, CheckCircle2, FileText } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { assignForm, submitFormResponses } from '@/lib/data/forms';
import type { FormAssignmentWithDetails, FormTemplateRow } from '@/lib/data/types';

const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

function FillableForm({ assignment, onClose }: { assignment: FormAssignmentWithDetails; onClose: () => void }) {
  const { run, busy: submitting } = useAction();
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  function setAnswer(questionId: string, value: unknown) {
    setAnswers((a) => ({ ...a, [questionId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = assignment.template.questions.map((q) => ({
      question_id: q.id,
      answer: answers[q.id] ?? (q.question_type === 'multi_choice' ? [] : null),
    }));
    await run(() => submitFormResponses(assignment.id, payload), { success: 'Form submitted', onDone: onClose });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{assignment.template.name}</h3>
        <button type="button" onClick={onClose} className="text-xs font-medium text-zinc-500 hover:underline">
          Cancel
        </button>
      </div>
      {assignment.template.description && (
        <p className="text-xs text-zinc-500">{assignment.template.description}</p>
      )}
      {assignment.template.questions.map((q) => (
        <div key={q.id} className="space-y-1">
          <label className="text-sm text-black dark:text-zinc-50">
            {q.question_text}
            {q.required && ' *'}
          </label>
          {q.question_type === 'short_text' && (
            <input
              required={q.required}
              className={`${inputCls} w-full`}
              onChange={(e) => setAnswer(q.id, e.target.value)}
            />
          )}
          {q.question_type === 'long_text' && (
            <textarea
              required={q.required}
              rows={3}
              className={`${inputCls} w-full`}
              onChange={(e) => setAnswer(q.id, e.target.value)}
            />
          )}
          {q.question_type === 'number' && (
            <input
              type="number"
              required={q.required}
              className={`${inputCls} w-full`}
              onChange={(e) => setAnswer(q.id, Number(e.target.value))}
            />
          )}
          {q.question_type === 'single_choice' && (
            <div className="space-y-1">
              {(q.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <input type="radio" name={q.id} required={q.required} onChange={() => setAnswer(q.id, opt)} />
                  {opt}
                </label>
              ))}
            </div>
          )}
          {q.question_type === 'multi_choice' && (
            <div className="space-y-1">
              {(q.options ?? []).map((opt) => (
                <label key={opt} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    onChange={(e) => {
                      const current = (answers[q.id] as string[] | undefined) ?? [];
                      setAnswer(q.id, e.target.checked ? [...current, opt] : current.filter((o) => o !== opt));
                    }}
                  />
                  {opt}
                </label>
              ))}
            </div>
          )}
        </div>
      ))}
      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
      >
        {submitting ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  );
}

function ReadOnlyResponses({ assignment }: { assignment: FormAssignmentWithDetails }) {
  return (
    <div className="space-y-2 rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-black dark:text-zinc-50">{assignment.template.name}</h3>
          <p className="text-xs text-zinc-500">
            Completed {assignment.completed_at ? new Date(assignment.completed_at).toLocaleDateString() : ''}
          </p>
        </div>
      </div>
      <dl className="space-y-2 text-sm">
        {assignment.template.questions.map((q) => {
          const response = assignment.responses.find((r) => r.question_id === q.id);
          const answer = response?.answer;
          return (
            <div key={q.id}>
              <dt className="text-zinc-500">{q.question_text}</dt>
              <dd className="text-black dark:text-zinc-50">
                {Array.isArray(answer) ? answer.join(', ') : String(answer ?? '—')}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

export function FormsTab({
  clientId,
  isCoachView,
  templates,
  assignments,
  readOnly = false,
}: {
  clientId: string;
  isCoachView: boolean;
  templates: FormTemplateRow[];
  assignments: FormAssignmentWithDetails[];
  // Narrower than isCoachView: hides just the "Assign a form" action for a coach viewing a
  // colleague's client read-only, while keeping the coach-style summary rendering (as opposed
  // to isCoachView=false, which would switch this to the client's own fill-out UI).
  readOnly?: boolean;
}) {
  const { run, busy: assigning } = useAction();
  const [selectedTemplate, setSelectedTemplate] = useState('');
  const [openFormId, setOpenFormId] = useState<string | null>(null);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTemplate) return;
    await run(() => assignForm(selectedTemplate, clientId), {
      success: 'Form assigned',
      onDone: () => setSelectedTemplate(''),
    });
  }

  const pending = assignments.filter((a) => !a.completed_at);
  const completed = assignments.filter((a) => a.completed_at);

  return (
    <div className="space-y-6">
      {isCoachView && !readOnly && (
        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <h3 className="font-bold text-black dark:text-zinc-50">Assign a form</h3>
          <form onSubmit={handleAssign} className="mt-2 flex items-center gap-2">
            <select
              className="w-full min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10"
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
            >
              <option value="">Select…</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={assigning || !selectedTemplate}
              className="shrink-0 rounded-full bg-[#141414] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Assign'}
            </button>
          </form>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
            {isCoachView ? 'Pending' : 'To fill out'}
          </h3>
          {isCoachView
            ? pending.map((a) => (
                <div
                  key={a.id}
                  className="flex items-center gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                    <FileText className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium text-black dark:text-zinc-50">{a.template.name}</span>
                  <span className="ml-auto shrink-0 text-xs text-zinc-500">waiting on client</span>
                </div>
              ))
            : pending.map((a) =>
                openFormId === a.id ? (
                  <FillableForm key={a.id} assignment={a} onClose={() => setOpenFormId(null)} />
                ) : (
                  <div key={a.id} className="rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                        <Camera className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-bold text-black dark:text-zinc-50">{a.template.name}</p>
                        <p className="text-xs text-zinc-500">
                          {a.template.questions.length} question{a.template.questions.length === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setOpenFormId(a.id)}
                      className="mt-3 w-full rounded-full bg-accent px-4 py-2.5 text-sm font-bold text-accent-foreground"
                    >
                      Fill out
                    </button>
                  </div>
                )
              )}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Completed</h3>
          {completed.map((a) => (
            <ReadOnlyResponses key={a.id} assignment={a} />
          ))}
        </div>
      )}

      {assignments.length === 0 && (
        <EmptyState
          icon={FileText}
          title="No forms assigned yet"
          hint={isCoachView ? 'Assign a template above, or build one under Forms.' : "Your coach hasn't sent you a form to fill out."}
        />
      )}
    </div>
  );
}
