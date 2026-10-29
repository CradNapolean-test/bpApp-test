import { useState } from 'react';
import { View } from 'react-native';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { parseCustomTargets, TARGETS_LOCKED_MESSAGE } from '@ballistic/shared/utils/customTargets';

import { AppText, Button, SheetFrame, SmallButton, TextField } from '@/components/ui';
import { useSaveCustomTargets } from '@/lib/customTargets';
import { spacing } from '@/theme';

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

// Under the targets card: set your own daily calories and macros instead of the calculated ones (for someone who tracks elsewhere, say),
// unless the coach has locked it. Only the member's own app has this; the coach sets or locks them from the web.
export function MyTargetsRow({ profile }: { profile: ClientProfileRow | null }) {
  const [open, setOpen] = useState(false);
  if (!profile) return null;
  const has = profile.custom_calories != null;
  const locked = !!profile.custom_targets_locked;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <AppText variant="small" color="muted">{locked ? TARGETS_LOCKED_MESSAGE : has ? 'Using the daily targets you set.' : 'Track somewhere else, or want different numbers?'}</AppText>
      </View>
      {locked ? null : <SmallButton title={has ? 'Change my targets' : 'Set my own targets'} tone="muted" onPress={() => setOpen(true)} />}
      {open ? <MyTargetsSheet profile={profile} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

function MyTargetsSheet({ profile, onClose }: { profile: ClientProfileRow; onClose: () => void }) {
  const save = useSaveCustomTargets();
  const [calories, setCalories] = useState(text(profile.custom_calories));
  const [protein, setProtein] = useState(text(profile.custom_protein));
  const [carbs, setCarbs] = useState(text(profile.custom_carbs));
  const [fat, setFat] = useState(text(profile.custom_fat));
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    const parsed = parseCustomTargets({ calories, protein, carbs, fat });
    if (!parsed.ok) {
      setProblem(parsed.error);
      return;
    }
    setProblem(null);
    save.mutate(parsed.value, { onSuccess: onClose });
  }

  return (
    <SheetFrame title="My daily targets" onClose={onClose}>
      <AppText color="muted">Set your own daily calories and macros. They replace the calculated targets until you switch back.</AppText>
      <TextField label="Calories (optional, worked out from the macros if empty)" value={calories} onChangeText={setCalories} keyboardType="decimal-pad" />
      <TextField label="Protein (g)" value={protein} onChangeText={setProtein} keyboardType="decimal-pad" />
      <TextField label="Carbs (g)" value={carbs} onChangeText={setCarbs} keyboardType="decimal-pad" />
      <TextField label="Fat (g)" value={fat} onChangeText={setFat} keyboardType="decimal-pad" />
      {problem ? <AppText variant="small" color="danger">{problem}</AppText> : null}
      {save.isError ? <AppText variant="small" color="danger">{save.error.message}</AppText> : null}
      <Button title="Save targets" onPress={submit} loading={save.isPending} />
      {profile.custom_calories != null ? (
        <SmallButton title="Use the calculated targets instead" tone="muted" onPress={() => save.mutate(null, { onSuccess: onClose })} disabled={save.isPending} />
      ) : null}
    </SheetFrame>
  );
}
