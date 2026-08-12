import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { estimateFoodPhoto } from '@/lib/ai/estimateFoodPhoto';
import { syncFoodPhotosToLog } from '@/lib/data/foodPhotos';

// Re-estimate endpoint for an existing food_photo_entries row (e.g. a future "retry" button
// if the initial estimate at upload time failed or came back low-confidence) -- the initial
// upload flow (lib/data/foodPhotos.ts's uploadFoodPhoto) calls estimateFoodPhoto directly
// rather than through this route, since a Server Action calling its own API route over HTTP
// would need to know its own deployment URL. Uses the normal cookie-scoped Supabase client, not
// the admin client -- RLS on food_photo_entries/storage.objects already enforces that only the
// entry's own client (or their coach) can trigger this, no separate authorization check needed.
export async function POST(request: Request) {
  const { entryId } = await request.json();
  if (!entryId) return NextResponse.json({ error: 'Missing entryId' }, { status: 400 });

  const supabase = await createClient();
  const { data: entry, error: entryError } = await supabase
    .from('food_photo_entries')
    .select('id, daily_log_id, storage_path, description')
    .eq('id', entryId)
    .single();
  if (entryError || !entry) return NextResponse.json({ error: 'Photo entry not found' }, { status: 404 });

  const { data: file, error: downloadError } = await supabase.storage.from('food-photos').download(entry.storage_path);
  if (downloadError || !file) return NextResponse.json({ error: 'Could not load photo' }, { status: 500 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const estimate = await estimateFoodPhoto(bytes, file.type || 'image/jpeg', entry.description);
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
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
  await syncFoodPhotosToLog(entry.daily_log_id);

  return NextResponse.json({ estimate });
}
