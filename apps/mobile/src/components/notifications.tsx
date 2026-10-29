import { View } from 'react-native';

import type { NotificationRow } from '@ballistic/shared/data/types';
import { formatRelativeTime } from '@ballistic/shared/utils/dates';

import { Pressable } from '@/components/press';
import { Icon } from '@/components/icons';
import { AppText } from '@/components/ui';
import { spacing, useTheme } from '@/theme';

export function ago(iso: string): string {
  const rel = formatRelativeTime(iso);
  return rel === 'now' ? 'Just now' : `${rel} ago`;
}

export function NotificationRowView({ n, onClear }: { n: NotificationRow; onClear: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm + 2, paddingVertical: spacing.md - 4, borderTopWidth: 1, borderTopColor: t.border }}>
      <View style={{ marginTop: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: n.read_at ? 'transparent' : t.accent }} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText style={{ fontWeight: '500' }}>{n.message}</AppText>
        <AppText variant="small" color="muted">{ago(n.created_at)}</AppText>
      </View>
      <Pressable onPress={onClear} accessibilityRole="button" accessibilityLabel="Clear notification" hitSlop={10}>
        <Icon name="x" size={18} color={t.muted} />
      </Pressable>
    </View>
  );
}
