import { useRouter, type Href, type Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { BrandMark } from '@/components/brand';
import { Icon, type IconName } from '@/components/icons';
import { SyncStrip } from '@/components/sync';
import { useChatUnread, useOwnUserId } from '@/lib/chat';
import { useUnreadNotifications } from '@/lib/notifications';
import { useTheme } from '@/theme';

// The member app's frame, matching the web app: four tabs along the bottom (Home / Book / Coach / Profile) and one
// header on top. Everything else (food, workouts, chat, progress, ...) is opened from one of the four and keeps that
// tab lit, with a back arrow in the header.

// Phone-width column on wide screens (the browser version); the same width the screens use.
const MAX_WIDTH = 520;

// The tab bar and header props, taken from the Tabs component itself (expo-router does not export these types).
type TabsProps = React.ComponentProps<typeof Tabs>;
type BottomTabBarProps = Parameters<NonNullable<TabsProps['tabBar']>>[0];
type ScreenOptionsObject = Exclude<NonNullable<TabsProps['screenOptions']>, (...args: never[]) => unknown>;
type BottomTabHeaderProps = Parameters<NonNullable<ScreenOptionsObject['header']>>[0];

const TABS = [
  { name: 'index', label: 'Home', icon: 'house' },
  { name: 'classes', label: 'Book', icon: 'calendarDays' },
  { name: 'coach', label: 'Coach', icon: 'messagesSquare' },
  { name: 'account', label: 'Profile', icon: 'user' },
] as const satisfies readonly { name: string; label: string; icon: IconName }[];

type TabName = (typeof TABS)[number]['name'];

// Which tab is lit on each route: the four tabs themselves, plus the screens opened from them.
const TAB_OF: Record<string, TabName> = {
  index: 'index',
  notifications: 'index',
  classes: 'classes',
  coach: 'coach',
  food: 'coach',
  workouts: 'coach',
  'workout/[dayId]': 'coach',
  chat: 'coach',
  progress: 'coach',
  checkin: 'coach',
  forms: 'coach',
  'form/[assignmentId]': 'coach',
  learn: 'coach',
  'course/[assignmentId]': 'coach',
  recipes: 'coach',
  'meal-plan': 'coach',
  activity: 'coach',
  bigdog: 'account',
  events: 'index',
  feedback: 'index',
  refer: 'index',
  rewards: 'index',
  faq: 'index',
  account: 'account',
  details: 'account',
  'confirm-details': 'index',
  credits: 'account',
};

// Where the back arrow goes when there is nothing to go back to (the page was opened directly, e.g. a refreshed
// browser tab). Normally it just goes back to wherever the member came from.
const BACK_TO: Record<string, Href> = {
  notifications: '/',
  credits: '/account',
  food: '/coach',
  workouts: '/coach',
  'workout/[dayId]': '/workouts',
  chat: '/coach',
  progress: '/coach',
  checkin: '/coach',
  forms: '/coach',
  'form/[assignmentId]': '/forms',
  learn: '/coach',
  'course/[assignmentId]': '/learn',
  recipes: '/coach',
  'meal-plan': '/coach',
  activity: '/coach',
  bigdog: '/account',
  events: '/',
  feedback: '/',
  refer: '/',
  rewards: '/',
  faq: '/',
  details: '/account',
};

// Screens that share a row of pills with their neighbours (Nutrition, Training, Check-in).
const PILL_PAGES = new Set(['food', 'meal-plan', 'recipes', 'workouts', 'activity', 'checkin', 'forms']);

// The Android keyboard resizes the screen; the tab bar would sit on top of it and eat the space the chat needs.
function useKeyboardOpen(): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', () => setOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  return open;
}

// The tab to light for the screen on show. Credits can be opened from Book or from Profile; it lights whichever of the
// two the member came from (the navigator's history says which).
function activeTab(state: BottomTabBarProps['state']): TabName {
  const name = state.routes[state.index]?.name ?? '';
  if (name === 'credits') {
    // The tab bar's view of the state no longer types `history` (expo-router 58), but the real navigator state still carries it.
    const history = ((state as { history?: { key: string }[] }).history ?? []) as { key: string }[];
    for (let i = history.length - 2; i >= 0; i--) {
      const from = state.routes.find((r) => r.key === history[i].key)?.name;
      if (from === 'classes' || from === 'account') return from;
    }
  }
  return TAB_OF[name] ?? 'index';
}

export function BottomTabs({ state, emitter, navigateToTab, insets }: BottomTabBarProps) {
  const t = useTheme();
  const clientId = useOwnUserId();
  const unread = useChatUnread(clientId).data ?? 0;
  const keyboardOpen = useKeyboardOpen();
  const active = activeTab(state);
  if (keyboardOpen) return null;

  return (
    <View style={{ backgroundColor: t.card, borderTopWidth: 1, borderTopColor: t.border, paddingBottom: insets.bottom }}>
      <View style={{ flexDirection: 'row', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 8 }}>
        {TABS.map((tab) => {
          const route = state.routes.find((r) => r.name === tab.name);
          if (!route) return null;
          const isActive = active === tab.name;
          const showDot = tab.name === 'coach' && unread > 0;
          const color = isActive ? t.accent : t.muted;
          const onPress = () => {
            const event = emitter.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            // Pressing the lit tab while on one of its sub-screens still goes back to the tab's own page.
            if (!event.defaultPrevented) navigateToTab(route.key);
          };
          return (
            <Pressable
              key={tab.name}
              onPress={onPress}
              accessibilityRole="tab"
              accessibilityLabel={showDot ? `${tab.label}, ${unread} unread` : tab.label}
              accessibilityState={{ selected: isActive }}
              aria-selected={isActive}
              style={{ flex: 1, alignItems: 'center', paddingTop: 8, paddingBottom: 6, gap: 3 }}>
              <View style={{ width: 56, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isActive ? t.accentSoft : 'transparent' }}>
                <Icon name={tab.icon} size={22} color={color} />
                {showDot ? <View style={{ position: 'absolute', top: 2, right: 11, width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger, borderWidth: 2, borderColor: t.card }} /> : null}
              </View>
              <AppText maxFontSizeMultiplier={1.2} style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase' }}>{tab.label}</AppText>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// A rounded-square tile with an icon, as on the web's header. `lit` fills it with the accent (new messages).
function HeaderButton({ icon, label, onPress, count, dot, lit }: { icon: IconName; label: string; onPress: () => void; count?: number; dot?: boolean; lit?: boolean }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={6}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: lit ? t.accent : t.cardMuted, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} size={20} color={lit ? t.accentForeground : t.chromeIcon} />
        {count && count > 0 ? (
          <View style={{ position: 'absolute', top: -2, right: -2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: t.background }}>
            <AppText style={{ color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 12 }}>{count > 9 ? '9+' : count}</AppText>
          </View>
        ) : null}
        {dot ? <View style={{ position: 'absolute', top: 6, right: 6, width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger, borderWidth: 2, borderColor: t.cardMuted }} /> : null}
      </View>
    </Pressable>
  );
}

function AppHeader({ routeName, title }: { routeName: string; title?: string }) {
  const t = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const clientId = useOwnUserId();
  const unreadChat = useChatUnread(clientId).data ?? 0;
  const unreadNotes = useUnreadNotifications().data ?? 0;

  const isHome = routeName === 'index';
  const fallback = BACK_TO[routeName];
  // Switching between a page's pills (Food Tracking / Meal Planner / Recipes, ...) is not a step the back arrow should retrace:
  // like the web, it leaves the group for the page it was opened from.
  const goBack = () => (PILL_PAGES.has(routeName) && fallback ? router.navigate(fallback) : router.canGoBack() ? router.back() : fallback ? router.replace(fallback) : undefined);

  return (
    <View style={{ backgroundColor: t.background, paddingTop: insets.top }}>
      <View style={{ width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', height: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16 }}>
        {isHome ? (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }}>
            <BrandMark height={30} />
            <View style={{ flexShrink: 1 }}>
              <AppText style={{ fontSize: 15, fontWeight: '800', lineHeight: 18 }} numberOfLines={1}>Ballistic</AppText>
              <AppText style={{ fontSize: 9, fontWeight: '700', letterSpacing: 2, lineHeight: 11 }} color="muted" numberOfLines={1}>PERFORMANCE</AppText>
            </View>
          </View>
        ) : (
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
            {fallback ? (
              <Pressable onPress={goBack} accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: t.cardMuted, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="arrowLeft" size={16} color={t.chromeIcon} />
              </Pressable>
            ) : null}
            <AppText maxFontSizeMultiplier={1.3} style={{ fontSize: 20, fontWeight: '800', flexShrink: 1 }} numberOfLines={1} accessibilityRole="header">{title ?? ''}</AppText>
          </View>
        )}

        {routeName !== 'chat' ? <HeaderButton icon="messageSquare" label={unreadChat > 0 ? `Messages, ${unreadChat} unread` : 'Messages'} count={unreadChat} lit={unreadChat > 0} onPress={() => router.navigate('/chat')} /> : null}
        {routeName !== 'notifications' ? <HeaderButton icon="bell" label={unreadNotes > 0 ? `Notifications, ${unreadNotes} new` : 'Notifications'} dot={unreadNotes > 0} onPress={() => router.navigate('/notifications')} /> : null}
        {isHome ? (
          <Pressable onPress={() => router.navigate('/account')} accessibilityRole="button" accessibilityLabel="My profile" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 12, height: 36 }}>
            <Icon name="user" size={16} color={t.accentForeground} />
            <AppText variant="small" style={{ color: t.accentForeground, fontWeight: '700' }}>Profile</AppText>
          </Pressable>
        ) : null}
      </View>
      <SyncStrip />
    </View>
  );
}

// The Tabs navigator calls this for every screen; the title comes from each screen's `title` option.
export function renderHeader({ route, options }: BottomTabHeaderProps) {
  return <AppHeader routeName={route.name} title={options.title} />;
}
