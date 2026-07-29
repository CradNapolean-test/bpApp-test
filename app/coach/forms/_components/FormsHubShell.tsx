'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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

export function FormsHubShell({ initialTemplates }: { initialTemplates: FormTemplateRow[] }) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [questions, setQuestions] = useState<QuestionDraft[]>([{ ...BLANK_QUESTION }]);
  const [saving, setSaving] = useState(false);

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  function resetForm() {
    setEditingId(null);
    setName('');
    setDescription('');
    setIsDefault(false);
    setQuestions([{ ...BLANK_QUESTION }]);
  }

  async function handleEditClick(id: string) {
    const full = await getFormTemplateWithQuestions(id);
    if (!full) return;
    setEditingId(id);
    setName(full.name);
    setDescription(full.description ?? '');
    setIsDefault(full.is_default_onboarding);
    setQuestions(
      full.questions.length > 0
        ? full.questions.map((q) => ({
            question_text: q.question_text,
            question_type: q.question_type,
            optionsRaw: (q.options ?? []).join(', '),
            required: q.required,
          }))
        : [{ ...BLANK_QUESTION }]
    );
  }

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
    setSaving(true);
    try {
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

      if (editingId) {
        await updateFormTemplate(editingId, fields, preparedQuestions);
      } else {
        await createFormTemplate(fields, preparedQuestions);
      }
      resetForm();
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deleteFormTemplate(id);
    if (editingId === id) resetForm();
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleSave} className="space-y-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {editingId ? 'Edit template' : 'New template'}
        </h3>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
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
                  className="text-xs text-red-600 hover:underline dark:text-red-400"
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
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
          >
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Create template'}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-black/10 px-4 py-2 text-sm font-medium dark:border-white/10"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {initialTemplates.map((t) => (
          <li key={t.id} className="flex items-center justify-between p-3 text-sm">
            <span>
              {t.name}
              {t.is_default_onboarding && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-400">
                  Default
                </span>
              )}
              {t.description ? ` · ${t.description}` : ''}
            </span>
            <span className="flex gap-3">
              <button onClick={() => handleEditClick(t.id)} className="text-xs text-zinc-500 hover:underline">
                Edit
              </button>
              <button
                onClick={() => handleDelete(t.id)}
                className="text-xs text-red-600 hover:underline dark:text-red-400"
              >
                Delete
              </button>
            </span>
          </li>
        ))}
        {initialTemplates.length === 0 && <li className="p-3 text-sm text-zinc-500">No templates yet.</li>}
      </ul>
    </div>
  );
}
