// Green/amber/red thresholds for the accountability tracker, as specified by the owner
// (BP app brief): sleep 7.5h+ / 6-7.5h / <6h, steps 8k+ / 4k-8k / <4k, water 2.5L+ / 1-2.5L / <1L.
// Water is stored in litres. Kept as data so a threshold change is a one-line edit.

export type TrackerMetric = 'sleep' | 'steps' | 'water';
export type TrafficLight = 'green' | 'amber' | 'red';

export const TRACKER_THRESHOLDS: Record<TrackerMetric, { green: number; amber: number }> = {
  sleep: { green: 7.5, amber: 6 },
  steps: { green: 8000, amber: 4000 },
  water: { green: 2.5, amber: 1 },
};

export function trafficLight(metric: TrackerMetric, value: number): TrafficLight {
  const t = TRACKER_THRESHOLDS[metric];
  return value >= t.green ? 'green' : value >= t.amber ? 'amber' : 'red';
}

// Day colour for the week strip: null if nothing tracked. Mockup rule -- 2+ greens is a green
// day, 2+ reds a red day, anything else amber. Only metrics actually logged are counted.
export function dayTrafficLight(day: { sleep: number | null; steps: number | null; water: number | null }): TrafficLight | null {
  const lights: TrafficLight[] = [];
  if (day.sleep != null) lights.push(trafficLight('sleep', day.sleep));
  if (day.steps != null) lights.push(trafficLight('steps', day.steps));
  if (day.water != null) lights.push(trafficLight('water', day.water));
  if (lights.length === 0) return null;
  if (lights.filter((l) => l === 'green').length >= 2) return 'green';
  if (lights.filter((l) => l === 'red').length >= 2) return 'red';
  return 'amber';
}
