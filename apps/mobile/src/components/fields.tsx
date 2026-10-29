import { useState } from 'react';
import { Pressable, TextInput, View, type TextInputProps } from 'react-native';

import { Icon } from '@/components/icons';
import { AppText } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

// Small form pieces shared by the onboarding flow, Personal details and the forms.

// A big rounded choice (Female / Male, body fat yes / no, ...).
export function Pill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      aria-pressed={active}
      style={{ borderWidth: 1, borderColor: active ? t.accent : t.border, backgroundColor: active ? t.accent : 'transparent', borderRadius: 999, paddingHorizontal: 18, paddingVertical: 11 }}>
      <AppText style={{ color: active ? t.accentForeground : t.foreground, fontWeight: '700' }}>{label}</AppText>
    </Pressable>
  );
}

// A full-width choice row with a tick when picked (single / multi choice questions, tracking method, activity level).
export function ChoiceRow({ title, hint, selected, onPress, badge }: { title: string; hint?: string; selected: boolean; onPress: () => void; badge?: string }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      aria-pressed={selected}
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: selected ? t.accent : t.border, backgroundColor: selected ? t.accentSoft : t.card, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 13 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <AppText style={{ fontWeight: '700' }}>{title}</AppText>
          {badge ? (
            <View style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
              <AppText style={{ color: t.accentForeground, fontSize: 10, fontWeight: '800' }}>{badge}</AppText>
            </View>
          ) : null}
        </View>
        {hint ? <AppText variant="small" color="muted">{hint}</AppText> : null}
      </View>
      {selected ? <Icon name="check" size={18} color={t.accent} strokeWidth={3} /> : null}
    </Pressable>
  );
}

export function FieldLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
      <AppText variant="small" style={{ fontWeight: '700' }}>{children}</AppText>
      {hint ? <AppText variant="small" color="muted">{hint}</AppText> : null}
    </View>
  );
}

// A text box with the same look as the rest of the app, without a label (use FieldLabel above it).
export function Input({ style, ...props }: TextInputProps) {
  const t = useTheme();
  return (
    <TextInput
      placeholderTextColor={t.muted}
      {...props}
      style={[{ backgroundColor: t.card, color: t.foreground, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 12, fontSize: 16 }, props.multiline ? { minHeight: 96, textAlignVertical: 'top' } : null, style]}
    />
  );
}

const pad = (n: string, len: number) => n.padStart(len, '0');

// "dd mm yyyy" as three boxes: no date-picker package, and it works the same on the phone and in the browser.
// onChange gets the date as yyyy-mm-dd once it is a real calendar date, and '' until then. onInvalidChange says whether
// something has been typed that is NOT a real date (31/02, or a date only half typed), so a form where the date is
// optional can refuse to save instead of quietly dropping it.
export function DateField({ label, value, onChange, onInvalidChange, hint }: { label: string; value: string; onChange: (iso: string) => void; onInvalidChange?: (invalid: boolean) => void; hint?: string }) {
  const t = useTheme();
  const [y0, m0, d0] = value ? value.split('-') : ['', '', ''];
  const [parts, setParts] = useState({ d: d0 ? String(Number(d0)) : '', m: m0 ? String(Number(m0)) : '', y: y0 ?? '' });

  function update(next: { d: string; m: string; y: string }) {
    setParts(next);
    const d = Number(next.d);
    const m = Number(next.m);
    const y = Number(next.y);
    const real = next.d !== '' && next.m !== '' && next.y.length === 4 && new Date(Date.UTC(y, m - 1, d)).getUTCDate() === d && new Date(Date.UTC(y, m - 1, d)).getUTCMonth() === m - 1;
    const anything = next.d !== '' || next.m !== '' || next.y !== '';
    onChange(real ? `${pad(next.y, 4)}-${pad(next.m, 2)}-${pad(next.d, 2)}` : '');
    onInvalidChange?.(anything && !real);
  }

  const filled = parts.d !== '' && parts.m !== '' && parts.y.length === 4;
  const invalid = filled && value === '';
  const box = { backgroundColor: t.card, color: t.foreground, borderWidth: 1, borderColor: invalid ? t.danger : t.border, borderRadius: radius.md, paddingVertical: 12, fontSize: 16, textAlign: 'center' } as const;
  return (
    <View style={{ gap: 6 }}>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <TextInput accessibilityLabel={`${label}, day`} placeholder="DD" placeholderTextColor={t.muted} keyboardType="number-pad" maxLength={2} value={parts.d} onChangeText={(v) => update({ ...parts, d: v.replace(/\D/g, '') })} style={[box, { flex: 1 }]} />
        <TextInput accessibilityLabel={`${label}, month`} placeholder="MM" placeholderTextColor={t.muted} keyboardType="number-pad" maxLength={2} value={parts.m} onChangeText={(v) => update({ ...parts, m: v.replace(/\D/g, '') })} style={[box, { flex: 1 }]} />
        <TextInput accessibilityLabel={`${label}, year`} placeholder="YYYY" placeholderTextColor={t.muted} keyboardType="number-pad" maxLength={4} value={parts.y} onChangeText={(v) => update({ ...parts, y: v.replace(/\D/g, '') })} style={[box, { flex: 1.6 }]} />
      </View>
      {invalid ? <AppText variant="small" color="danger">That is not a real date.</AppText> : null}
    </View>
  );
}
