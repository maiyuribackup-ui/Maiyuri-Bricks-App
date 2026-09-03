import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Dimensions, Image, Pressable, ScrollView, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMyProfile } from '@/hooks/use-push-settings';
import { useAuth } from '@/store/auth';
import { useDrawer } from '@/store/drawer';
import { Icon, type IconName } from './Icon';
import { haptic } from './haptics';

const { width: SCREEN_W } = Dimensions.get('window');
const PANEL_W = Math.min(320, SCREEN_W * 0.84);

type Dest = { label: string; href: string; icon: IconName; key: string };

// Full menu — the drawer exposes everything, filtered by role (mirrors the
// web sidebar's roleModuleAccess). Bottom tabs stay for the top destinations.
const DESTINATIONS: Dest[] = [
  { key: 'index', label: 'Dashboard', href: '/(tabs)', icon: 'grid-outline' },
  { key: 'onehub', label: 'OneHub', href: '/onehub', icon: 'compass-outline' },
  { key: 'my-work', label: 'My Work', href: '/onehub/my-work', icon: 'checkbox-outline' },
  { key: 'expenses', label: 'My Expenses', href: '/onehub/expenses', icon: 'wallet-outline' },
  { key: 'approvals', label: 'Approvals', href: '/onehub/approvals', icon: 'checkmark-done-outline' },
  { key: 'leads', label: 'Leads', href: '/(tabs)/leads', icon: 'people-outline' },
  { key: 'plan', label: 'Plan', href: '/(tabs)/plan', icon: 'calendar-outline' },
  { key: 'production', label: 'Production', href: '/(tabs)/production', icon: 'construct-outline' },
  { key: 'deliveries', label: 'Deliveries', href: '/(tabs)/deliveries', icon: 'cube-outline' },
  { key: 'training', label: 'Training', href: '/onehub/training', icon: 'school-outline' },
  { key: 'settings', label: 'Settings', href: '/(tabs)/settings', icon: 'settings-outline' },
];

// Which keys each role may see (submitter/admin gates mirror the app).
const ROLE_KEYS: Record<string, string[]> = {
  founder: DESTINATIONS.map((d) => d.key),
  owner: DESTINATIONS.map((d) => d.key),
  production_supervisor: ['index', 'onehub', 'my-work', 'expenses', 'approvals', 'plan', 'production', 'deliveries', 'training', 'settings'],
  accountant: ['index', 'onehub', 'my-work', 'expenses', 'approvals', 'leads', 'training', 'settings'],
  engineer: ['index', 'onehub', 'my-work', 'expenses', 'leads', 'production', 'training', 'settings'],
  sales: ['index', 'onehub', 'my-work', 'expenses', 'leads', 'training', 'settings'],
  driver: ['index', 'onehub', 'my-work', 'expenses', 'deliveries', 'settings'],
};

/**
 * Native left navigation drawer — slides in from the left edge (tap the
 * hamburger OR swipe from the left edge), with a branded header and a
 * role-filtered menu. Rendered once at the root so it can navigate anywhere
 * without touching the existing route tree.
 */
export function NavDrawer() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const open = useDrawer((s) => s.open);
  const setOpen = useDrawer((s) => s.setOpen);
  const session = useAuth((s) => s.session);
  const profile = useMyProfile(session?.user?.id);
  const role = (profile.data?.data.role as string | undefined) ?? '';
  const name = profile.data?.data.name ?? session?.user?.email ?? 'Maiyuri';

  const tx = useSharedValue(-PANEL_W);
  const backdrop = useSharedValue(0);

  useEffect(() => {
    tx.value = withTiming(open ? 0 : -PANEL_W, { duration: 240 });
    backdrop.value = withTiming(open ? 1 : 0, { duration: 240 });
  }, [open, tx, backdrop]);

  const panelStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tx.value }] }));
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));

  const close = () => setOpen(false);

  const go = (href: string) => {
    haptic.tap();
    close();
    // let the close animation start, then navigate
    setTimeout(() => router.push(href as never), 120);
  };

  // Edge-swipe to open: a pan starting near the left edge.
  const edgePan = Gesture.Pan()
    .activeOffsetX(12)
    .onEnd((e) => {
      if (e.translationX > 40 && e.absoluteX < 60 + e.translationX) {
        runOnJS(setOpen)(true);
      }
    });

  const keys = ROLE_KEYS[role] ?? ['index', 'settings'];
  const items = DESTINATIONS.filter((d) => keys.includes(d.key));

  return (
    <>
      {/* Left-edge catcher (thin, always present, transparent) */}
      {!open ? (
        <GestureDetector gesture={edgePan}>
          <View
            style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 24, zIndex: 40 }}
          />
        </GestureDetector>
      ) : null}

      {/* Backdrop */}
      <Animated.View
        pointerEvents={open ? 'auto' : 'none'}
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(15,23,42,0.45)',
            zIndex: 50,
          },
          backdropStyle,
        ]}
      >
        <Pressable style={{ flex: 1 }} onPress={close} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: 0,
            width: PANEL_W,
            backgroundColor: '#0f172a',
            zIndex: 60,
            paddingTop: insets.top + 16,
          },
          panelStyle,
        ]}
      >
        {/* Brand header */}
        <View className="flex-row items-center px-5 pb-5">
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 42, height: 42, borderRadius: 10 }}
            resizeMode="contain"
          />
          <View className="ml-3 flex-1">
            <Text className="text-lg font-bold text-white" numberOfLines={1}>
              {name}
            </Text>
            <Text className="text-sm capitalize text-slate-400">
              {role ? role.replace(/_/g, ' ') : 'Maiyuri Bricks'}
            </Text>
          </View>
        </View>

        <View className="mx-5 mb-2 h-px bg-white/10" />

        <ScrollView contentContainerClassName="pb-8">
          {items.map((d) => (
            <Pressable
              key={d.key}
              android_ripple={{ color: 'rgba(255,255,255,0.10)' }}
              onPress={() => go(d.href)}
              className="mx-3 flex-row items-center rounded-xl px-4 py-3.5 active:bg-white/5"
            >
              <Icon name={d.icon} size={22} color="#cbd5e1" />
              <Text className="ml-4 text-base font-semibold text-slate-100">{d.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <Pressable
          onPress={() => {
            haptic.tap();
            close();
            setTimeout(() => useAuth.getState().signOut(), 150);
          }}
          android_ripple={{ color: 'rgba(255,255,255,0.10)' }}
          className="mx-3 mb-2 flex-row items-center rounded-xl px-4 py-3.5"
          style={{ marginBottom: insets.bottom + 8 }}
        >
          <Icon name="log-out-outline" size={22} color="#f87171" />
          <Text className="ml-4 text-base font-semibold text-red-300">Sign out</Text>
        </Pressable>
      </Animated.View>
    </>
  );
}

/** Hamburger button — drop into a screen header's left slot. */
export function DrawerButton({ tint = '#ffffff' }: { tint?: string }) {
  const setOpen = useDrawer((s) => s.setOpen);
  return (
    <Pressable
      onPress={() => {
        haptic.tap();
        setOpen(true);
      }}
      hitSlop={10}
      style={{ marginLeft: 14, padding: 4 }}
    >
      <Icon name="menu" size={26} color={tint} />
    </Pressable>
  );
}
