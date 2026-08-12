// Only ever imported from 'use server' modules (lib/data/foodPhotos.ts) -- already a
// server-only context by Next.js's own convention, no separate guard needed.
// First AI/LLM integration in this codebase -- no existing package or wrapper to follow, so
// this calls the Claude Messages API directly over fetch (same "no client library" approach
// lib/openFoodFacts.ts already uses for a public API, just server-side and with a key) rather
// than adding a new dependency for a single call site. Reads ANTHROPIC_API_KEY the same way
// lib/supabase/admin.ts reads SUPABASE_SERVICE_ROLE_KEY: server-only, never NEXT_PUBLIC_.
const ANTHROPIC_MODEL = 'claude-sonnet-5';

export interface FoodPhotoEstimate {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'low' | 'medium' | 'high';
}

// Returns null (never throws) when the key isn't configured or the call/parse fails --
// callers (lib/data/foodPhotos.ts) treat that as "no estimate, client fills in manually",
// not an upload failure.
export async function estimateFoodPhoto(
  imageBytes: Uint8Array,
  mimeType: string,
  description: string | null
): Promise<FoodPhotoEstimate | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  try {
    const base64 = Buffer.from(imageBytes).toString('base64');
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 300,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              {
                type: 'text',
                text:
                  `Estimate the nutrition of the meal in this photo${description ? ` (client's own description: "${description}")` : ''}. ` +
                  'Respond with ONLY a JSON object, no other text, in exactly this shape: ' +
                  '{"calories": number, "protein": number, "carbs": number, "fat": number, "confidence": "low"|"medium"|"high"}. ' +
                  'Numbers are grams for protein/carbs/fat and kcal for calories. This is a rough estimate for a fitness app, not medical advice.',
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    const text: string | undefined = data?.content?.[0]?.text;
    if (!text) return null;

    const parsed = JSON.parse(text);
    if (
      typeof parsed.calories !== 'number' ||
      typeof parsed.protein !== 'number' ||
      typeof parsed.carbs !== 'number' ||
      typeof parsed.fat !== 'number'
    ) {
      return null;
    }
    return {
      calories: parsed.calories,
      protein: parsed.protein,
      carbs: parsed.carbs,
      fat: parsed.fat,
      confidence: ['low', 'medium', 'high'].includes(parsed.confidence) ? parsed.confidence : 'low',
    };
  } catch {
    return null;
  }
}
