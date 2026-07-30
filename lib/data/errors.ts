// Supabase returns PostgrestError -- a plain object, not an Error. Throwing it straight
// from a Server Action means Next.js serialises the whole object into the message, so the
// client saw `{code: "P0001", details: Null, hint: ..., message: ...}` instead of the
// actual reason (e.g. "Not enough credits"). Normalising here keeps every data-layer
// function's `if (error) raise(error)` one line while giving the UI something readable.
export function raise(error: { message?: string; hint?: string | null } | null): never {
  const message = error?.message?.trim();
  throw new Error(message && message.length > 0 ? message : 'Request failed');
}
