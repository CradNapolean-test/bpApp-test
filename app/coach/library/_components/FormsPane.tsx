'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardList } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useActiveGymId } from '@/app/coach/_components/CoachGymsContext';
import { useToast } from '@/app/_components/ToastProvider';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import {
  createFormTemplate,
  deleteFormTemplate,
  getFormTemplateWithQuestions,
  updateFormTemplate,
} from '@/lib/data/forms';
import {
  buildQuestionPayload,
  describeChanges,
  diffQuestions,
  isChoice,
  moveQuestion,
  optionsToText,
  removalNote,
  validateDrafts,
  type QuestionDraft,
} from '@/lib/formEdit';
import { STARTER_FORMS } from '@/lib/starterForms';
import type { FormQuestionType, FormTemplateRow } from '@/lib/data/types';
import { inputCls } from '@/app/_components/ui';

const QUESTION_TYPES: { value: FormQuestionType; label: string }[] = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
];

let draftCounter = 0;
function newDraft(): QuestionDraft {
  draftCounter += 1;
  return { key: `new-${draftCounter}`, id: null, question_text: '', question_type: 'short_text', optionsText: '', required: true, answerCount: 0 };
}

// Fullscreen editor for one form template -- name/description/default-onboarding flag, plus
// its question list. Shared by both "+ New form" (editingId null) and each row's "Edit".
function FormEditorOverlay({
  editingId,
  initialName,
  initialDescription,
  initialIsDefault,
  initialQuestions,
  onClose,
  onDelete,
}: {
  editingId: string | null;
  initialName: string;
  initialDescription: string;
  initialIsDefault: boolean;
  initialQuestions: QuestionDraft[];
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const { run: runSave, busy: saving } = useAction();
  const gymId = useActiveGymId();
  const confirm = useConfirm();
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [questions, setQuestions] = useState<QuestionDraft[]>(initialQuestions);
  const [error, setError] = useState<string | null>(null);
  // What was saved when the editor opened: the base for telling the coach what a save will do to answers (R3).
  const savedQuestions = useRef(initialQuestions.filter((q) => q.id));

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setError(null);
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, newDraft()]);
  }

  async function removeQuestion(index: number) {
    const q = questions[index];
    const note = removalNote(q.answerCount);
    if (note) {
      const ok = await confirm({
        title: 'Remove this question?',
        body: note,
        confirmLabel: 'Remove question',
        destructive: true,
      });
      if (!ok) return;
    }
    setError(null);
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateDrafts(questions);
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    const fields = { name, description: description || null, is_default_onboarding: isDefault };
    const payload = buildQuestionPayload(questions);

    if (editingId) {
      const warning = describeChanges(
        diffQuestions(
          savedQuestions.current.map((q) => ({ id: q.id as string, question_type: q.question_type, answerCount: q.answerCount })),
          payload
        )
      );
      if (warning) {
        const ok = await confirm({ title: 'Save these changes?', body: warning, confirmLabel: 'Save changes' });
        if (!ok) return;
      }
    }

    await runSave(
      () =>
        editingId
          ? updateFormTemplate(editingId, fields, payload, gymId)
          : createFormTemplate(
              fields,
              payload.map(({ id: _id, ...rest }) => rest), // eslint-disable-line @typescript-eslint/no-unused-vars
              gymId
            ),
      { success: editingId ? 'Template saved' : 'Template created', onDone: onClose }
    );
  }

  return (
    <FocusOverlay
      title={editingId ? 'Edit form' : 'New form'}
      onClose={onClose}
      headerActions={
        editingId && (
          <Button variant="danger" size="sm" onClick={() => onDelete(editingId)}>
            Delete
          </Button>
        )
      }
    >
      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          Use as default onboarding form for new clients
        </label>

        <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
          {questions.map((q, i) => (
            <div key={q.key} className="space-y-2 rounded-md border border-black/10 p-3 dark:border-white/10">
              <div className="flex gap-2">
                <input
                  placeholder="Question text"
                  className={inputCls}
                  value={q.question_text}
                  onChange={(e) => updateQuestion(i, { question_text: e.target.value })}
                />
                <select
                  className={inputCls}
                  value={q.question_type}
                  onChange={(e) => updateQuestion(i, { question_type: e.target.value as FormQuestionType })}
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
              {isChoice(q.question_type) && (
                <textarea
                  rows={Math.min(8, Math.max(3, q.optionsText.split('\n').length + 1))}
                  placeholder={'One option per line'}
                  aria-label="Options, one per line"
                  className={inputCls}
                  value={q.optionsText}
                  onChange={(e) => updateQuestion(i, { optionsText: e.target.value })}
                />
              )}
              {q.answerCount > 0 && (
                <p className="text-xs text-zinc-500">
                  {q.answerCount} answer{q.answerCount === 1 ? '' : 's'} so far. Changing the wording keeps them.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Move question up"
                    disabled={i === 0}
                    onClick={() => setQuestions((qs) => moveQuestion(qs, i, -1))}
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move question down"
                    disabled={i === questions.length - 1}
                    onClick={() => setQuestions((qs) => moveQuestion(qs, i, 1))}
                    className="rounded-md p-1.5 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeQuestion(i)}
                    className="ml-1 text-xs text-danger hover:underline"
                  >
                    Remove question
                  </button>
                </div>
              </div>
            </div>
          ))}
          <button type="button" onClick={addQuestion} className="text-xs font-medium text-zinc-500 hover:underline">
            + Add question
          </button>
        </div>

        {error && <p className="text-sm font-semibold text-danger">{error}</p>}

        <div className="flex gap-2">
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </FocusOverlay>
  );
}

export function FormsPane({ initialTemplates }: { initialTemplates: FormTemplateRow[] }) {
  const confirm = useConfirm();
  const toast = useToast();
  const { run: runDelete } = useAction();
  const { run: runStarter, busy: addingStarter } = useAction();
  const gymId = useActiveGymId();
  const [editorState, setEditorState] = useState<{
    editingId: string | null;
    name: string;
    description: string;
    isDefault: boolean;
    questions: QuestionDraft[];
  } | null>(null);

  function openNew() {
    setEditorState({ editingId: null, name: '', description: '', isDefault: false, questions: [newDraft()] });
  }

  async function openEdit(id: string) {
    let full;
    try {
      full = await getFormTemplateWithQuestions(id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not load that template');
      return;
    }
    if (!full) {
      toast.error('That template no longer exists');
      return;
    }
    setEditorState({
      editingId: id,
      name: full.name,
      description: full.description ?? '',
      isDefault: full.is_default_onboarding,
      questions:
        full.questions.length > 0
          ? full.questions.map((q) => ({
              key: q.id,
              id: q.id,
              question_text: q.question_text,
              question_type: q.question_type,
              optionsText: optionsToText(q.options),
              required: q.required,
              answerCount: q.answerCount ?? 0,
            }))
          : [newDraft()],
    });
  }

  // One-tap ready-made forms (health questionnaire, lifestyle intake) to edit afterwards.
  async function addStarter(id: string) {
    const starter = STARTER_FORMS.find((f) => f.id === id);
    if (!starter) return;
    await runStarter(
      () =>
        createFormTemplate(
          { name: starter.name, description: starter.description, is_default_onboarding: false },
          starter.questions.map((q, i) => ({ order_index: i, ...q })),
          gymId
        ),
      { success: `Added "${starter.name}". Edit it, or tick "default onboarding form" so new members get it.` }
    );
  }

  async function handleDelete(id: string) {
    const template = initialTemplates.find((t) => t.id === id);
    const ok = await confirm({
      title: `Delete "${template?.name ?? 'this template'}"?`,
      body: 'Every assignment of this form and the answers clients already submitted are deleted too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteFormTemplate(id, gymId), { success: 'Template deleted', onDone: () => setEditorState(null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <DropdownMenu
          variant="header"
          triggerLabel="Start from a ready-made form"
          items={STARTER_FORMS.map((f) => ({
            label: addingStarter ? 'Adding…' : f.name,
            onSelect: () => addStarter(f.id),
            disabled: addingStarter,
          }))}
        />
        <button
          type="button"
          onClick={openNew}
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90"
        >
          + New form
        </button>
      </div>

      {initialTemplates.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No form templates yet" hint="Add one above, or use the ⋯ menu to start from a ready-made health questionnaire." />
      ) : (
        <div className="space-y-2">
          {initialTemplates.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
            >
              <div className="min-w-0">
                <p className="font-bold text-black dark:text-zinc-50">{t.name}</p>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2.5">
                {t.is_default_onboarding && (
                  <span className="rounded-full bg-accent/10 px-2.5 py-1 text-xs font-semibold text-accent">
                    Default onboarding
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(t.id)}
                  className="rounded-full px-2.5 py-1 text-sm font-semibold text-accent hover:bg-accent/10"
                >
                  Edit
                </button>
                <DropdownMenu
                  triggerLabel={`More actions for ${t.name}`}
                  items={[{ label: 'Delete form', destructive: true, onSelect: () => handleDelete(t.id) }]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {editorState && (
        <FormEditorOverlay
          editingId={editorState.editingId}
          initialName={editorState.name}
          initialDescription={editorState.description}
          initialIsDefault={editorState.isDefault}
          initialQuestions={editorState.questions}
          onClose={() => setEditorState(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
