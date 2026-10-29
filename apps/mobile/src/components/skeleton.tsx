import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Platform, View, type DimensionValue } from 'react-native';

import { ScrollScreen } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

// A grey block that gently pulses where content is still loading, so a screen shows its shape straight away instead of a lone
// spinner. It holds still if the phone is set to reduce motion, and is hidden from screen readers.
export function Skeleton({ width = '100%', height, round = radius.md }: { width?: DimensionValue; height: number; round?: number }) {
  const t = useTheme();
  const [pulse] = useState(() => new Animated.Value(0.55));
  useEffect(() => {
    let loop: Animated.CompositeAnimation | undefined;
    let cancelled = false;
    AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce || cancelled) return;
      const useNativeDriver = Platform.OS !== 'web';
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver }),
          Animated.timing(pulse, { toValue: 0.55, duration: 800, useNativeDriver }),
        ]),
      );
      loop.start();
    });
    return () => {
      cancelled = true;
      loop?.stop();
    };
  }, [pulse]);
  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ width, height, borderRadius: round, backgroundColor: t.cardMuted, opacity: pulse }}
    />
  );
}

// The shape of Home while it loads: the greeting, the next session, the two tiles, the streak, then the progress cards.
export function HomeSkeleton() {
  return (
    <ScrollScreen>
      <View style={{ gap: spacing.xs }} accessibilityLabel="Loading">
        <Skeleton width={110} height={14} round={7} />
        <Skeleton width={180} height={30} round={8} />
      </View>
      <Skeleton height={120} round={radius.lg} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Skeleton height={78} round={radius.lg} /></View>
        <View style={{ flex: 1 }}><Skeleton height={78} round={radius.lg} /></View>
      </View>
      <Skeleton height={72} round={radius.lg} />
      <Skeleton width={120} height={14} round={7} />
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Skeleton height={90} round={radius.lg} /></View>
        <View style={{ flex: 1 }}><Skeleton height={90} round={radius.lg} /></View>
      </View>
      <Skeleton height={56} round={radius.lg} />
    </ScrollScreen>
  );
}

// A few cards in a column, for the list screens (Book, Workouts).
export function CardsSkeleton({ rows = 4, height = 84 }: { rows?: number; height?: number }) {
  return (
    <ScrollScreen>
      <View style={{ gap: spacing.md }} accessibilityLabel="Loading">
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} height={height} round={radius.lg} />
        ))}
      </View>
    </ScrollScreen>
  );
}
