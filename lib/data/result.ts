// Next.js redacts any error *thrown* out of a Server Action in production, replacing the
// message with "An error occurred in the Server Components render...". That's right for
// unexpected faults, but wrong for domain errors the user must actually read ("Not enough
// credits", "Form already submitted"). Returned values aren't redacted, so the RPC-backed
// mutations hand these back instead of throwing. useAction() understands the shape.
export type ActionResult = { ok: true } | { ok: false; error: string };

export function ok(): ActionResult {
  return { ok: true };
}

export function fail(error: { message?: string } | null, fallback = 'Request failed'): ActionResult {
  const message = error?.message?.trim();
  return { ok: false, error: message && message.length > 0 ? message : fallback };
}
