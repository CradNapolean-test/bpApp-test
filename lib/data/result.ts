// Next.js redacts any error *thrown* out of a Server Action in production, replacing the
// message with "An error occurred in the Server Components render...". That's right for
// unexpected faults, but wrong for domain errors the user must actually read ("Not enough
// credits", "Form already submitted"). Returned values aren't redacted, so the RPC-backed
// mutations hand these back instead of throwing. useAction() understands the shape.
import { friendlyMessage } from './errors';

export type ActionResult = { ok: true } | { ok: false; error: string };

export function ok(): ActionResult {
  return { ok: true };
}

export function fail(error: { message?: string } | null, fallback = 'Request failed'): ActionResult {
  const message = error?.message?.trim();
  return { ok: false, error: message && message.length > 0 ? friendlyMessage(message) : fallback };
}

// For a batch of writes that each come back as a result (several records created at once): the first refusal, if any.
// A client component can hand the batch to useAction().run(), which only looks at one result.
export function firstFailure(results: unknown[]): ActionResult | null {
  for (const r of results) {
    if (r && typeof r === 'object' && (r as { ok?: unknown }).ok === false) return r as ActionResult;
  }
  return null;
}
