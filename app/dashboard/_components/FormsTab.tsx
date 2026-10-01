'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, ClipboardList, FileText } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { assignForm, submitFormResponses } from '@/lib/data/forms';
import type { FormAssignmentWithDetails, FormQuestionRow, FormTemplateRow } from '@/lib/data/types';

const fieldCls =
  'w-full rounded-xl border border-black/10 bg-transparent px-4 py-3 text-base outline-none transition-colors focus:border-accent dark:border-white/10';

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

type Answer = string | string[];

const isAnswered = (a: Answer | undefined) => (Array.isArray(a) ? a.length > 0 : (a ?? '').trim() !== '');

// What is stored for one answer: text/number as given, a list for multi-choice, null when blank.
function toPayload(q: FormQuestionRow, a: Answer | undefined): unknown {
  if (q.question_type === 'multi_choice') return Array.isArray(a) ? a : [];
  if (!isAnswered(a)) return null;
  const text = String(a).trim();
  if (q.question_type === 'number') {
    const n = Number(text);
    return Number.isFinite(n) ? n : null;
  }
  return text;
}

function Choice({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-center justify-between gap-3 rounded-full border px-5 py-3 text-left text-sm font-semibold transition-colors ${
        selected
          ? 'border-accent bg-accent text-accent-foreground'
          : 'border-black/10 text-black hover:bg-black/[.03] dark:border-white/10 dark:text-zinc-100 dark:hover:bg-white/[.04]'
      }`}
    >
      {label}
      {selected && <Check className="h-4 w-4 shrink-0" strokeWidth={3} />}
    </button>
  );
}

// The member's fill-out view: a full-screen form, one card per question, with a count of what's
// answered, required questions checked before it sends, and a draft kept on the device so leaving
// halfway through doesn't lose anything.
function FillableForm({ assignment, onClose }: { assignment: FormAssignmentWithDetails; onClose: () => void }) {
  const { run, busy: submitting } = useAction();
  const draftKey = `form-draft:${assignment.id}`;
  const [answers, setAnswers] = useState<Record<string, Answer>>(() => {
    try {
      const saved = localStorage.getItem(draftKey);
      return saved ? (JSON.parse(saved) as Record<string, Answer>) : {};
    } catch {
      return {};
    }
  });
  const [missing, setMissing] = useState<Set<string>>(new Set());
  const questions = assignment.template.questions;
  const answeredCount = questions.filter((q) => isAnswered(answers[q.id])).length;
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    try {
      localStorage.setItem(draftKey, JSON.stringify(answers));
    } catch {
      // storage unavailable (private mode): the form still works, it just isn't kept
    }
  }, [answers, draftKey]);

  function setAnswer(questionId: string, value: Answer) {
    setAnswers((a) => ({ ...a, [questionId]: value }));
    setMissing((m) => {
      if (!m.has(questionId)) return m;
      const next = new Set(m);
      next.delete(questionId);
      return next;
    });
  }

  // Built from the latest answers, so quick successive taps never overwrite each other.
  function toggleOption(questionId: string, option: string) {
    setAnswers((prev) => {
      const current = Array.isArray(prev[questionId]) ? (prev[questionId] as string[]) : [];
      return { ...prev, [questionId]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] };
    });
    setMissing((m) => {
      if (!m.has(questionId)) return m;
      const next = new Set(m);
      next.delete(questionId);
      return next;
    });
  }

  async function handleSubmit() {
    const unanswered = questions.filter((q) => q.required && !isAnswered(answers[q.id]));
    if (unanswered.length > 0) {
      setMissing(new Set(unanswered.map((q) => q.id)));
      document.getElementById(`question-${unanswered[0].id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    // An unanswered optional question is simply left out: the database refuses an empty answer, and
    // it shows as "—" in the completed form either way.
    const payload = questions
      .map((q) => ({ question_id: q.id, answer: toPayload(q, answers[q.id]) }))
      .filter((p) => p.answer !== null);
    await run(() => submitFormResponses(assignment.id, payload), {
      success: 'Form submitted',
      onDone: () => {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          // nothing to clear
        }
        onClose();
      },
    });
  }

  return (
    <FocusOverlay title={assignment.template.name} subtitle={`${answeredCount} of ${questions.length} answered`} onClose={onClose}>
      <div className="space-y-3 pb-2">
        {assignment.template.description && <p className="px-1 text-sm text-zinc-500">{assignment.template.description}</p>}

        <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${questions.length ? Math.round((answeredCount / questions.length) * 100) : 0}%` }}
          />
        </div>

        {questions.map((q, i) => {
          const value = answers[q.id];
          const showError = missing.has(q.id);
          return (
            <div
              key={q.id}
              id={`question-${q.id}`}
              className={`rounded-2xl border bg-card p-4 ${showError ? 'border-danger/60' : 'border-black/[.06] dark:border-white/10'}`}
            >
              <div className="mb-2.5 flex items-start gap-2.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-accent">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-base font-bold leading-snug text-black dark:text-zinc-50">{q.question_text}</p>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{q.required ? 'Required' : 'Optional'}</p>
                </div>
              </div>

              {q.question_type === 'short_text' && (
                <input className={fieldCls} value={(value as string) ?? ''} onChange={(e) => setAnswer(q.id, e.target.value)} />
              )}
              {q.question_type === 'long_text' && (
                <textarea rows={4} className={fieldCls} value={(value as string) ?? ''} onChange={(e) => setAnswer(q.id, e.target.value)} />
              )}
              {q.question_type === 'number' && (
                <input
                  type="text"
                  inputMode="decimal"
                  className={fieldCls}
                  value={(value as string) ?? ''}
                  onChange={(e) => setAnswer(q.id, e.target.value.replace(/[^0-9.\-]/g, ''))}
                />
              )}
              {q.question_type === 'single_choice' && (
                <div className="space-y-2">
                  {(q.options ?? []).map((opt) => (
                    <Choice key={opt} label={opt} selected={value === opt} onClick={() => setAnswer(q.id, opt)} />
                  ))}
                </div>
              )}
              {q.question_type === 'multi_choice' && (
                <div className="space-y-2">
                  {(q.options ?? []).map((opt) => {
                    const on = Array.isArray(value) && value.includes(opt);
                    return <Choice key={opt} label={opt} selected={on} onClick={() => toggleOption(q.id, opt)} />;
                  })}
                  <p className="px-1 text-xs text-zinc-400">Pick as many as apply.</p>
                </div>
              )}

              {showError && <p className="mt-2 text-sm font-semibold text-danger">Please answer this one.</p>}
            </div>
          );
        })}
      </div>

      <div className="sticky bottom-0 -mx-4 -mb-4 mt-2 border-t border-black/10 bg-[var(--background)] p-4 dark:border-white/10">
        {missing.size > 0 && <p className="mb-2 text-center text-sm font-semibold text-danger">{missing.size} required question{missing.size === 1 ? '' : 's'} still to answer</p>}
        <button
          type="button"
          disabled={submitting}
          onClick={handleSubmit}
          className="h-12 w-full rounded-full bg-accent text-base font-extrabold text-accent-foreground disabled:opacity-50"
        >
          {submitting ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </FocusOverlay>
  );
}

// A finished form: one line until it's tapped, then the answers given.
function CompletedForm({ assignment }: { assignment: FormAssignmentWithDetails }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-2xl border border-black/[.05] bg-card shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2.5 p-3.5 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-success/10 text-success">
          <CheckCircle2 className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{assignment.template.name}</span>
          <span className="block text-xs text-zinc-500">Completed {assignment.completed_at ? fmtDate(assignment.completed_at) : ''}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <dl className="space-y-3 border-t border-black/5 p-4 text-sm dark:border-white/10">
          {assignment.template.questions.map((q) => {
            const answer = assignment.responses.find((r) => r.question_id === q.id)?.answer;
            return (
              <div key={q.id}>
                <dt className="text-xs text-zinc-500">{q.question_text}</dt>
                <dd className="mt-0.5 font-semibold text-black dark:text-zinc-50">
                  {Array.isArray(answer) ? (answer.length ? answer.join(', ') : '—') : answer == null || answer === '' ? '—' : String(answer)}
                </dd>
              </div>
            );
          })}
        </dl>
      )}
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
  const openForm = pending.find((a) => a.id === openFormId) ?? null;

  return (
    <div className="space-y-6">
      {isCoachView && !readOnly && (
        <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
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
              className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Assign'}
            </button>
          </form>
        </div>
      )}

      {pending.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">{isCoachView ? 'Pending' : 'To fill out'}</h3>
          {pending.map((a) => {
            const n = a.template.questions.length;
            return isCoachView ? (
              <div
                key={a.id}
                className="flex items-center gap-2.5 rounded-2xl border border-black/[.05] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                  <FileText className="h-4 w-4" />
                </span>
                <span className="text-sm font-medium text-black dark:text-zinc-50">{a.template.name}</span>
                <span className="ml-auto shrink-0 text-xs text-zinc-500">waiting on client</span>
              </div>
            ) : (
              <div key={a.id} className="rounded-2xl border border-accent/30 bg-accent-soft p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                    <ClipboardList className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-extrabold leading-tight text-black dark:text-zinc-50">{a.template.name}</p>
                    <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                      {n} question{n === 1 ? '' : 's'} · about {Math.max(1, Math.round(n * 0.5))} min
                    </p>
                    {a.template.description && <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{a.template.description}</p>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setOpenFormId(a.id)}
                  className="mt-3 h-11 w-full rounded-full bg-accent text-sm font-extrabold text-accent-foreground"
                >
                  Fill out
                </button>
              </div>
            );
          })}
        </div>
      )}

      {completed.length > 0 && (
        <div className="space-y-2.5">
          <h3 className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Completed</h3>
          {completed.map((a) => (
            <CompletedForm key={a.id} assignment={a} />
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

      {openForm && <FillableForm assignment={openForm} onClose={() => setOpenFormId(null)} />}
    </div>
  );
}
