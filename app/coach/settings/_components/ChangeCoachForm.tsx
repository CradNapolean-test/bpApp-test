'use client';

import { useEffect, useRef, useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { inputCls } from '@/app/_components/ui';
import { changeMemberCoach, type CoachMemberOption } from '@/lib/data/gym';
import { changeCoachConfirm, coachChangeProblem, newCoachOptions } from '@/lib/coachChange';

export interface CoachChoice {
  id: string;
  name: string;
}

// "Change coach" for one member (BO14): pick the member (when the screen starts from a coach) and the new coach, then a confirm that names
// the member, their coach now and the new one. Used by the owner's gym Members list and the gym admin's Team section. The database checks
// who may and that the new coach works at the member's gym (change_member_coach, migration 0176); this is only where the controls live.
export function ChangeCoachForm({
  idPrefix,
  member,
  loadMembers,
  from,
  coaches,
  onCancel,
  onDone,
}: {
  idPrefix: string;
  // A member already chosen (the owner's Members list)...
  member?: CoachMemberOption;
  // ...or the coach's members to choose from (the Team section), read when the form opens.
  loadMembers?: () => Promise<{ ok: true; members: CoachMemberOption[] } | { ok: false; error: string }>;
  // Their coach now; null for a member with no coach.
  from: CoachChoice | null;
  // The coaches at the member's gym.
  coaches: CoachChoice[];
  onCancel: () => void;
  onDone?: () => void;
}) {
  const { run, busy } = useAction();
  const confirm = useConfirm();
  const [members, setMembers] = useState<CoachMemberOption[] | null>(member ? [member] : null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [memberId, setMemberId] = useState(member?.id ?? '');
  const [toId, setToId] = useState('');
  const options = newCoachOptions(coaches, from?.id ?? null);
  const chosenMember = members?.find((m) => m.id === memberId) ?? null;
  const chosenCoach = options.find((c) => c.id === toId) ?? null;

  // Read once when the form opens, whatever the parent re-renders with.
  const loadRef = useRef(loadMembers);
  useEffect(() => {
    const load = loadRef.current;
    if (member || !load) return;
    let live = true;
    load()
      .then((res) => {
        if (!live) return;
        if (res.ok) setMembers(res.members);
        else setLoadError(res.error);
      })
      .catch(() => live && setLoadError('Could not load their members. Cancel, then open this again.'));
    return () => {
      live = false;
    };
  }, [member]);

  async function handleChange() {
    if (!chosenMember || !chosenCoach) return;
    if (coachChangeProblem({ memberId: chosenMember.id, fromCoachId: from?.id ?? null, toCoachId: chosenCoach.id })) return;
    const words = changeCoachConfirm({ member: chosenMember.name, from: from?.name ?? null, to: chosenCoach.name });
    if (!(await confirm({ ...words, destructive: true }))) return;
    await run(() => changeMemberCoach(chosenMember.id, from?.id ?? null, chosenCoach.id), {
      success: `${chosenCoach.name} is now ${chosenMember.name}'s coach`,
      onDone,
    });
  }

  return (
    <div className="space-y-2">
      {!member && (
        <div className="space-y-1">
          <label htmlFor={`${idPrefix}-member`} className="text-xs font-medium text-zinc-500">
            Member
          </label>
          {loadError ? (
            <p className="text-sm text-danger" role="alert">
              {loadError}
            </p>
          ) : members === null ? (
            <p className="text-sm text-zinc-500">Loading their members…</p>
          ) : members.length === 0 ? (
            <p className="text-sm text-zinc-500">They have no members at this gym.</p>
          ) : (
            <select id={`${idPrefix}-member`} value={memberId} onChange={(e) => setMemberId(e.target.value)} className={inputCls}>
              <option value="">Choose a member…</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      <div className="space-y-1">
        <label htmlFor={`${idPrefix}-coach`} className="text-xs font-medium text-zinc-500">
          {member ? `New coach for ${member.name}` : 'New coach'}
        </label>
        {options.length === 0 ? (
          <p className="text-sm text-zinc-500">There is no other coach at this gym.</p>
        ) : (
          <select id={`${idPrefix}-coach`} value={toId} onChange={(e) => setToId(e.target.value)} className={inputCls}>
            <option value="">Choose a coach…</option>
            {options.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !chosenMember || !chosenCoach}
          onClick={() => void handleChange()}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-accent px-3.5 text-[13px] font-extrabold text-accent-foreground disabled:opacity-50"
        >
          Change coach
        </button>
        <button type="button" onClick={onCancel} className="min-h-10 px-2 py-2 text-xs font-semibold text-zinc-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
