// How long a toast stays on screen (SH, accessibility). A confirmation can go quickly; an error is the thing a person must not miss, and four
// seconds is too short to read it, let alone act on it, so errors stay ten times as long as a glance and can always be dismissed.

export const SUCCESS_TOAST_MS = 4000;
export const ERROR_TOAST_MS = 10000;

export type ToastKind = 'success' | 'error';

export const toastDuration = (kind: ToastKind): number => (kind === 'error' ? ERROR_TOAST_MS : SUCCESS_TOAST_MS);

// Screen readers: a confirmation is announced politely ("status"), an error interrupts ("alert").
export const toastRole = (kind: ToastKind): 'status' | 'alert' => (kind === 'error' ? 'alert' : 'status');
