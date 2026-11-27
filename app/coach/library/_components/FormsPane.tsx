'use client';

import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ClipboardList } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
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
  remindForm,
  sendFormToGroup,
  updateFormTemplate,
} from '@/lib/data/forms';
import {
  formStatus,
  formStatusLine,
  groupSendPreview,
  groupSendSummary,
  nameList,
  remindSummary,
  type FormRollupRow,
} from '@/lib/libraryRollups';
import {
  buildQuestionPayload,
  describeChanges,
  diffQuestions,
  PHONE_PENDING_NOTE,
  SCALE_LABEL_MAX,
  draftOptions,
  isAlwaysOptional,
  isChoice,
  moveQuestion,
  removalNote,
  validateDrafts,
  type QuestionDraft,
} from '@/lib/formEdit';
import { STARTER_FORMS } from '@/lib/starterForms';
import type { ClientGroupWithMembers, FormQuestionType, FormTemplateRow } from '@/lib/data/types';
import { inputCls } from '@/app/_components/ui';

const QUESTION_TYPES: { value: FormQuestionType; label: string }[] = [
  { value: 'short_text', label: 'Short text' },
  { value: 'long_text', label: 'Long text' },
  { value: 'number', label: 'Number' },
  { value: 'single_choice', label: 'Single choice' },
  { value: 'multi_choice', label: 'Multiple choice' },
  { value: 'yes_no', label: 'Yes / no' },
  { value: 'scale', label: 'Scale 1-10' },
];

// Yes / no and 1-10 scale need migration 0179: until the database takes them they are not offered (a question already of that type still
// shows its own type).
const NEW_TYPES: FormQuestionType[] = ['yes_no', 'scale'];
function typesFor(current: FormQuestionType, newTypesReady: boolean) {
  return QUESTION_TYPES.filter((t) => newTypesReady || !NEW_TYPES.includes(t.value) || t.value === current);
}

let draftCounter = 0;
function newDraft(): QuestionDraft {
  draftCounter += 1;
  return { key: `new-${draftCounter}`, id: null, question_text: '', question_type: 'short_text', optionsText: '', scaleLow: '', scaleHigh: '', required: true, answerCount: 0 };
}

// Fullscreen editor for one form template -- name/description/default-onboarding flag, plus
// its question list. Shared by both "+ New form" (editingId null) and each row's "Edit".
function FormEditorOverlay({
  editingId,
  initialName,
  initialDescription,
  initialIsDefault,
  initialQuestions,
  newTypesReady,
  onClose,
  onDelete,
}: {
  editingId: string | null;
  initialName: string;
  initialDescription: string;
  initialIsDefault: boolean;
  initialQuestions: QuestionDraft[];
  // The database takes yes / no and 1-10 scale questions (migration 0179).
  newTypesReady: boolean;
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
          Use as default onboarding form for new members
        </label>

        <div className="space-y-3 border-t border-black/10 pt-3 dark:border-white/10">
          {questions.map((q, i) => (
            <div key={q.key} className="space-y-2 rounded-2xl border border-black/[.08] p-4 dark:border-white/10">
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
                  {typesFor(q.question_type, newTypesReady).map((t) => (
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
              {q.question_type === 'scale' && (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    placeholder="Words under 1 (optional)"
                    aria-label="Words under 1 (optional)"
                    maxLength={SCALE_LABEL_MAX}
                    className={inputCls}
                    value={q.scaleLow ?? ''}
                    onChange={(e) => updateQuestion(i, { scaleLow: e.target.value })}
                  />
                  <input
                    placeholder="Words under 10 (optional)"
                    aria-label="Words under 10 (optional)"
                    maxLength={SCALE_LABEL_MAX}
                    className={inputCls}
                    value={q.scaleHigh ?? ''}
                    onChange={(e) => updateQuestion(i, { scaleHigh: e.target.value })}
                  />
                </div>
              )}
              {isAlwaysOptional(q.question_type) && <p className="text-xs text-zinc-500">{PHONE_PENDING_NOTE}</p>}
              {q.answerCount > 0 && (
                <p className="text-xs text-zinc-500">
                  {q.answerCount} answer{q.answerCount === 1 ? '' : 's'} so far. Changing the wording keeps them.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {isAlwaysOptional(q.question_type) ? (
                  // Yes / no and scale are optional until the phone app is updated (see PHONE_PENDING_NOTE).
                  <span className="text-xs text-zinc-500">Optional</span>
                ) : (
                  <label className="flex items-center gap-2 text-xs text-zinc-500">
                    <input type="checkbox" checked={q.required} onChange={(e) => updateQuestion(i, { required: e.target.checked })} />
                    Required
                  </label>
                )}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label="Move question up"
                    disabled={i === 0}
                    onClick={() => setQuestions((qs) => moveQuestion(qs, i, -1))}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Move question down"
                    disabled={i === questions.length - 1}
                    onClick={() => setQuestions((qs) => moveQuestion(qs, i, 1))}
                    className="rounded-lg p-2 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5"
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

const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Who has answered a form and who hasn't, with Remind for those who haven't, behind a confirm that names them (LB19).
function FormStatusSheet({
  template,
  rollup,
  names,
  onClose,
}: {
  template: FormTemplateRow;
  rollup: FormRollupRow[];
  names: Record<string, string>;
  onClose: () => void;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const gymId = useActiveGymId();
  const { run, busy } = useAction();
  const status = formStatus(rollup, template.id, names);

  async function handleRemind() {
    const waiting = status.waiting;
    if (waiting.length === 0) return;
    const ok = await confirm({
      title: `Remind ${waiting.length === 1 ? waiting[0].name : `${waiting.length} members`} to fill in “${template.name}”?`,
      body: `${nameList(waiting.map((w) => w.name), 8)} ${waiting.length === 1 ? 'gets' : 'each get'} a reminder in their notifications. Anyone reminded about this form in the last 12 hours is skipped.`,
      confirmLabel: waiting.length === 1 ? 'Send reminder' : `Remind ${waiting.length}`,
    });
    if (!ok) return;
    let summary = '';
    await run(
      async () => {
        const r = await remindForm(template.id, waiting.map((w) => w.clientId), gymId);
        if (r.ok) summary = remindSummary(r);
        return r;
      },
      { onDone: () => toast.success(summary) }
    );
  }

  return (
    <BottomSheet title={`“${template.name}”: who has answered`} onClose={onClose}>
      {status.waiting.length + status.answered.length === 0 ? (
        <p className="text-sm text-zinc-500">Nobody has been sent this form yet. Send it from a member&apos;s Check-in page, or to a group from its menu.</p>
      ) : (
        <div className="space-y-4">
          <section className="space-y-1.5">
            <h3 className="text-sm font-extrabold text-black dark:text-zinc-50">Not answered yet ({status.waiting.length})</h3>
            {status.waiting.length === 0 ? (
              <p className="text-sm text-zinc-500">Everyone has answered.</p>
            ) : (
              <ul className="divide-y divide-black/[.06] rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
                {status.waiting.map((w) => (
                  <li key={w.clientId} className="px-3 py-2">
                    <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{w.name}</span>
                    <span className="block text-xs text-zinc-500">
                      Sent {shortDate(w.sentAt)}
                      {w.answeredBefore ? ' · answered an earlier one' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {status.waiting.length > 0 && (
            <Button variant="primary" className="w-full" disabled={busy} onClick={handleRemind}>
              {busy ? 'Sending…' : `Remind ${status.waiting.length} who haven't answered`}
            </Button>
          )}
          <section className="space-y-1.5">
            <h3 className="text-sm font-extrabold text-black dark:text-zinc-50">Answered ({status.answered.length})</h3>
            {status.answered.length === 0 ? (
              <p className="text-sm text-zinc-500">No answers yet.</p>
            ) : (
              <ul className="divide-y divide-black/[.06] rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
                {status.answered.map((a) => (
                  <li key={a.clientId} className="px-3 py-2">
                    <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{a.name}</span>
                    <span className="block text-xs text-zinc-500">Answered {shortDate(a.answeredAt)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-zinc-500">Their answers are on each member&apos;s Check-in page.</p>
          </section>
        </div>
      )}
    </BottomSheet>
  );
}

// Send a form to one of the groups made on the Members list, in one step (LB19). Members who already have it open are skipped.
function GroupSendSheet({
  template,
  groups,
  rollup,
  onClose,
}: {
  template: FormTemplateRow;
  groups: ClientGroupWithMembers[];
  rollup: FormRollupRow[];
  onClose: () => void;
}) {
  const toast = useToast();
  const gymId = useActiveGymId();
  const { run, busy } = useAction();
  const [groupId, setGroupId] = useState<string | null>(null);
  const group = groups.find((g) => g.id === groupId);
  const preview = group ? groupSendPreview(group.memberIds, rollup, template.id) : null;

  async function handleSend() {
    if (!group) return;
    let summary = '';
    await run(
      async () => {
        const r = await sendFormToGroup(template.id, group.id, gymId);
        if (r.ok) summary = groupSendSummary(r);
        return r;
      },
      {
        onDone: () => {
          toast.success(summary);
          onClose();
        },
      }
    );
  }

  return (
    <BottomSheet title={`Send “${template.name}” to a group`} onClose={onClose}>
      {groups.length === 0 ? (
        <p className="text-sm text-zinc-500">There are no groups yet. Make one on the Members list (select members, then Add to a group).</p>
      ) : (
        <div className="space-y-4">
          <fieldset className="space-y-1.5">
            <legend className="text-xs font-medium text-zinc-500">Group</legend>
            <div className="max-h-64 divide-y divide-black/[.06] overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
              {groups.map((g) => (
                <label key={g.id} className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
                  <input type="radio" name="form-group" checked={groupId === g.id} onChange={() => setGroupId(g.id)} />
                  <span className="min-w-0 flex-1 truncate font-bold text-black dark:text-zinc-50">{g.name}</span>
                  <span className="shrink-0 text-xs text-zinc-500">
                    {g.memberIds.length} member{g.memberIds.length === 1 ? '' : 's'}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {preview && (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {preview.toSend === 0
                ? preview.total === 0
                  ? 'Nobody is in this group yet.'
                  : 'Everyone in this group already has it open.'
                : `${preview.toSend} member${preview.toSend === 1 ? '' : 's'} get${preview.toSend === 1 ? 's' : ''} it, with a notice.`}
              {preview.alreadyOpen > 0 && ` ${preview.alreadyOpen} already ${preview.alreadyOpen === 1 ? 'has' : 'have'} it open and ${preview.alreadyOpen === 1 ? 'is' : 'are'} skipped.`}
              {preview.answeredBefore > 0 &&
                ` ${preview.answeredBefore} answered it before and ${preview.answeredBefore === 1 ? 'gets' : 'get'} it again.`}
            </p>
          )}
          <Button variant="primary" className="w-full" disabled={busy || !preview || preview.toSend === 0} onClick={handleSend}>
            {busy
              ? 'Sending…'
              : !preview
                ? 'Choose a group'
                : preview.toSend === 0
                  ? 'Nobody new to send it to'
                  : `Send to ${preview.toSend} member${preview.toSend === 1 ? '' : 's'}`}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}

// The ready-made forms, named (LB20: they sat behind an unlabelled ⋯ before "+ New form").
function StarterFormsSheet({ addingId, onAdd, onClose }: { addingId: string | null; onAdd: (id: string) => void; onClose: () => void }) {
  return (
    <BottomSheet title="Ready-made forms" onClose={onClose}>
      <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">Add one to your forms, then edit it as you like.</p>
      <ul className="space-y-2">
        {STARTER_FORMS.map((f) => (
          <li key={f.id} className="flex items-start gap-3 rounded-xl border border-black/10 p-3 dark:border-white/10">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-black dark:text-zinc-50">{f.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">{f.summary}</p>
            </div>
            <Button variant="outline" disabled={addingId !== null} onClick={() => onAdd(f.id)}>
              {addingId === f.id ? 'Adding…' : 'Add'}
            </Button>
          </li>
        ))}
      </ul>
    </BottomSheet>
  );
}

export function FormsPane({
  initialTemplates,
  groups = [],
  rollup = [],
  members = [],
  memberNames = {},
  newTypesReady = false,
}: {
  initialTemplates: FormTemplateRow[];
  // The gym's groups (made on the Members list), for Send to a group.
  groups?: ClientGroupWithMembers[];
  // Every sending of these forms the coach can read, for who has answered.
  rollup?: FormRollupRow[];
  members?: { id: string; name: string }[];
  // Names of the other members in the rollup the coach may read.
  memberNames?: Record<string, string>;
  // The database takes yes / no and 1-10 scale questions (migration 0179); until then they are not offered.
  newTypesReady?: boolean;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const { run: runDelete } = useAction();
  const { run: runStarter } = useAction();
  const [addingStarter, setAddingStarter] = useState<string | null>(null);
  const gymId = useActiveGymId();
  const [starterOpen, setStarterOpen] = useState(false);
  const [sheet, setSheet] = useState<{ kind: 'status' | 'group'; templateId: string } | null>(null);
  const [editorState, setEditorState] = useState<{
    editingId: string | null;
    name: string;
    description: string;
    isDefault: boolean;
    questions: QuestionDraft[];
  } | null>(null);
  const names = { ...memberNames, ...Object.fromEntries(members.map((m) => [m.id, m.name])) };
  const sheetTemplate = sheet ? initialTemplates.find((t) => t.id === sheet.templateId) : undefined;

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
              ...draftOptions(q.question_type, q.options),
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
    setAddingStarter(id);
    await runStarter(
      () =>
        createFormTemplate(
          { name: starter.name, description: starter.description, is_default_onboarding: false },
          starter.questions.map((q, i) => ({ order_index: i, ...q })),
          gymId
        ),
      {
        success: `Added "${starter.name}". Edit it, or tick "default onboarding form" so new members get it.`,
        onDone: () => setStarterOpen(false),
      }
    );
    setAddingStarter(null);
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
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setStarterOpen(true)}
          className="inline-flex h-11 shrink-0 items-center rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
        >
          Ready-made forms
        </button>
        <button
          type="button"
          onClick={openNew}
          className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground hover:opacity-90"
        >
          + New form
        </button>
      </div>

      {starterOpen && <StarterFormsSheet addingId={addingStarter} onAdd={addStarter} onClose={() => setStarterOpen(false)} />}

      {initialTemplates.length === 0 ? (
        <EmptyState icon={ClipboardList} title="No form templates yet" hint="Add one above, or start from a ready-made health questionnaire." />
      ) : (
        <div className="overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-3.5 pt-[18px] sm:px-6">
            <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Your forms</h2>
            <span className="text-[13px] font-semibold text-zinc-500">Send one from a member&apos;s Check-in page, or to a group from its menu</span>
          </div>
          {initialTemplates.map((t) => {
            const line = formStatusLine(formStatus(rollup, t.id, names));
            return (
              <div
                key={t.id}
                data-stagger
                className="flex min-h-[64px] flex-wrap items-center justify-between gap-2.5 border-t border-black/[.07] px-5 py-3 sm:px-6 dark:border-white/10"
              >
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-black dark:text-zinc-50">{t.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-1 text-[13px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      {t.questionCount} question{t.questionCount === 1 ? '' : 's'}
                    </span>
                    {line && (
                      <>
                        <span aria-hidden>·</span>
                        <button
                          type="button"
                          onClick={() => setSheet({ kind: 'status', templateId: t.id })}
                          className="inline-flex min-h-11 items-center font-semibold text-accent underline-offset-2 hover:underline"
                        >
                          {line}
                        </button>
                      </>
                    )}
                  </p>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-2.5">
                  {t.is_default_onboarding && (
                    <span className="inline-flex h-6 items-center rounded-full bg-accent-soft px-2.5 text-xs font-extrabold text-accent">
                      Default onboarding
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => openEdit(t.id)}
                    className="inline-flex h-11 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent"
                  >
                    Edit
                  </button>
                  <DropdownMenu
                    triggerLabel={`More actions for ${t.name}`}
                    items={[
                      { label: 'Send to a group', onSelect: () => setSheet({ kind: 'group', templateId: t.id }) },
                      { label: 'Who has answered', onSelect: () => setSheet({ kind: 'status', templateId: t.id }) },
                      { label: 'Delete form', destructive: true, onSelect: () => handleDelete(t.id) },
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {sheet?.kind === 'status' && sheetTemplate && (
        <FormStatusSheet template={sheetTemplate} rollup={rollup} names={names} onClose={() => setSheet(null)} />
      )}
      {sheet?.kind === 'group' && sheetTemplate && (
        <GroupSendSheet template={sheetTemplate} groups={groups} rollup={rollup} onClose={() => setSheet(null)} />
      )}

      {editorState && (
        <FormEditorOverlay
          editingId={editorState.editingId}
          initialName={editorState.name}
          initialDescription={editorState.description}
          initialIsDefault={editorState.isDefault}
          initialQuestions={editorState.questions}
          newTypesReady={newTypesReady}
          onClose={() => setEditorState(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
