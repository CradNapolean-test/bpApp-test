import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, TextInput, View, type StyleProp, type TextInputProps, type TextStyle } from 'react-native';

import type { DailyLogRow } from '@ballistic/shared/data/types';
import { dayTrafficLight, trafficLight, type TrackerMetric, type TrafficLight } from '@ballistic/shared/utils/accountability';
import { dayHasFood, editableTrackerValue, formatTrackerValue, nudgeValue, parseTrackerInput, TRACKER_CONFIG, type WaterUnit } from '@ballistic/shared/utils/weeklyLog';

import { Pressable } from '@/components/press';
import { IconChip } from '@/components/home';
import { Icon, type IconName } from '@/components/icons';
import { AppText } from '@/components/ui';
import { radius, useTheme } from '@/theme';

const LIGHT_LABEL: Record<TrafficLight, string> = { green: 'On track ✓', amber: 'Getting there', red: 'Needs work' };

function lightColor(t: ReturnType<typeof useTheme>, light: TrafficLight) {
  return light === 'green' ? t.success : light === 'amber' ? t.warning : t.danger;
}

const TRACKER_ICON: Record<TrackerMetric, IconName> = { sleep: 'moon', steps: 'footprints', water: 'droplets' };

// A box the member types in that saves itself: a moment after they stop typing, when they leave the box, and when the
// screen closes, so a figure typed and then "Back" is never lost. While typing it shows exactly what was typed; the rest
// of the time it shows the saved value (`display`, e.g. "8,250"). `onSave` gets the typed text; the caller decides what it
// means (and ignores a value that has not changed).
export function AutoSaveInput({
  display,
  editText,
  onSave,
  delay = 800,
  style,
  ...props
}: Omit<TextInputProps, 'value' | 'onChangeText' | 'onFocus' | 'onBlur' | 'onSubmitEditing' | 'style'> & {
  display: string;
  editText: string;
  onSave: (text: string) => void;
  delay?: number;
  style?: StyleProp<TextStyle>;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveRef = useRef(onSave);
  useEffect(() => {
    saveRef.current = onSave;
  });

  // Saves what is waiting, if anything.
  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (draftRef.current !== null) saveRef.current(draftRef.current);
    }
  }, []);
  useEffect(() => flush, [flush]); // the screen closing counts as leaving the box

  return (
    <TextInput
      {...props}
      value={draft ?? display}
      onFocus={() => {
        draftRef.current = editText;
        setDraft(editText);
      }}
      onChangeText={(text) => {
        draftRef.current = text;
        setDraft(text);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, delay);
      }}
      onBlur={() => {
        flush();
        draftRef.current = null;
        setDraft(null);
      }}
      onSubmitEditing={() => {
        flush();
      }}
      style={style}
    />
  );
}

const THUMB = 26;

// The web's slider: a thick grey track filled up to the figure in the band's colour (green / amber / red, or the accent before
// anything is logged) and a white knob with an accent ring. A tap or drag anywhere on it sets the figure, snapped to the step;
// `onSlide` reports it as it moves and `onRelease` once the finger lifts (that is when it is saved). Drawn with the responder
// system rather than a native slider, so it behaves the same on a phone and in the browser and needs no extra package.
function TrackerSlider({ metric, value, light, onSlide, onRelease }: { metric: TrackerMetric; value: number; light: TrafficLight | null; onSlide: (v: number) => void; onRelease: (v: number) => void }) {
  const t = useTheme();
  const cfg = TRACKER_CONFIG[metric];
  const [width, setWidth] = useState(0);
  const span = Math.max(1, width - THUMB); // how far the centre of the knob can travel
  const frac = Math.min(1, Math.max(0, (value - cfg.min) / (cfg.max - cfg.min)));

  // Where the drag began (the touch's x inside the slider, and on the page), and the figure last reported.
  const startX = useRef(0);
  const startPageX = useRef(0);
  const lastValue = useRef(value);

  // The figure under a finger at `x` across the slider, snapped to the step.
  const valueAt = (x: number) => {
    const f = Math.min(1, Math.max(0, (x - THUMB / 2) / span));
    const snapped = Math.round((cfg.min + f * (cfg.max - cfg.min)) / cfg.step) * cfg.step;
    return +Math.min(cfg.max, Math.max(cfg.min, snapped)).toFixed(2);
  };

  const fill = light ? lightColor(t, light) : t.accent;
  const webOnly = (Platform.OS === 'web' ? { touchAction: 'none', cursor: 'pointer', userSelect: 'none' } : null) as object | null;
  return (
    <View
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false} // a scrolling list must not take the drag away
      onResponderGrant={(e) => {
        startX.current = e.nativeEvent.locationX;
        startPageX.current = e.nativeEvent.pageX;
        lastValue.current = valueAt(startX.current);
        onSlide(lastValue.current);
      }}
      onResponderMove={(e) => {
        const next = valueAt(startX.current + (e.nativeEvent.pageX - startPageX.current));
        if (next === lastValue.current) return;
        lastValue.current = next;
        onSlide(next);
      }}
      onResponderRelease={() => onRelease(lastValue.current)}
      onResponderTerminate={() => onRelease(lastValue.current)}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={`${cfg.label} slider`}
      accessibilityValue={{ min: cfg.min, max: cfg.max, now: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => onRelease(nudgeValue(metric, value, e.nativeEvent.actionName === 'increment' ? 1 : -1))}
      style={[{ height: 30, justifyContent: 'center' }, webOnly]}>
      <View pointerEvents="none" style={{ height: 8, borderRadius: 4, backgroundColor: 'rgba(127,127,127,0.25)', overflow: 'hidden' }}>
        <View style={{ height: 8, width: THUMB / 2 + frac * span, backgroundColor: fill }} />
      </View>
      <View
        pointerEvents="none"
        style={{ position: 'absolute', top: 2, left: frac * span, width: THUMB, height: THUMB, borderRadius: THUMB / 2, backgroundColor: '#ffffff', borderWidth: 3, borderColor: t.accent, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }, elevation: 3 }}
      />
    </View>
  );
}

// Sleep / steps / water: the big value, its green / amber / red status, the three bands, a slider for quick large changes, and + / -
// buttons for fine ones. The number is also a box, so an exact figure can be typed.
export function TrackerCard({ metric, value: saved, onCommit }: { metric: TrackerMetric; value: number | null; onCommit: (v: number | null) => void }) {
  const t = useTheme();
  const cfg = TRACKER_CONFIG[metric];
  const [waterUnit, setWaterUnit] = useState<WaterUnit>('L');
  // While the slider is being dragged the card shows that figure, then goes back to the saved one.
  const [dragging, setDragging] = useState<number | null>(null);
  const value = dragging ?? saved;
  const logged = value != null;
  const light = logged ? trafficLight(metric, value) : null;
  const unit = metric === 'water' ? waterUnit : cfg.unit;

  function saveTyped(text: string) {
    // An empty box means "take this figure back": a logged value used to be changeable but never removable (R12).
    if (text.trim() === '') {
      if (value != null) onCommit(null);
      return;
    }
    const next = parseTrackerInput(metric, text, waterUnit);
    if (next != null && next !== value) onCommit(next);
  }
  const nudge = (dir: 1 | -1) => onCommit(nudgeValue(metric, value, dir));

  return (
    <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: radius.lg, padding: 14, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <IconChip icon={TRACKER_ICON[metric]} tone="accent" />
          <AppText style={{ fontWeight: '800' }}>{cfg.label}</AppText>
        </View>
        {light ? (
          <View style={{ borderWidth: 1, borderColor: lightColor(t, light), borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <AppText style={{ color: lightColor(t, light), fontSize: 11, fontWeight: '800' }}>{LIGHT_LABEL[light]}</AppText>
          </View>
        ) : (
          <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
            <AppText color="muted" style={{ fontSize: 11, fontWeight: '700' }}>Not logged</AppText>
          </View>
        )}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {cfg.bands.map(([band, text]) => (
          <View key={band} style={{ borderWidth: 1, borderColor: lightColor(t, band), borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, opacity: light && light !== band ? 0.4 : 1, backgroundColor: light === band ? 'rgba(127,127,127,0.12)' : 'transparent' }}>
            <AppText style={{ color: lightColor(t, band), fontSize: 11, fontWeight: '800' }}>{text}</AppText>
          </View>
        ))}
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 }}>
          <AutoSaveInput
            accessibilityLabel={`${cfg.label} (type a value)`}
            placeholder="—"
            placeholderTextColor={t.muted}
            keyboardType={metric === 'steps' ? 'number-pad' : 'decimal-pad'}
            display={logged ? formatTrackerValue(metric, value, waterUnit) : ''}
            editText={logged ? editableTrackerValue(metric, value, waterUnit) : ''}
            onSave={saveTyped}
            maxLength={9}
            selectTextOnFocus
            style={{ minWidth: 70, color: t.foreground, fontSize: 32, fontWeight: '900', padding: 0 }}
          />
          <AppText color="muted" style={{ fontWeight: '600' }}>{unit}</AppText>
        </View>
        {metric === 'water' ? (
          <View style={{ flexDirection: 'row', borderWidth: 1, borderColor: t.border, borderRadius: 999, padding: 2 }}>
            {(['L', 'mL'] as const).map((u) => (
              <Pressable key={u} onPress={() => setWaterUnit(u)} accessibilityRole="button" accessibilityState={{ selected: waterUnit === u }} style={{ borderRadius: 999, paddingHorizontal: 11, paddingVertical: 3, backgroundColor: waterUnit === u ? t.accent : 'transparent' }}>
                <AppText style={{ color: waterUnit === u ? t.accentForeground : t.muted, fontSize: 11, fontWeight: '800' }}>{u}</AppText>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      <TrackerSlider metric={metric} value={value ?? 0} light={light} onSlide={setDragging} onRelease={(v) => { setDragging(null); if (v !== saved) onCommit(v); }} />

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Pressable onPress={() => nudge(-1)} accessibilityRole="button" accessibilityLabel={`Decrease ${cfg.label.toLowerCase()}`} style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: t.cardMuted, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="minus" size={24} color={t.foreground} strokeWidth={3} />
        </Pressable>
        <AppText variant="small" color="muted" style={{ flex: 1, textAlign: 'center' }}>{cfg.stepHint} · or tap the number to type</AppText>
        <Pressable onPress={() => nudge(1)} accessibilityRole="button" accessibilityLabel={`Increase ${cfg.label.toLowerCase()}`} style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="plus" size={24} color={t.accentForeground} strokeWidth={3} />
        </Pressable>
      </View>
    </View>
  );
}

// 1 to 5 as five bars, filled up to the chosen value.
export function MoodDots({ label, value, onChange }: { label: string; value: number | null; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <AppText color="muted" style={{ width: 84 }}>{label}</AppText>
      <View style={{ flex: 1, flexDirection: 'row', gap: 6 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="button" accessibilityLabel={`${label} ${n} of 5`} accessibilityState={{ selected: value === n }} style={{ flex: 1, height: 30, borderRadius: 15, backgroundColor: value != null && n <= value ? t.accent : t.cardMuted }} />
        ))}
      </View>
    </View>
  );
}

// The seven days of the week on show: weekday, date and a dot (green / amber / red when sleep, steps or water are in).
export function DayStrip({ dates, focused, logs, onSelect }: { dates: string[]; focused: string; logs: DailyLogRow[]; onSelect: (d: string) => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {dates.map((date) => {
        const row = logs.find((l) => l.log_date === date);
        const light = row ? dayTrafficLight(row) : null;
        const logged = !!row && dayHasFood(row);
        const isFocused = date === focused;
        const d = new Date(date + 'T00:00:00Z');
        const dot = light ? (isFocused ? t.accentForeground : lightColor(t, light)) : logged ? (isFocused ? t.accentForeground : t.muted) : 'transparent';
        return (
          <Pressable
            key={date}
            onPress={() => onSelect(date)}
            accessibilityRole="button"
            accessibilityState={{ selected: isFocused }}
            accessibilityLabel={d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })}
            style={{ flex: 1, alignItems: 'center', gap: 4, paddingVertical: 8, borderRadius: radius.md, borderWidth: 1, borderColor: isFocused ? t.accent : t.border, backgroundColor: isFocused ? t.accent : 'transparent' }}>
            <AppText style={{ fontSize: 11, fontWeight: '600', textTransform: 'uppercase', color: isFocused ? t.accentForeground : t.muted }}>{d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })}</AppText>
            <AppText style={{ fontWeight: '800', color: isFocused ? t.accentForeground : t.foreground }}>{d.getUTCDate()}</AppText>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dot }} />
          </Pressable>
        );
      })}
    </View>
  );
}

// Previous week / this week label / next week.
export function WeekHeader({ title, range, canGoBack = true, canGoForward, onBack, onForward }: { title: string; range: string; canGoBack?: boolean; canGoForward: boolean; onBack: () => void; onForward: () => void }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <Pressable onPress={onBack} disabled={!canGoBack} accessibilityRole="button" accessibilityLabel="Previous week" accessibilityState={{ disabled: !canGoBack }} hitSlop={8} style={{ padding: 8, opacity: canGoBack ? 1 : 0.3 }}>
        <Icon name="chevronLeft" size={22} color={t.muted} />
      </Pressable>
      <View style={{ alignItems: 'center' }}>
        <AppText style={{ fontWeight: '700' }}>{title}</AppText>
        <AppText variant="small" color="muted">{range}</AppText>
      </View>
      <Pressable onPress={onForward} disabled={!canGoForward} accessibilityRole="button" accessibilityLabel="Next week" accessibilityState={{ disabled: !canGoForward }} hitSlop={8} style={{ padding: 8, opacity: canGoForward ? 1 : 0.3 }}>
        <Icon name="chevronRight" size={22} color={t.muted} />
      </Pressable>
    </View>
  );
}

// A small figure card ("1,650 avg kcal").
export function AvgCard({ value, unit, label }: { value: string; unit?: string; label: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: 'transparent' }}>
      <AppText style={{ fontSize: 22, fontWeight: '800' }}>
        {value}
        {unit ? <AppText color="muted" style={{ fontSize: 13, fontWeight: '700' }}>{unit}</AppText> : null}
      </AppText>
      <AppText variant="small" color="muted">{label}</AppText>
    </View>
  );
}
