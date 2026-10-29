import { Image } from 'expo-image';
import { useState } from 'react';
import { TextInput, View } from 'react-native';

import type { FoodPhotoEntryRow, MealSectionRow, NutritionFeedbackRow } from '@ballistic/shared/data/types';
import { canAddPhoto, groupByMealSection, MAX_PHOTO_DESCRIPTION, MAX_PHOTOS_PER_DAY, suggestMealSection, validateMealEntry } from '@ballistic/shared/utils/photoDiary';

import { Pressable } from '@/components/press';
import { CoachFeedbackCard, DateNav } from '@/components/food';
import { NutritionTabs } from '@/components/pagetabs';
import { Icon } from '@/components/icons';
import { PhotoSourceMenu, PhotoViewer } from '@/components/media';
import { AppText, Button, Card, Chip, ConfirmSheet, ScrollScreen, SheetFrame } from '@/components/ui';
import { useMealSections, useNutritionFeedback } from '@/lib/food';
import { PhotoPermissionError, pickPhoto, useSignedUrl, type PickedPhoto } from '@/lib/media';
import { useAddMealPhoto, useDeleteMealPhoto, usePhotoDiary } from '@/lib/photoDiary';
import { radius, spacing, useTheme } from '@/theme';

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

// One meal: the picture (a short-lived link, fetched only because this card is on screen), the note, the time, and what the
// coach said about this meal. Tap the picture to see it full screen.
function MealPicture({ path, note, onOpen }: { path: string; note: string; onOpen: (url: string, caption: string) => void }) {
  const t = useTheme();
  const signed = useSignedUrl('food-photos', path);
  return signed.data ? (
    <Pressable onPress={() => onOpen(signed.data, note)} accessibilityRole="button" accessibilityLabel="View photo">
      <Image source={{ uri: signed.data, cacheKey: path }} style={{ width: '100%', aspectRatio: 4 / 3 }} contentFit="cover" loading="eager" />
    </Pressable>
  ) : (
    <View style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: t.cardMuted }} />
  );
}

function MealPhotoCard({ photo, feedback, onOpen, onDelete }: { photo: FoodPhotoEntryRow; feedback: NutritionFeedbackRow[]; onOpen: (url: string, caption: string) => void; onDelete: () => void }) {
  const t = useTheme();
  const note = photo.description || 'Meal photo';
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {/* A meal logged with a description alone has no picture, so no empty picture box either. */}
      {photo.storage_path ? <MealPicture path={photo.storage_path} note={note} onOpen={onOpen} /> : null}
      <View style={{ padding: spacing.md, gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <AppText style={{ fontWeight: '700' }}>{note}</AppText>
            <AppText variant="small" color="muted">{timeOf(photo.created_at)}</AppText>
          </View>
          <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={photo.storage_path ? 'Delete photo' : 'Delete meal'} hitSlop={10} style={{ padding: 6 }}>
            <Icon name="trash2" size={18} color={t.muted} />
          </Pressable>
        </View>
        {feedback.map((f) => (
          <View key={f.id} style={{ borderLeftWidth: 3, borderLeftColor: t.accent, paddingLeft: spacing.sm, gap: 2 }}>
            <AppText variant="small" color="muted">Your coach</AppText>
            <AppText>{f.body}</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

// The chosen picture (if any) and a short note, before it is added to the diary. A meal can be added with the note alone.
function AddPhotoSheet({ photo, sections, busy, error, onChangePhoto, onSave, onClose }: { photo: PickedPhoto | null; sections: MealSectionRow[]; busy: boolean; error: string | null; onChangePhoto: () => void; onSave: (description: string, mealSectionId: string | null) => void; onClose: () => void }) {
  const t = useTheme();
  const [description, setDescription] = useState('');
  // Starts on the meal for the time of day; tap it again to clear it.
  const [mealSectionId, setMealSectionId] = useState<string | null>(() => suggestMealSection(sections, new Date().getHours()));
  const missing = validateMealEntry(!!photo, description);
  return (
    <SheetFrame title={photo ? 'Add a meal photo' : 'Add a meal'} onClose={onClose}>
      {photo ? <Image source={{ uri: photo.uri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: radius.md }} contentFit="cover" /> : null}
      <Pressable onPress={onChangePhoto} accessibilityRole="button"><AppText variant="small" color="accent" style={{ fontWeight: '700' }}>{photo ? 'Choose a different photo' : 'Add a photo (optional)'}</AppText></Pressable>
      {sections.length > 0 ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {sections.map((s) => <Chip key={s.id} label={s.label} active={mealSectionId === s.id} onPress={() => setMealSectionId((cur) => (cur === s.id ? null : s.id))} />)}
        </View>
      ) : null}
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder={photo ? 'What is it? e.g. Chicken salad, small portion' : 'Describe the meal, e.g. Chicken salad, small portion'}
        placeholderTextColor={t.muted}
        multiline
        maxLength={MAX_PHOTO_DESCRIPTION}
        style={{ backgroundColor: t.card, color: t.foreground, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 64, textAlignVertical: 'top', fontSize: 16 }}
      />
      {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
      <Button title="Add to my diary" onPress={() => onSave(description, mealSectionId)} loading={busy} disabled={!!missing} />
    </SheetFrame>
  );
}

// The Food screen for a member whose coach chose the photo diary: a visual diary with no numbers, for the coach to look through
// and comment on.
export function PhotoDiaryScreen({ today }: { today: string }) {
  const t = useTheme();
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked ?? today;
  const diaryQ = usePhotoDiary(date);
  const feedbackQ = useNutritionFeedback(date);
  const add = useAddMealPhoto(date);
  const del = useDeleteMealPhoto(date);
  const sections = useMealSections().data ?? [];

  const [menu, setMenu] = useState(false);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [composing, setComposing] = useState(false); // the add sheet is open (with a photo, or with a note alone)
  const [viewing, setViewing] = useState<{ url: string; caption: string } | null>(null);
  const [deleting, setDeleting] = useState<FoodPhotoEntryRow | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);

  const photos = diaryQ.data?.photos ?? [];
  const feedback = feedbackQ.data ?? [];
  const full = !canAddPhoto(photos.length);

  async function choose(source: 'camera' | 'library') {
    setMenu(false);
    setPickError(null);
    try {
      const next = await pickPhoto(source);
      if (next) {
        add.reset();
        setPhoto(next);
        setComposing(true);
      }
    } catch (e) {
      setPickError(e instanceof PhotoPermissionError ? e.message : 'Could not open the photo.');
    }
  }

  return (
    <>
      <ScrollScreen refreshing={diaryQ.isRefetching} onRefresh={() => diaryQ.refetch()}>
        <NutritionTabs current="food" />
        <DateNav date={date} today={today} onChange={(d) => setPicked(d === today ? null : d)} />
        <Pressable
          onPress={() => setMenu(true)}
          disabled={full}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, backgroundColor: t.accent, borderRadius: radius.lg, paddingVertical: 14, opacity: full ? 0.5 : 1 }}>
          <Icon name="camera" size={20} color={t.accentForeground} />
          <AppText style={{ color: t.accentForeground, fontWeight: '800' }}>Add a meal photo</AppText>
        </Pressable>
        <Pressable
          onPress={() => {
            add.reset();
            setPhoto(null);
            setComposing(true);
          }}
          disabled={full}
          accessibilityRole="button"
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, paddingVertical: 12, opacity: full ? 0.5 : 1 }}>
          <AppText style={{ fontWeight: '700' }}>Add without a photo</AppText>
        </Pressable>
        {full ? <AppText variant="small" color="muted">A day can hold {MAX_PHOTOS_PER_DAY} photos.</AppText> : null}
        {pickError ? <AppText variant="small" color="danger">{pickError}</AppText> : null}
        <CoachFeedbackCard items={feedback.filter((f) => !f.photo_id)} />
        {diaryQ.isError ? <AppText color="danger">Could not load this day: {diaryQ.error.message}</AppText> : null}
        {diaryQ.isSuccess && photos.length === 0 ? (
          <Card style={{ gap: spacing.xs }}>
            <AppText variant="heading">{date === today ? 'No meals logged yet' : 'No meals logged this day'}</AppText>
            <AppText color="muted">Photograph each meal and add a short note, or just describe it if you have no photo. Your coach looks through your diary.</AppText>
          </Card>
        ) : null}
        {del.isError ? <AppText color="danger">{del.error.message}</AppText> : null}
        {groupByMealSection(photos, sections).map((group, _i, all) => (
          <View key={group.section?.id ?? 'none'} style={{ gap: spacing.md }}>
            {all.length > 1 || group.section ? <AppText variant="small" color="muted" style={{ fontWeight: '700', textTransform: 'uppercase' }}>{group.section?.label ?? 'Other'}</AppText> : null}
            {group.entries.map((p) => (
              <MealPhotoCard key={p.id} photo={p} feedback={feedback.filter((f) => f.photo_id === p.id)} onOpen={(url, caption) => setViewing({ url, caption })} onDelete={() => setDeleting(p)} />
            ))}
          </View>
        ))}
      </ScrollScreen>

      {menu ? <PhotoSourceMenu onPick={choose} onClose={() => setMenu(false)} /> : null}
      {composing ? (
        <AddPhotoSheet
          photo={photo}
          sections={sections}
          busy={add.isPending}
          error={add.isError ? add.error.message : null}
          onChangePhoto={() => {
            setPhoto(null); // one sheet at a time (a second modal over the first does not open on iPhone)
            setComposing(false);
            setMenu(true);
          }}
          onSave={(description, mealSectionId) => add.mutate({ photo, description, currentCount: photos.length, mealSectionId }, { onSuccess: () => { setPhoto(null); setComposing(false); } })}
          onClose={() => { setPhoto(null); setComposing(false); }}
        />
      ) : null}
      <PhotoViewer src={viewing?.url ?? null} caption={viewing?.caption} onClose={() => setViewing(null)} />
      {deleting ? (
        <ConfirmSheet
          title="Delete this photo?"
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            del.mutate(deleting);
            setDeleting(null);
          }}
        />
      ) : null}
    </>
  );
}
