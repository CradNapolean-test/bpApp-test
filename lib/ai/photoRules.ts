// Rules for the AI food-photo estimate route (M13). The route is off unless FEATURE_AI_PHOTO=true: nothing in the app calls it today and
// every call costs money. When it is on, these keep it from being a free, unlimited paid endpoint for any signed-in member.

export const AI_DAILY_LIMIT = 10;
export const MAX_PHOTO_BYTES = 4 * 1024 * 1024;
export const MAX_DESCRIPTION_LENGTH = 300;

// The current model, configurable. The old hard-coded id ("claude-sonnet-5") was never confirmed to exist.
export const DEFAULT_AI_MODEL = 'claude-sonnet-5-5';

export function aiModel(env: Record<string, string | undefined>): string {
  return env.ANTHROPIC_MODEL?.trim() || DEFAULT_AI_MODEL;
}

export function aiPhotoEnabled(env: Record<string, string | undefined>): boolean {
  return (env.FEATURE_AI_PHOTO ?? '').trim().toLowerCase() === 'true';
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID.test(value);

// A member's own description goes into the prompt as a hint. It is untrusted text: control characters, line breaks and quotes are removed so
// it cannot close the quoted hint and start giving instructions, and it is cut short.
export function cleanDescription(text: string | null | undefined): string | null {
  const cleaned = (text ?? '')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/["`\\]+/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_DESCRIPTION_LENGTH);
  return cleaned || null;
}

export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const imageTypeOrDefault = (type: string | null | undefined): string => (type && ALLOWED_IMAGE_TYPES.includes(type) ? type : 'image/jpeg');
