import Svg, { Circle, Ellipse, Line, Path, Polygon, Polyline, Rect } from 'react-native-svg';

import { iconData, type IconName } from '@/components/iconData';

export type { IconName };

const SHAPES = { path: Path, circle: Circle, rect: Rect, line: Line, polyline: Polyline, polygon: Polygon, ellipse: Ellipse } as const;

// A Lucide icon (the same set the web app uses), drawn as vector paths. Colour is the stroke; size is in points.
export function Icon({ name, size = 22, color, strokeWidth = 2, fill = 'none' }: { name: IconName; size?: number; color: string; strokeWidth?: number; fill?: string }) {
  const nodes = iconData[name] as readonly (readonly [keyof typeof SHAPES, Record<string, string | number>])[];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      {nodes.map(([tag, attrs], i) => {
        // The attributes come straight from Lucide's own data, so they are valid for whichever shape this is.
        const Shape = SHAPES[tag] as unknown as React.ComponentType<Record<string, string | number>>;
        return <Shape key={i} {...attrs} />;
      })}
    </Svg>
  );
}
