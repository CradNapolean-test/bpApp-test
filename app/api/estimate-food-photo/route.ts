import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { estimateFoodPhoto } from '@/lib/ai/estimateFoodPhoto';
import { AI_DAILY_LIMIT, MAX_PHOTO_BYTES, aiPhotoEnabled, imageTypeOrDefault, isUuid } from '@/lib/ai/photoRules';
import { DAY, adminRateStore, takeToken } from '@/lib/rateLimit';
import { syncFoodPhotosToLog } from '@/lib/data/foodPhotos';

// Re-estimate endpoint for an existing food_photo_entries row. Nothing in the app calls it today, and every call costs money, so it is
// OFF (a plain 404) unless FEATURE_AI_PHOTO=true (M13). When it is on: a signed-in member, a valid id, at most AI_DAILY_LIMIT calls a day
// each (a broken counter refuses rather than lets the bill run), and a size cap on the picture. Uses the normal cookie-scoped Supabase
// client, not the admin client -- RLS on food_photo_entries/storage.objects already enforces that only the entry's own client (or their
// coach) can read it.
export async function POST(request: Request) {
  if (!aiPhotoEnabled(process.env)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json().catch(() => null);
  const entryId = body?.entryId;
  if (!isUuid(entryId)) return NextResponse.json({ error: 'Missing or invalid entryId' }, { status: 400 });

  const limit = await takeToken(adminRateStore(), `ai-photo:${user.id}`, AI_DAILY_LIMIT, DAY, { onError: 'deny' });
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Daily limit reached. Try again tomorrow.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const { data: entry, error: entryError } = await supabase
    .from('food_photo_entries')
    .select('id, daily_log_id, storage_path, description')
    .eq('id', entryId)
    .single();
  if (entryError || !entry) return NextResponse.json({ error: 'Photo entry not found' }, { status: 404 });

  const { data: file, error: downloadError } = await supabase.storage.from('food-photos').download(entry.storage_path);
  if (downloadError || !file) return NextResponse.json({ error: 'Could not load photo' }, { status: 500 });
  if (file.size > MAX_PHOTO_BYTES) return NextResponse.json({ error: 'That photo is too large to estimate.' }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const estimate = await estimateFoodPhoto(bytes, imageTypeOrDefault(file.type), entry.description);
  if (!estimate) return NextResponse.json({ error: 'Estimate unavailable' }, { status: 502 });

  const { error: updateError } = await supabase
    .from('food_photo_entries')
    .update({
      estimated_calories: estimate.calories,
      estimated_protein: estimate.protein,
      estimated_carbs: estimate.carbs,
      estimated_fat: estimate.fat,
    })
    .eq('id', entryId);
  if (updateError) return NextResponse.json({ error: 'Could not save the estimate' }, { status: 500 });
  await syncFoodPhotosToLog(entry.daily_log_id);

  return NextResponse.json({ estimate });
}
