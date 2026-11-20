import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import {
  BARCODE_FOOD_BRAND_MAX,
  BARCODE_FOOD_NAME_MAX,
  EMPTY_BARCODE_FOOD,
  readBarcodeFood,
  type BarcodeFoodFields,
  type BarcodeFoodText,
} from '@ballistic/shared/utils/barcodeFoods';
import { MAX_UNIT_LABEL } from '@ballistic/shared/utils/foodUnits';

import { AppText, Button, Chip, SheetFrame, TextField } from '@/components/ui';
import type { NewProduct } from '@/lib/barcodeFlow';
import { spacing } from '@/theme';

// "Add this product" (owner's list item 6): a scan found nothing in the food list or on Open Food Facts, so the member adds it from the
// pack. It goes into the shared food list straight away (migration 0173), so the next person who scans it gets it. Same fields and checks
// as the web (packages/shared/src/utils/barcodeFoods.ts); the database checks them again. `onSave` returns a message when it could not.
export function AddProductSheet({ product, onSave, onCancel }: { product: NewProduct; onSave: (fields: BarcodeFoodFields) => Promise<string | null>; onCancel: () => void }) {
  const [text, setText] = useState<BarcodeFoodText>({ ...EMPTY_BARCODE_FOOD, name: product.name });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const set = (key: Exclude<keyof BarcodeFoodText, 'per'>) => (value: string) => {
    setText((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };
  const preview = readBarcodeFood(text);
  const serving = text.serving.trim() || 'serving';

  const submit = async () => {
    const read = readBarcodeFood(text);
    if (!read.ok) return setError(read.error);
    setSaving(true);
    const failure = await onSave(read.fields);
    setSaving(false);
    if (failure) setError(failure);
  };

  return (
    <SheetFrame title="Add this product" onClose={onCancel}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: spacing.sm }}>
        <AppText variant="small" color="muted">
          Barcode {product.barcode} is not in the food list yet. Add it from the pack and it is saved for everyone: the next person who scans it gets it straight away. Coaches check new products and can correct them.
        </AppText>
        <TextField label="Name" value={text.name} onChangeText={set('name')} maxLength={BARCODE_FOOD_NAME_MAX} placeholder="Salted caramel protein bar" />
        <TextField label="Brand (if there is one)" value={text.brand} onChangeText={set('brand')} maxLength={BARCODE_FOOD_BRAND_MAX} placeholder="optional" />
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><TextField label="One serving is 1…" value={text.serving} onChangeText={set('serving')} maxLength={MAX_UNIT_LABEL} placeholder="bar" /></View>
          <View style={{ flex: 1 }}>
            <TextField label={text.per === 'serving' ? 'It weighs (g)' : 'It weighs (g, if known)'} value={text.grams} onChangeText={set('grams')} keyboardType="decimal-pad" placeholder={text.per === 'serving' ? '45' : 'optional'} />
          </View>
        </View>
        <AppText variant="small" color="muted">The figures I am reading are</AppText>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip label="Per 100 g" active={text.per === '100g'} onPress={() => { setText((prev) => ({ ...prev, per: '100g' })); setError(null); }} />
          <Chip label={`Per ${serving}`} active={text.per === 'serving'} onPress={() => { setText((prev) => ({ ...prev, per: 'serving' })); setError(null); }} />
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}><TextField label="Protein g" value={text.protein} onChangeText={set('protein')} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><TextField label="Carbs g" value={text.carbs} onChangeText={set('carbs')} keyboardType="decimal-pad" /></View>
          <View style={{ flex: 1 }}><TextField label="Fat g" value={text.fat} onChangeText={set('fat')} keyboardType="decimal-pad" /></View>
        </View>
        {preview.ok ? (
          <AppText color="muted">
            <AppText style={{ fontWeight: '800' }}>{Math.round(preview.per100.calories)} kcal</AppText> per 100 g
            {preview.perServing ? (
              <>
                {' · '}
                <AppText style={{ fontWeight: '800' }}>{Math.round(preview.perServing.calories)} kcal</AppText> per {preview.perServing.label}
              </>
            ) : null}
            . Check it is close to the pack.
          </AppText>
        ) : null}
        {error ? <AppText color="danger" style={{ fontWeight: '600' }}>{error}</AppText> : null}
        <Button title={saving ? 'Adding…' : 'Add for everyone'} disabled={saving} onPress={submit} />
      </ScrollView>
    </SheetFrame>
  );
}
