'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { EmptyState } from '@/app/_components/EmptyState';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import {
  createFormTemplate,
  deleteFormTemplate,
  getFormTemplateWithQuestions,
  updateFormTemplate,
} from '@/lib/data/forms';
import type { FormQuestionType, FormTemplateRow } from '@/lib/data/types';

const QUESTION_TYPES: { value: FormQuestionType; label: string }[] = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
];

const CHOICE_TYPES: FormQuestionType[] = ['single_choice', 'multi_choice'];

type QuestionDraft = {
  question_text: string;
  question_type: FormQuestionType;
  optionsRaw: string;
  required: boolean;
};

const BLANK_QUESTION: QuestionDraft = { question_text: '', question_type: 'short_text', optionsRaw: '', required: true };

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10';

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
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [isDefault, setIsDefault] = useState(initialIsDefault);
  const [questions, setQuestions] = useState<QuestionDraft[]>(initialQuestions);

  function updateQuestion(index: number, patch: Partial<QuestionDraft>) {
    setQuestions((qs) => qs.map((q, i) => (i === index ? { ...q, ...patch } : q)));
  }

  function addQuestion() {
    setQuestions((qs) => [...qs, { ...BLANK_QUESTION }]);
  }

  function removeQuestion(index: number) {
    setQuestions((qs) => qs.filter((_, i) => i !== index));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const fields = { name, description: description || null, is_default_onboarding: isDefault };
    const preparedQuestions = questions
      .filter((q) => q.question_text.trim().length > 0)
      .map((q, i) => ({
        order_index: i,
        question_text: q.question_text,
        question_type: q.question_type,
        options: CHOICE_TYPES.includes(q.question_type)
          ? q.optionsRaw
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          : null,
        required: q.required,
      }));

    await runSave(
      () =>
        editingId
          ? updateFormTemplate(editingId, fields, preparedQuestions)
          : createFormTemplate(fields, preparedQuestions),
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
            <div key={i} className="space-y-2 rounded-md border border-black/10 p-3 dark:border-white/10">
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
              {CHOICE_TYPES.includes(q.question_type) && (
                <input
                  placeholder="Options, comma separated"
                  className={inputCls}
                  value={q.optionsRaw}
                  onChange={(e) => updateQuestion(i, { optionsRaw: e.target.value })}
                />
              )}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-xs text-zinc-500">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(i, { required: e.target.checked })}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeQuestion(i)}
                  className="text-xs text-danger hover:underline"
                >
                  Remove question
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addQuestion} className="text-xs font-medium text-zinc-500 hover:underline">
            + Add question
          </button>
        </div>

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
  const [editorState, setEditorState] = useState<{
    editingId: string | null;
    name: string;
    description: string;
    isDefault: boolean;
    questions: QuestionDraft[];
  } | null>(null);

  function openNew() {
    setEditorState({ editingId: null, name: '', description: '', isDefault: false, questions: [{ ...BLANK_QUESTION }] });
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
              question_text: q.question_text,
              question_type: q.question_type,
              optionsRaw: (q.options ?? []).join(', '),
              required: q.required,
            }))
          : [{ ...BLANK_QUESTION }],
    });
  }

  async function handleDelete(id: string) {
    const template = initialTemplates.find((t) => t.id === id);
    const ok = await confirm({
      title: `Delete "${template?.name ?? 'this template'}"?`,
      body: 'Every assignment of this form and the answers clients already submitted are deleted too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteFormTemplate(id), { success: 'Template deleted', onDone: () => setEditorState(null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={openNew}
          className="shrink-0 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          + New form
        </button>
      </div>

      {initialTemplates.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No form templates yet" hint="Add one above to start collecting structured answers from clients." />
      ) : (
        <div className="space-y-2">
          {initialTemplates.map((t) => (
            <div
              key={t.id}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
            >
              <div className="min-w-0">
                <p className="font-bold text-black dark:text-zinc-50">{t.name}</p>
                <p className="mt-0.5 text-sm text-zinc-500">
                  {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                {t.is_default_onboarding && (
                  <span className="rounded-full bg-[#19adb1]/10 px-2.5 py-1 text-xs font-semibold text-[#19adb1]">
                    Default onboarding
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(t.id)}
                  className="text-sm font-semibold text-black hover:underline dark:text-zinc-50"
                >
                  Edit
                </button>
                <button type="button" onClick={() => handleDelete(t.id)} className="text-sm font-semibold text-danger hover:underline">
                  Delete
                </button>
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
