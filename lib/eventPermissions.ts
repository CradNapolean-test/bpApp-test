// Who may change a gym event (decision of 11 Nov 2026): any coach at the gym adds events and changes, deletes or messages the sign-ups of
// their own; a gym admin of that gym or the owner does it for anyone's. The database enforces the same rule (may_manage_gym_event,
// migration 0171); the server actions check it first so the screen gets a sentence instead of a write that silently changed nothing.

export const EVENT_NOT_YOURS = 'Only the coach who added this event, a gym admin or the owner can change it.';

// canManageAll: the signed-in person is an admin of the event's gym or the owner (can_manage_gym_business, migration 0161).
export function mayChangeEvent(event: { created_by: string | null }, userId: string | null | undefined, canManageAll: boolean): boolean {
  if (canManageAll) return true;
  return !!userId && event.created_by === userId;
}
