import { fail, type ActionResult } from './result';

// A database function the app calls that the database does not have yet: the migration that adds it has not been applied (PostgREST
// says PGRST202, Postgres 42883). Not a 'use server' module: nothing here is called from the browser.
const FUNCTION_MISSING = new Set(['PGRST202', '42883']);

export function isMissingFunction(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && FUNCTION_MISSING.has(error.code);
}

export function needsMigrationMessage(migration: string): string {
  return `This needs a database update (migration ${migration}) that hasn't been applied yet. Nothing was changed.`;
}

// The result to hand back for an RPC's error: the plain words when the function is missing, else its own message (or the fallback).
export function rpcFailure(error: { code?: string | null; message?: string } | null, migration: string, fallback: string): ActionResult {
  if (isMissingFunction(error)) return { ok: false, error: needsMigrationMessage(migration) };
  return fail(error, fallback);
}
