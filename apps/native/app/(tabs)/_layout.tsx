import { Redirect, Tabs } from 'expo-router';
import { Image, Text } from 'react-native';
import { useAuth } from '@/store/auth';

export default function TabsLayout() {
  const { session, initializing } = useAuth();

  // Guard the authenticated area.
  if (!initializing && !session) return <Redirect href="/(auth)/login" />;

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
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          title: 'Leads',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>👥</Text>,
        }}
      />
      <Tabs.Screen
        name="production"
        options={{
          title: 'Production',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 18 }}>🏭</Text>,
        }}
      />
      <Tabs.Screen
        name="deliveries"
        options={{
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
