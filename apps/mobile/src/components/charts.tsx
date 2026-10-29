import { useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, Line, Polyline } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { useTheme } from '@/theme';

const HEIGHT = 96;
const AXIS_W = 44;

// A line with an end dot, the high and low on the left and the first and last dates underneath. Plain SVG, like the
// progress ring; same drawing as the web's trend chart.
export function TrendChart({
  values,
  labels,
  color,
  formatter,
  emptyText = 'Needs a second reading for a trend',
}: {
  values: number[];
  labels: string[];
  color: string;
  formatter: (v: number) => string;
  emptyText?: string;
}) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.max(0, e.nativeEvent.layout.width));

  if (values.length < 2) {
    return (
      <View style={{ height: 64, justifyContent: 'center' }}>
        <AppText variant="small" color="muted">{emptyText}</AppText>
      </View>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const coords = values.map((v, i) => ({
    x: 6 + (i / (values.length - 1)) * Math.max(0, width - 12),
    y: HEIGHT - ((v - min) / range) * (HEIGHT - 16) - 8,
  }));
  const last = coords[coords.length - 1];
  const grid = t.border;

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: AXIS_W, height: HEIGHT, justifyContent: 'space-between', paddingVertical: 2 }}>
          <AppText variant="small" color="muted" style={{ fontSize: 10 }}>{formatter(max)}</AppText>
          <AppText variant="small" color="muted" style={{ fontSize: 10 }}>{formatter(min)}</AppText>
        </View>
        <View style={{ flex: 1, height: HEIGHT }} onLayout={onLayout}>
          {width > 0 ? (
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} x2={width} y1={8} y2={8} stroke={grid} strokeWidth={1} />
              <Line x1={0} x2={width} y1={HEIGHT - 8} y2={HEIGHT - 8} stroke={grid} strokeWidth={1} />
              <Polyline points={coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ')} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
              <Circle cx={last.x} cy={last.y} r={4} fill={color} />
            </Svg>
          ) : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: AXIS_W + 8, marginTop: 4 }}>
        <AppText variant="small" color="muted" style={{ fontSize: 10 }}>{labels[0]}</AppText>
        <AppText variant="small" color="muted" style={{ fontSize: 10 }}>{labels[labels.length - 1]}</AppText>
      </View>
    </View>
  );
}
