import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, FlatList, Linking, RefreshControl, ScrollView, View } from 'react-native';

import type { BodyScanRow, ProgressPhotoRow } from '@ballistic/shared/data/types';
import { addDays, toIsoDate } from '@ballistic/shared/utils/dates';
import {
  SCAN_CHART_METRICS,
  comparePhotos,
  isPdfPath,
  longDate,
  measurementChangeText,
  measurementRows,
  parseMeasurements,
  parseScanNumber,
  scanSeries,
  scanStatRows,
  scanSummary,
  MEASUREMENT_FIELDS,
  type BodyScanInput,
  type MeasurementKey,
} from '@ballistic/shared/utils/progress';

import { Pressable } from '@/components/press';
import { TrendChart } from '@/components/charts';
import { PhotoSourceMenu, PhotoViewer } from '@/components/media';
import { AppText, Button, Card, Chip, ConfirmSheet, SheetFrame, SmallButton, TextField } from '@/components/ui';
import { PhotoPermissionError, pickPhoto, signedUrlFor, useSignedUrl, type PickedPhoto } from '@/lib/media';
import {
  useAddBodyScan,
  useBodyScans,
  useDeletePhoto,
  useDeleteScan,
  useMeasurements,
  usePhotos,
  useSaveMeasurements,
  useUploadPhoto,
} from '@/lib/progress';
import { radius, spacing, useTheme } from '@/theme';

// A scrolling section with pull-to-refresh, in the same phone-width column as the rest of the app.
function SectionScroll({ children, refreshing, onRefresh }: { children: React.ReactNode; refreshing: boolean; onRefresh: () => void }) {
  const t = useTheme();
  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={t.accent} />}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

function Failed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <View style={{ gap: spacing.md }}>
      <AppText color="danger">{message}</AppText>
      <Button title="Try again" onPress={onRetry} />
    </View>
  );
}

// ================= photos =================

function PhotoTile({ photo, onOpen, onDelete }: { photo: ProgressPhotoRow; onOpen: (src: string) => void; onDelete: () => void }) {
  const t = useTheme();
  const signed = useSignedUrl('progress-photos', photo.storage_path);
  return (
    <View style={{ flex: 1, gap: 4 }}>
      {signed.data ? (
        <Pressable onPress={() => onOpen(signed.data)} accessibilityRole="imagebutton" accessibilityLabel={`Open the photo from ${longDate(photo.photo_date)}`}>
          {/* cacheKey is the file path, not the link: the link changes every few minutes, the picture does not. */}
          <Image source={{ uri: signed.data, cacheKey: photo.storage_path }} style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md }} contentFit="cover" transition={150} loading="eager" />
        </Pressable>
      ) : (
        <View style={{ width: '100%', aspectRatio: 1, borderRadius: radius.md, backgroundColor: t.cardMuted, alignItems: 'center', justifyContent: 'center' }}>
          {signed.isError ? <AppText variant="small" color="muted">Unavailable</AppText> : <ActivityIndicator color={t.accent} />}
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="small" color="muted">{longDate(photo.photo_date)}</AppText>
        <Pressable onPress={onDelete} accessibilityRole="button" accessibilityLabel={`Delete the photo from ${longDate(photo.photo_date)}`} hitSlop={8}>
          <AppText variant="small" color="danger" style={{ fontWeight: '700' }}>Delete</AppText>
        </Pressable>
      </View>
    </View>
  );
}

export function PhotosSection({ todayIso, canSave }: { todayIso: string; canSave: boolean }) {
  const t = useTheme();
  const photosQ = usePhotos();
  const upload = useUploadPhoto(todayIso);
  const del = useDeletePhoto();
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [viewing, setViewing] = useState<{ src: string; caption: string } | null>(null);
  const [deleting, setDeleting] = useState<ProgressPhotoRow | null>(null);
  const [comparing, setComparing] = useState(false);

  const photos = photosQ.data ?? [];
  // An odd photo out would stretch across the row, so a blank tile keeps it the same size as the others.
  const cells: (ProgressPhotoRow | null)[] = photos.length % 2 ? [...photos, null] : photos;

  const pick = async (source: 'camera' | 'library') => {
    setMenu(false);
    setNote(null);
    try {
      const picked: PickedPhoto | null = await pickPhoto(source);
      if (picked) upload.mutate(picked, { onError: () => setNote('Could not upload that photo. Please try again.') });
    } catch (e) {
      setNote(e instanceof PhotoPermissionError ? e.message : 'Could not use that photo. Please try again.');
    }
  };

  if (photosQ.isPending) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (photosQ.isError) return <Failed message={`Could not load your photos: ${photosQ.error.message}`} onRetry={() => photosQ.refetch()} />;

  const header = (
    <View style={{ gap: spacing.md, paddingBottom: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText variant="heading">Progress photos</AppText>
        {photos.length >= 2 ? <SmallButton title="Compare" onPress={() => setComparing(true)} /> : null}
      </View>
      <Button title={upload.isPending ? 'Uploading…' : 'Add photo'} onPress={() => setMenu(true)} loading={upload.isPending} disabled={!canSave} />
      {note ? <AppText variant="small" color="danger">{note}</AppText> : null}
      {del.isError ? <AppText variant="small" color="danger">Could not delete that photo: {del.error.message}</AppText> : null}
      {photos.length === 0 ? <AppText color="muted">No progress photos yet. Add your first one to start your before and after.</AppText> : null}
    </View>
  );

  return (
    <>
      <FlatList
        data={cells}
        numColumns={2}
        keyExtractor={(p, i) => p?.id ?? `blank-${i}`}
        columnWrapperStyle={{ gap: spacing.md, marginBottom: spacing.md }}
        ListHeaderComponent={header}
        refreshing={photosQ.isRefetching}
        onRefresh={() => photosQ.refetch()}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        renderItem={({ item }) =>
          item ? (
            <PhotoTile photo={item} onOpen={(src) => setViewing({ src, caption: longDate(item.photo_date) })} onDelete={() => setDeleting(item)} />
          ) : (
            <View style={{ flex: 1 }} />
          )
        }
      />
      {menu ? <PhotoSourceMenu onPick={pick} onClose={() => setMenu(false)} /> : null}
      <PhotoViewer src={viewing?.src ?? null} caption={viewing?.caption} onClose={() => setViewing(null)} />
      {deleting ? (
        <ConfirmSheet
          title={`Delete the photo from ${longDate(deleting.photo_date)}?`}
          body="This cannot be undone."
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            del.mutate(deleting);
            setDeleting(null);
          }}
        />
      ) : null}
      {comparing ? <CompareSheet photos={photos} onClose={() => setComparing(false)} /> : null}
    </>
  );
}

function ComparePane({ label, photo, onChange }: { label: string; photo: ProgressPhotoRow; onChange: () => void }) {
  const t = useTheme();
  const signed = useSignedUrl('progress-photos', photo.storage_path);
  return (
    <View style={{ flex: 1, gap: spacing.sm }}>
      <AppText variant="small" color="muted" style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</AppText>
      {signed.data ? (
        <Image source={{ uri: signed.data, cacheKey: photo.storage_path }} style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md }} contentFit="cover" loading="eager" />
      ) : (
        <View style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: radius.md, backgroundColor: t.cardMuted, alignItems: 'center', justifyContent: 'center' }}>
          {signed.isError ? <AppText variant="small" color="muted">Unavailable</AppText> : <ActivityIndicator color={t.accent} />}
        </View>
      )}
      <Chip label={longDate(photo.photo_date)} onPress={onChange} />
    </View>
  );
}

// Before and after side by side. "Choose" swaps the sheet for a list of dates (one modal at a time works on every phone).
function CompareSheet({ photos, onClose }: { photos: ProgressPhotoRow[]; onClose: () => void }) {
  const [beforeId, setBeforeId] = useState<string | null>(null);
  const [afterId, setAfterId] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<'before' | 'after' | null>(null);
  const cmp = comparePhotos(photos, beforeId, afterId);
  if (!cmp) return null;

  if (choosing) {
    const current = choosing === 'before' ? cmp.before.id : cmp.after.id;
    return (
      <SheetFrame title={choosing === 'before' ? 'Choose the before photo' : 'Choose the after photo'} onClose={() => setChoosing(null)}>
        <ScrollView contentContainerStyle={{ gap: spacing.sm }}>
          {photos.map((p) => (
            <Chip
              key={p.id}
              label={longDate(p.photo_date)}
              active={p.id === current}
              onPress={() => {
                if (choosing === 'before') setBeforeId(p.id);
                else setAfterId(p.id);
                setChoosing(null);
              }}
            />
          ))}
        </ScrollView>
      </SheetFrame>
    );
  }

  return (
    <SheetFrame title="Before & after" onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        <ComparePane label="Before" photo={cmp.before} onChange={() => setChoosing('before')} />
        <ComparePane label="After" photo={cmp.after} onChange={() => setChoosing('after')} />
      </View>
      <AppText color="muted" style={{ textAlign: 'center', fontWeight: '600' }}>{cmp.caption}</AppText>
    </SheetFrame>
  );
}

// ================= measurements =================

export function MeasurementsSection({ todayIso, canSave }: { todayIso: string; canSave: boolean }) {
  const t = useTheme();
  const q = useMeasurements();
  const save = useSaveMeasurements(todayIso);
  const [vals, setVals] = useState<Partial<Record<MeasurementKey, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (q.isPending) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (q.isError) return <Failed message={`Could not load your measurements: ${q.error.message}`} onRetry={() => q.refetch()} />;

  const logs = q.data;
  const rows = measurementRows(logs);

  const submit = () => {
    const parsed = parseMeasurements(vals);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    save.mutate(parsed.fields, {
      onSuccess: () => {
        setVals({});
        setSaved(true);
      },
      onError: () => setError('Could not save your measurements. Please try again.'),
    });
  };

  return (
    <SectionScroll refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Measurements</AppText>
        {logs.length === 0 ? (
          <AppText color="muted">No measurements logged yet.</AppText>
        ) : (
          <>
            <AppText variant="small" color="muted">Last logged {longDate(logs[0].log_date)}</AppText>
            <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
              <View style={{ flex: 1 }} />
              {['Start', 'Last', 'Now'].map((h) => (
                <AppText key={h} variant="small" color="muted" style={{ width: 56, textAlign: 'right', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{h}</AppText>
              ))}
            </View>
            {rows.map((r) => {
              const change = measurementChangeText(r);
              return (
                <View key={r.key} style={{ borderTopWidth: 1, borderTopColor: t.border, paddingVertical: spacing.sm, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <AppText style={{ flex: 1, fontWeight: '600' }}>{r.label}</AppText>
                    <AppText color="muted" style={{ width: 56, textAlign: 'right' }}>{r.start ?? '—'}</AppText>
                    <AppText color="muted" style={{ width: 56, textAlign: 'right' }}>{r.last ?? '—'}</AppText>
                    <AppText style={{ width: 56, textAlign: 'right', fontWeight: '800' }}>{r.latest ?? '—'}</AppText>
                  </View>
                  {change ? (
                    <AppText variant="small" color={r.towardsGoal == null ? 'muted' : r.towardsGoal ? 'success' : 'danger'} style={{ fontWeight: '500' }}>{change}</AppText>
                  ) : null}
                </View>
              );
            })}
            <AppText variant="small" color="muted">All in cm.</AppText>
          </>
        )}
      </Card>

      <Card style={{ gap: spacing.md }}>
        <AppText variant="heading">Log new measurements</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {MEASUREMENT_FIELDS.map(({ key, label }) => (
            <View key={key} style={{ width: '47%' }}>
              <TextField
                label={`${label} (cm)`}
                value={vals[key] ?? ''}
                onChangeText={(v) => {
                  setSaved(false);
                  setError(null);
                  setVals((p) => ({ ...p, [key]: v }));
                }}
                keyboardType="decimal-pad"
              />
            </View>
          ))}
        </View>
        {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
        <Button title={save.isPending ? 'Saving…' : saved ? 'Saved ✓' : 'Save measurements'} onPress={submit} loading={save.isPending} disabled={!canSave} />
      </Card>
    </SectionScroll>
  );
}

// ================= body scans =================

function Printout({ scan, onOpen }: { scan: BodyScanRow; onOpen: (src: string) => void }) {
  const t = useTheme();
  const [failed, setFailed] = useState(false);
  const pdf = isPdfPath(scan.printout_path);
  const signed = useSignedUrl('inbody-scans', scan.printout_path, !pdf);
  if (!scan.printout_path) return null;
  if (pdf) {
    // A PDF opens in the phone's own viewer.
    return (
      <Pressable
        onPress={async () => {
          setFailed(false);
          try {
            await Linking.openURL(await signedUrlFor('inbody-scans', scan.printout_path!));
          } catch {
            setFailed(true);
          }
        }}
        accessibilityRole="link"
        accessibilityLabel="Open the printout"
        style={{ backgroundColor: t.cardMuted, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 }}>
        <AppText variant="small" color={failed ? 'danger' : undefined} style={{ fontWeight: '700' }}>{failed ? 'Could not open, tap to retry ' : 'PDF '}↗</AppText>
      </Pressable>
    );
  }
  return signed.data ? (
    <Pressable onPress={() => onOpen(signed.data)} accessibilityRole="imagebutton" accessibilityLabel="View the printout">
      <Image source={{ uri: signed.data, cacheKey: scan.printout_path }} style={{ width: 40, height: 40, borderRadius: 8 }} contentFit="cover" loading="eager" />
    </Pressable>
  ) : (
    <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: t.cardMuted }} />
  );
}

export function ScansSection({ todayIso, canSave }: { todayIso: string; canSave: boolean }) {
  const t = useTheme();
  const q = useBodyScans();
  const del = useDeleteScan();
  const [adding, setAdding] = useState(false);
  const [metric, setMetric] = useState<'weight_kg' | 'skeletal_muscle_kg' | 'body_fat_pct'>('body_fat_pct');
  const [viewing, setViewing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<BodyScanRow | null>(null);

  if (q.isPending) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (q.isError) return <Failed message={`Could not load your scans: ${q.error.message}`} onRetry={() => q.refetch()} />;

  const scans = q.data;
  const latest = scans[0] ?? null;
  const meta = SCAN_CHART_METRICS.find((m) => m.key === metric)!;
  const series = scanSeries(scans, metric);
  const stats = scanStatRows(latest, scans[1] ?? null);
  const chartColor = metric === 'skeletal_muscle_kg' ? '#2ecc71' : metric === 'body_fat_pct' ? '#e8a020' : t.accent;

  return (
    <SectionScroll refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
        <AppText color="muted" style={{ flex: 1 }}>{latest ? `Last scan ${longDate(latest.scan_date)}` : 'InBody body composition scans'}</AppText>
        <SmallButton title="Add scan" onPress={() => setAdding(true)} disabled={!canSave} />
      </View>
      {del.isError ? <AppText variant="small" color="danger">Could not delete that scan: {del.error.message}</AppText> : null}

      {scans.length === 0 ? (
        <Card style={{ gap: 4 }}>
          <AppText variant="heading">No scans yet</AppText>
          <AppText color="muted">Add your InBody results from the printout and track muscle and body fat over time.</AppText>
        </Card>
      ) : (
        <>
          <Card style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {SCAN_CHART_METRICS.map((m) => (
                <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} />
              ))}
            </View>
            <AppText variant="title">{latest?.[metric] != null ? `${Number(latest[metric]).toFixed(1)}${meta.unit}` : '—'}</AppText>
            <TrendChart values={series.values} labels={series.labels} color={chartColor} formatter={(v) => v.toFixed(1)} emptyText="Add a second scan to see your trend" />
          </Card>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            {stats.map((s) => (
              <Card key={s.key} style={{ width: '48.5%', padding: spacing.md - 2, gap: 2 }}>
                <AppText variant="small" color="muted" style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{s.label}</AppText>
                <AppText style={{ fontSize: 22, fontWeight: '800' }}>
                  {s.value}
                  {s.unit ? <AppText variant="small" color="muted" style={{ fontWeight: '700' }}> {s.unit}</AppText> : null}
                </AppText>
                {s.delta ? (
                  <AppText variant="small" color={s.favourable == null ? 'muted' : s.favourable ? 'success' : 'danger'} style={{ fontWeight: '600' }}>{s.delta} since last scan</AppText>
                ) : null}
              </Card>
            ))}
          </View>

          <Card style={{ gap: 0, padding: 0 }}>
            <AppText style={{ fontWeight: '700', padding: spacing.md, paddingBottom: spacing.sm }}>Scan history</AppText>
            {scans.map((s) => (
              <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: t.border }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText style={{ fontWeight: '700' }}>{longDate(s.scan_date)}</AppText>
                  <AppText variant="small" color="muted">{scanSummary(s)}</AppText>
                  {s.notes ? <AppText variant="small" color="muted">{s.notes}</AppText> : null}
                </View>
                <Printout scan={s} onOpen={setViewing} />
                <Pressable onPress={() => setDeleting(s)} accessibilityRole="button" accessibilityLabel={`Delete the scan from ${longDate(s.scan_date)}`} hitSlop={8}>
                  <AppText variant="small" color="danger" style={{ fontWeight: '700' }}>Delete</AppText>
                </Pressable>
              </View>
            ))}
          </Card>
        </>
      )}

      {adding ? <AddScanSheet todayIso={todayIso} onClose={() => setAdding(false)} /> : null}
      <PhotoViewer src={viewing} caption="InBody printout" onClose={() => setViewing(null)} />
      {deleting ? (
        <ConfirmSheet
          title={`Delete the scan from ${longDate(deleting.scan_date)}?`}
          body="This cannot be undone."
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            del.mutate(deleting);
            setDeleting(null);
          }}
        />
      ) : null}
    </SectionScroll>
  );
}

const EMPTY_SCAN = { weight: '', muscle: '', fatPct: '', fatKg: '', visceral: '', bmr: '', score: '', notes: '' };

function AddScanSheet({ todayIso, onClose }: { todayIso: string; onClose: () => void }) {
  const add = useAddBodyScan(todayIso);
  const [date, setDate] = useState(todayIso);
  const [f, setF] = useState(EMPTY_SCAN);
  const [printout, setPrintout] = useState<PickedPhoto | null>(null);
  const [menu, setMenu] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = (key: keyof typeof EMPTY_SCAN, label: string, placeholder: string, kind: 'decimal-pad' | 'number-pad' = 'decimal-pad') => (
    <View style={{ width: '47%' }}>
      <TextField label={label} placeholder={placeholder} value={f[key]} onChangeText={(v) => setF((p) => ({ ...p, [key]: v }))} keyboardType={kind} />
    </View>
  );

  const pick = async (source: 'camera' | 'library') => {
    setMenu(false);
    try {
      const p = await pickPhoto(source);
      if (p) setPrintout(p);
    } catch (e) {
      setError(e instanceof PhotoPermissionError ? e.message : 'Could not use that photo. Please try again.');
    }
  };

  const save = () => {
    setError(null);
    const input: BodyScanInput = {
      scanDate: date.trim(),
      weightKg: parseScanNumber(f.weight),
      skeletalMuscleKg: parseScanNumber(f.muscle),
      bodyFatPct: parseScanNumber(f.fatPct),
      bodyFatKg: parseScanNumber(f.fatKg),
      visceralFatLevel: parseScanNumber(f.visceral),
      bmrKcal: parseScanNumber(f.bmr),
      inbodyScore: parseScanNumber(f.score),
      notes: f.notes,
    };
    add.mutate({ input, printout }, { onSuccess: onClose, onError: (e) => setError(e instanceof Error ? e.message : 'Could not save the scan') });
  };

  const yesterday = toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -1));

  return (
    <SheetFrame title="Add InBody scan" onClose={onClose}>
      <ScrollView contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <View style={{ gap: spacing.sm }}>
          <TextField label="Scan date (YYYY-MM-DD)" value={date} onChangeText={setDate} autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Chip label="Today" active={date === todayIso} onPress={() => setDate(todayIso)} />
            <Chip label="Yesterday" active={date === yesterday} onPress={() => setDate(yesterday)} />
          </View>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md }}>
          {field('weight', 'Weight (kg)', 'e.g. 82.4')}
          {field('muscle', 'Skeletal muscle (kg)', 'e.g. 34.1')}
          {field('fatPct', 'Body fat %', 'e.g. 24.5')}
          {field('fatKg', 'Body fat mass (kg)', 'e.g. 20.2')}
          {field('visceral', 'Visceral fat level', 'e.g. 8', 'number-pad')}
          {field('bmr', 'BMR (kcal)', 'e.g. 1780', 'number-pad')}
          {field('score', 'InBody score', 'e.g. 74', 'number-pad')}
        </View>

        <View style={{ gap: spacing.sm }}>
          <AppText variant="small" color="muted">Printout (a photo, optional)</AppText>
          {printout ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <Image source={{ uri: printout.uri }} style={{ width: 64, height: 64, borderRadius: 10 }} contentFit="cover" loading="eager" />
              <SmallButton title="Remove" tone="muted" onPress={() => setPrintout(null)} />
            </View>
          ) : (
            <View style={{ flexDirection: 'row' }}>
              <SmallButton title="Add a photo of the printout" tone="muted" onPress={() => setMenu(true)} />
            </View>
          )}
          <AppText variant="small" color="muted">PDF printouts can be added on the web for now.</AppText>
        </View>

        <TextField label="Notes (optional)" value={f.notes} onChangeText={(v) => setF((p) => ({ ...p, notes: v }))} placeholder="e.g. Fasted, morning" />
        {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
        <Button title={add.isPending ? (printout ? 'Uploading printout…' : 'Saving…') : 'Save scan'} onPress={save} loading={add.isPending} />
      </ScrollView>
      {menu ? <PhotoSourceMenu onPick={pick} onClose={() => setMenu(false)} /> : null}
    </SheetFrame>
  );
}
