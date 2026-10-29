import { Children, createContext, useContext, type PropsWithChildren } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextProps,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icons';
import { Pressable as DimPressable } from '@/components/press';
import { radius, spacing, useTheme } from '@/theme';

// On wide screens (the browser version) content stays in a phone-width column.
const MAX_WIDTH = 520;

// True for screens shown inside the four-tab frame (set in app/(app)/_layout.tsx). The header and the tab bar already keep clear of the
// phone's notch and home bar, so such a screen must not add that space a second time (it showed as an empty band above and below the
// scrolling content). A screen with nothing around it (sign-in, the first onboarding questions) keeps all four edges.
export const InTabsContext = createContext(false);
const SIDE_EDGES: readonly Edge[] = ['left', 'right'];
function useScreenEdges(): readonly Edge[] | undefined {
  return useContext(InTabsContext) ? SIDE_EDGES : undefined;
}

export function Screen({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  const edges = useScreenEdges();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.background }}>
      <View style={[{ flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: spacing.md }, style]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

// A compact pill button (sheet headers, +/- steppers, inline actions).
export function SmallButton({ title, onPress, tone = 'accent', disabled }: { title: string; onPress: () => void; tone?: 'accent' | 'muted' | 'danger'; disabled?: boolean }) {
  const t = useTheme();
  const bg = tone === 'accent' ? t.accent : 'transparent';
  const fg = tone === 'accent' ? t.accentForeground : tone === 'danger' ? t.danger : t.foreground;
  return (
    <DimPressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={{ backgroundColor: bg, borderWidth: tone === 'accent' ? 0 : 1, borderColor: tone === 'danger' ? t.danger : t.border, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, opacity: disabled ? 0.4 : 1 }}>
      <AppText variant="small" maxFontSizeMultiplier={1.3} style={{ color: fg, fontWeight: '700' }}>{title}</AppText>
    </DimPressable>
  );
}

// A small selectable pill (quantity presets, week picker, block choices).
export function Chip({ label, active, onPress, tone = 'accent' }: { label: string; active?: boolean; onPress: () => void; tone?: 'accent' | 'success' }) {
  const t = useTheme();
  const c = tone === 'success' ? t.success : t.accent;
  return (
    <DimPressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={{ borderWidth: 1, borderColor: active ? c : t.border, backgroundColor: active ? t.accentSoft : 'transparent', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 }}>
      <AppText variant="small" maxFontSizeMultiplier={1.3} style={{ color: active ? c : t.muted, fontWeight: '600' }}>{label}</AppText>
    </DimPressable>
  );
}

// A full-screen sheet that slides up (add food, book a session, ...). Content is the same phone-width column.
export function SheetFrame({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: t.background }}>
        <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', flex: 1, padding: spacing.md, gap: spacing.md }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <AppText variant="heading" style={{ flexShrink: 1 }}>{title}</AppText>
            <SmallButton title="Close" tone="muted" onPress={onClose} />
          </View>
          {children}
        </View>
      </SafeAreaView>
    </Modal>
  );
}

// "Delete the photo from 8 Oct 2026? This cannot be undone." A small centred card over a dimmed screen.
export function ConfirmSheet({
  title,
  body,
  confirmLabel = 'Delete',
  destructive = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTheme();
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable onPress={onCancel} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg }}>
        {/* A press on the card itself must not fall through to the dimmed backdrop and close it. */}
        <Pressable onPress={() => {}} style={{ width: '100%', maxWidth: 420, alignSelf: 'center', backgroundColor: t.card, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md }}>
          <AppText variant="heading">{title}</AppText>
          {body ? <AppText color="muted">{body}</AppText> : null}
          <View style={{ flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end' }}>
            <SmallButton title="Cancel" tone="muted" onPress={onCancel} />
            <SmallButton title={confirmLabel} tone={destructive ? 'danger' : 'accent'} onPress={onConfirm} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// A small heading above a group of settings rows.
export function SectionLabel({ children }: PropsWithChildren) {
  return (
    <AppText variant="small" color="muted" style={{ fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.6, marginBottom: 6, marginLeft: 4 }}>
      {children}
    </AppText>
  );
}

// A small rounded label on a row ("Week 12", "3 to do"). The web's Badge.
export function Badge({ children, tone = 'accent' }: PropsWithChildren<{ tone?: 'accent' | 'warning' | 'success' | 'danger' | 'muted' }>) {
  const t = useTheme();
  const fg = tone === 'accent' ? t.accentText : tone === 'muted' ? t.muted : t[tone];
  const bg = tone === 'accent' ? t.accentSoft : tone === 'muted' ? t.cardMuted : `${t[tone]}26`;
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
      <AppText maxFontSizeMultiplier={1.3} style={{ color: fg, fontSize: 11, fontWeight: '700' }}>{children}</AppText>
    </View>
  );
}

// The web's sub-page pills ("Food Tracking / Meal Planner / Recipes"): separate rounded pills in a row, the chosen one filled
// with the accent, the rest outlined. Scrolls sideways when they do not all fit.
export function PillTabs<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 8 }} keyboardShouldPersistTaps="handled">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <DimPressable
            key={o.value}
            onPress={() => !on && onChange(o.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, backgroundColor: on ? t.accent : t.background, borderWidth: on ? 0 : 1, borderColor: t.border }}>
            <AppText variant="small" maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', color: on ? t.accentForeground : t.foreground }}>{o.label}</AppText>
          </DimPressable>
        );
      })}
    </ScrollView>
  );
}

// Rows in one rounded card with a hairline between them (a settings list).
export function ListGroup({ children }: PropsWithChildren) {
  const t = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
      {rows.map((row, i) => (
        <View key={i} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
          {row}
        </View>
      ))}
    </View>
  );
}

// One row of a ListGroup: a title (and optional line under it), something on the right, tappable when it has onPress.
// `tone` tints the icon chip: the brand teal for the screens the member uses, grey for settings and legal, red for leaving.
export function ListRow({ title, subtitle, right, onPress, destructive, icon, tone = 'accent' }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void; destructive?: boolean; icon?: IconName; tone?: 'accent' | 'neutral' | 'danger' }) {
  const t = useTheme();
  const chip = tone === 'danger' ? { bg: 'rgba(224,85,85,0.12)', fg: t.danger } : tone === 'neutral' ? { bg: t.cardMuted, fg: t.muted } : { bg: t.accentSoft, fg: t.accent };
  const content = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.md, paddingVertical: 14 }}>
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 11, backgroundColor: chip.bg, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={icon} size={18} color={chip.fg} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText style={{ fontWeight: '600' }} color={destructive || tone === 'danger' ? 'danger' : undefined}>{title}</AppText>
        {subtitle ? <AppText variant="small" color="muted">{subtitle}</AppText> : null}
      </View>
      {right}
      {onPress ? <Icon name="chevronRight" size={18} color={t.muted} /> : null}
    </View>
  );
  // A tapped row dims a little, so the member can see the tap landed.
  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => ({ opacity: pressed ? 0.65 : 1 })}>
      {content}
    </Pressable>
  ) : (
    content
  );
}

// Two or three options, one selected (e.g. Book / My bookings).
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.cardMuted, borderRadius: radius.md, padding: 4 }}>
      {options.map((o) => (
        <DimPressable key={o.value} onPress={() => onChange(o.value)} accessibilityRole="button" accessibilityState={{ selected: o.value === value }} style={{ flex: 1, paddingVertical: 8, borderRadius: radius.md - 4, backgroundColor: o.value === value ? t.card : 'transparent', alignItems: 'center' }}>
          <AppText variant="small" maxFontSizeMultiplier={1.3} style={{ fontWeight: '700', color: o.value === value ? t.foreground : t.muted }}>{o.label}</AppText>
        </DimPressable>
      ))}
    </View>
  );
}

// A scrolling screen with pull-to-refresh, in the same phone-width column.
export function ScrollScreen({
  children,
  refreshing,
  onRefresh,
  scrollRef,
}: PropsWithChildren<{ refreshing?: boolean; onRefresh?: () => void; scrollRef?: React.Ref<React.ComponentRef<typeof ScrollView>> }>) {
  const t = useTheme();
  const edges = useScreenEdges();
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: t.background }}>
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', padding: spacing.md, gap: spacing.md }}
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.accent} /> : undefined}
        // Forms: tapping a button while the keyboard is up still works, and on iOS the list makes room for the keyboard.
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function AppText({
  variant = 'body',
  color,
  style,
  ...rest
}: TextProps & { variant?: 'title' | 'heading' | 'body' | 'small'; color?: 'muted' | 'danger' | 'accent' | 'success' | 'warning' }) {
  const t = useTheme();
  const sizes = { title: 28, heading: 18, body: 16, small: 13 } as const;
  const weights = { title: '700', heading: '600', body: '400', small: '400' } as const;
  return (
    <Text
      {...rest}
      style={[
        { fontSize: sizes[variant], fontWeight: weights[variant], color: color === 'accent' ? t.accentText : color ? t[color] : t.foreground },
        style,
      ]}
    />
  );
}

export function Card({ children, style }: PropsWithChildren<{ style?: ViewStyle }>) {
  const t = useTheme();
  return (
    <View
      style={[
        { backgroundColor: t.card, borderRadius: radius.lg, padding: spacing.md, borderWidth: 1, borderColor: t.border },
        style,
      ]}>
      {children}
    </View>
  );
}

export function Button({
  title,
  onPress,
  loading,
  disabled,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary';
}) {
  const t = useTheme();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        backgroundColor: primary ? t.accent : t.cardMuted,
        borderRadius: radius.md,
        paddingVertical: 14,
        alignItems: 'center',
        opacity: disabled || loading ? 0.5 : pressed ? 0.85 : 1,
      })}>
      {loading ? (
        <ActivityIndicator color={primary ? t.accentForeground : t.foreground} />
      ) : (
        <Text style={{ color: primary ? t.accentForeground : t.foreground, fontSize: 16, fontWeight: '600' }}>{title}</Text>
      )}
    </Pressable>
  );
}

export function TextField({ label, ...props }: TextInputProps & { label: string }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="small" color="muted">
        {label}
      </AppText>
      <TextInput
        {...props}
        placeholderTextColor={t.muted}
        style={{
          backgroundColor: t.card,
          color: t.foreground,
          borderWidth: 1,
          borderColor: t.border,
          borderRadius: radius.md,
          paddingHorizontal: spacing.md,
          paddingVertical: 12,
          fontSize: 16,
        }}
      />
    </View>
  );
}
