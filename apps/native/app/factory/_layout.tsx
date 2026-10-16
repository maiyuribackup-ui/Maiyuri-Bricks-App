import { Stack } from 'expo-router';

export default function FactoryLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '🏭 Factory Ledger' }} />
      <Stack.Screen name="production" options={{ title: 'Production Entry' }} />
      <Stack.Screen name="deliveries" options={{ title: 'Delivery Schedule' }} />
      <Stack.Screen name="labour" options={{ title: 'Labour Entry' }} />
    </Stack>
  );
}
