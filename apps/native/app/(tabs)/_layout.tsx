import { Link, Redirect, Tabs } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { useAuth } from '@/store/auth';
import { useMyProfile } from '@/hooks/use-push-settings';
import { Icon, type IconName } from '@/ui/Icon';
import { DrawerButton } from '@/ui/NavDrawer';

const tabIcon =
  (name: IconName) =>
  ({ color, focused }: { color: string; focused: boolean }) => (
    <Icon name={name} size={focused ? 25 : 23} color={color} />
  );

/**
 * Role → visible tabs, mirroring the web sidebar's roleModuleAccess.
 * Before this map existed every role saw every tab — a driver could open
 * Plan and activate a production plan (security audit, blocker S4).
 * Until the profile loads we show the safe minimum; the profile query is
 * cache-persisted so returning users see their full tabs instantly.
 */
const TAB_ACCESS: Record<string, string[]> = {
  founder: ['index', 'leads', 'plan', 'production', 'deliveries', 'settings'],
  owner: ['index', 'leads', 'plan', 'production', 'deliveries', 'settings'],
  production_supervisor: ['index', 'plan', 'production', 'deliveries', 'settings'],
  sales: ['index', 'leads', 'settings'],
  driver: ['index', 'deliveries', 'settings'],
  accountant: ['index', 'leads', 'settings'],
  engineer: ['index', 'leads', 'production', 'settings'],
};
const DEFAULT_TABS = ['index', 'settings'];

export default function TabsLayout() {
  const { session, initializing } = useAuth();
  const profile = useMyProfile(session?.user?.id);

  // Guard the authenticated area.
  if (!initializing && !session) return <Redirect href="/(auth)/login" />;

  const role = (profile.data?.data.role as string | undefined) ?? '';
  const visible = TAB_ACCESS[role] ?? DEFAULT_TABS;
  // Hidden tabs get href:null — removed from the bar AND unreachable by URL.
  const tabHref = (name: string) => (visible.includes(name) ? undefined : null);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#f97316',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#eceff3',
          height: 62,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700', fontSize: 19 },
        // Hamburger opens the native left drawer (also swipe from the edge).
        headerLeft: () => <DrawerButton />,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: tabIcon('grid-outline'),
          headerRight: () => (
            <Link href={"/onehub" as import("expo-router").Href} asChild>
              <Pressable
                style={{
                  marginRight: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 5,
                  backgroundColor: '#f97316',
                  borderRadius: 16,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                }}
              >
                <Icon name="compass-outline" size={16} color="#0f172a" />
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>
                  OneHub
                </Text>
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          href: tabHref('leads'),
          title: 'Leads',
          tabBarIcon: tabIcon('people-outline'),
          headerRight: () => (
            <Link href="/leads/new" asChild>
              <Pressable
                style={{
                  marginRight: 14,
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: '#f97316',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Icon name="add" size={22} color="#0f172a" />
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          href: tabHref('plan'),
          title: 'Plan',
          tabBarIcon: tabIcon('calendar-outline'),
        }}
      />
      <Tabs.Screen
        name="production"
        options={{
          href: tabHref('production'),
          title: 'Production',
          tabBarIcon: tabIcon('construct-outline'),
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          href: tabHref('deliveries'),
          title: 'Deliveries',
          tabBarIcon: tabIcon('cube-outline'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: tabIcon('settings-outline'),
        }}
      />
    </Tabs>
  );
}
