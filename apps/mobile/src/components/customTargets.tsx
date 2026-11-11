import { useState } from 'react';
import { View } from 'react-native';

import type { DayTarget } from '@ballistic/shared/calculations';
import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { parseCustomTargets, TARGETS_LOCKED_MESSAGE } from '@ballistic/shared/utils/customTargets';

import { AppText, Button, SheetFrame, SmallButton, TextField } from '@/components/ui';
import { useSaveCustomTargets } from '@/lib/customTargets';
import { useAverageFoodTarget } from '@/lib/foodTarget';
import { spacing } from '@/theme';

const text = (n: number | null | undefined) => (n == null ? '' : String(n));
const whole = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n)));

// Under the targets card: set your own daily calories and macros instead of the calculated ones (for someone who tracks elsewhere, say),
// unless the coach has locked it. Only the member's own app has this; the coach sets or locks them from the web.
export function MyTargetsRow({ profile, today }: { profile: ClientProfileRow | null; today: string }) {
  const [open, setOpen] = useState(false);
  const current = useAverageFoodTarget(profile, today);
  if (!profile) return null;
  const has = profile.custom_calories != null;
  const locked = !!profile.custom_targets_locked;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
      <View style={{ flex: 1 }}>
        <AppText variant="small" color="muted">{locked ? TARGETS_LOCKED_MESSAGE : has ? 'Using the daily targets you set.' : 'Track somewhere else, or want different numbers?'}</AppText>
      </View>
      {locked ? null : <SmallButton title={has ? 'Change my targets' : 'Set my own targets'} tone="muted" onPress={() => setOpen(true)} />}
      {open ? <MyTargetsSheet profile={profile} current={current} onClose={() => setOpen(false)} /> : null}
    </View>
  );
}

// `current` is the member's targets now (an average day when calorie cycling): the boxes start from it when they have not set their
// own (NU10, as the web), so they change a number or two instead of typing all four.
function MyTargetsSheet({ profile, current, onClose }: { profile: ClientProfileRow; current: DayTarget | null; onClose: () => void }) {
  const save = useSaveCustomTargets();
  const start = profile.custom_calories == null ? current : null;
  const [calories, setCalories] = useState(start ? whole(start.calories) : text(profile.custom_calories));
  const [protein, setProtein] = useState(start ? whole(start.protein) : text(profile.custom_protein));
  const [carbs, setCarbs] = useState(start ? whole(start.carbs) : text(profile.custom_carbs));
  const [fat, setFat] = useState(start ? whole(start.fat) : text(profile.custom_fat));
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
      <AppText color="muted">
        Set your own daily calories and macros. They replace the calculated targets until you switch back.
        {start ? ' These are your targets now: change the ones you want.' : ''}
        {start && profile.cycling ? ' Your own targets are the same every day, with no high days.' : ''}
      </AppText>
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
