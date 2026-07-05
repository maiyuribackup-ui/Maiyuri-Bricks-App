import { Stack } from 'expo-router';

export default function OneHubLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Stack.Screen name="index" options={{ title: '🧭 Maiyuri OneHub' }} />
      <Stack.Screen name="department/[dept]" options={{ title: 'SOPs' }} />
      <Stack.Screen name="sop/[slug]" options={{ title: 'SOP' }} />
      <Stack.Screen name="edit/[slug]" options={{ title: 'Edit SOP', presentation: 'modal' }} />
      <Stack.Screen name="links" options={{ title: 'Important Links' }} />
      <Stack.Screen name="checklists" options={{ title: 'New Joiners' }} />
      <Stack.Screen name="checklist/[id]" options={{ title: 'Checklist' }} />
      <Stack.Screen name="ask" options={{ title: 'Ask Mayur' }} />
    </Stack>
  );
}
