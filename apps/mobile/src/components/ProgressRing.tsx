import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

// A ring that fills as value approaches target (capped at 100%). Children render centred inside it.
export function ProgressRing({
  value,
  target,
  size = 88,
  strokeWidth = 8,
  color,
  trackColor,
  children,
}: {
  value: number;
  target: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const c = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* Rotated with a style transform (works on web and native) so the arc starts at 12 o'clock. */}
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={c} cy={c} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <Circle
          cx={c}
          cy={c}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - pct)}
        />
      </Svg>
      {children}
    </View>
  );
}
