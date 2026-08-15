'use client';

// Value visually caps at 100% (ring never overflows past a full circle) even if value > target
// -- the raw numbers, shown as text by the caller, still communicate an actual overage.
// Label is absolutely positioned over the ring rather than pulled up with a negative margin --
// that hack only lined up by coincidence at one specific size and broke as soon as this was
// used at a second size (PhotoDiaryTab) or placed in a different flex context.
export function ProgressRing({
  value,
  target,
  label,
  size = 76,
  strokeWidth = 7,
  color,
  trackClassName = 'stroke-black/10 dark:stroke-white/10',
  labelClassName = 'text-zinc-500',
  valueClassName = 'text-black dark:text-zinc-50',
  hideValue = false,
}: {
  value: number;
  target: number;
  label: string;
  size?: number;
  strokeWidth?: number;
  // Overrides the ring's progress stroke (defaults to var(--accent)) -- needed when the ring
  // sits on a colored surface (e.g. the Today hero card) where the accent itself is the background.
  color?: string;
  trackClassName?: string;
  labelClassName?: string;
  valueClassName?: string;
  // Omits the centered value/target text -- used where the number is already shown bigger
  // elsewhere next to the ring (Today hero card), so the ring reads as pure decoration.
  hideValue?: boolean;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = target > 0 ? Math.min(1, Math.max(0, value / target)) : 0;
  const offset = circumference * (1 - pct);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className={trackClassName}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke={color ?? 'var(--accent)'}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
      </svg>
      {!hideValue && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-sm font-semibold leading-tight ${valueClassName}`}>{Math.round(value)}</span>
          <span className={`text-[10px] leading-tight ${labelClassName}`}>/{Math.round(target)} {label}</span>
        </div>
      )}
    </div>
  );
}
