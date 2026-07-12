import { Link, Redirect, Tabs } from 'expo-router';
import { Image, Pressable, Text } from 'react-native';
import { useAuth } from '@/store/auth';
import { useMyProfile } from '@/hooks/use-push-settings';

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
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#ffffff',
        headerLeft: () => (
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 30, height: 30, marginLeft: 14, borderRadius: 6 }}
            resizeMode="contain"
          />
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📊</Text>,
          headerRight: () => (
            <Link href={"/onehub" as import("expo-router").Href} asChild>
              <Pressable
                style={{
                  marginRight: 14,
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: '#f97316',
                  borderRadius: 16,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#0f172a' }}>
                  🧭 OneHub
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
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👥</Text>,
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
                <Text style={{ fontSize: 20, color: '#0f172a', fontWeight: '700' }}>
                  +
                </Text>
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
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>📋</Text>,
        }}
      />
      <Tabs.Screen
        name="production"
        options={{
          href: tabHref('production'),
          title: 'Production',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🏭</Text>,
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
          href: tabHref('deliveries'),
          title: 'Deliveries',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🚚</Text>,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>⚙️</Text>,
        }}
      />
    </Tabs>
  );
}
