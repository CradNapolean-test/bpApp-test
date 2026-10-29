import { useState } from 'react';
import { View } from 'react-native';

import { isoDateInTz } from '@ballistic/shared/utils/dates';

import { MetricsSection } from '@/components/metrics';
import { OverviewSection } from '@/components/overview';
import { MeasurementsSection, PhotosSection, ScansSection } from '@/components/progress';
import { StrengthSection } from '@/components/strength';
import { AppText, Screen, Segmented } from '@/components/ui';
import { useScreenAccess } from '@/lib/screens';
import { timezoneOf, useClientProfile, useNow } from '@/lib/today';
import { spacing } from '@/theme';

type Tab = 'overview' | 'charts' | 'strength' | 'photos' | 'measurements' | 'scans';

// Opened from the Coach hub ("Progress & results"); the header's back arrow returns there.
export default function Progress() {
  const now = useNow(60_000);
  const profileQ = useClientProfile();
  // Photos, measurements and scans are filed under "today" in the member's own timezone. Showing what is already there
  // does not need it, so the lists load straight away and only the buttons that save something wait for the profile.
  const todayIso = isoDateInTz(now, timezoneOf(profileQ.data ?? null));
  const canSave = !profileQ.isPending;
  const { areas } = useScreenAccess();

  // Only the parts the coach (or the membership tier) leaves on; the first of them opens by default.
  const options: { value: Tab; label: string }[] = [
    ...(areas.overview ? [{ value: 'overview' as const, label: 'Overview' }, { value: 'charts' as const, label: 'Charts' }] : []),
    ...(areas.strength ? [{ value: 'strength' as const, label: 'Strength' }] : []),
    ...(areas.photos ? [{ value: 'photos' as const, label: 'Photos' }, { value: 'measurements' as const, label: 'Measures' }] : []),
    ...(areas.scans ? [{ value: 'scans' as const, label: 'Scans' }] : []),
  ];
  const [picked, setPicked] = useState<Tab | null>(null);
  const tab = options.find((o) => o.value === picked)?.value ?? options[0]?.value;

  return (
    <Screen style={{ gap: spacing.md }}>
      {options.length > 1 ? <Segmented value={tab!} onChange={setPicked} options={options} /> : null}
      <View style={{ flex: 1 }}>
        {tab === 'overview' ? (
          <OverviewSection todayIso={todayIso} />
        ) : tab === 'charts' ? (
          <MetricsSection todayIso={todayIso} />
        ) : tab === 'strength' ? (
          <StrengthSection todayIso={todayIso} tz={timezoneOf(profileQ.data ?? null)} />
        ) : tab === 'photos' ? (
          <PhotosSection todayIso={todayIso} canSave={canSave} />
        ) : tab === 'measurements' ? (
          <MeasurementsSection todayIso={todayIso} canSave={canSave} />
        ) : tab === 'scans' ? (
          <ScansSection todayIso={todayIso} canSave={canSave} />
        ) : (
          <AppText color="muted">Your coach has not turned on any progress screens for you.</AppText>
        )}
      </View>
    </Screen>
  );
}
