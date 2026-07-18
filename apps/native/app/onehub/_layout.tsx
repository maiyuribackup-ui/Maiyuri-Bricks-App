import { Stack } from 'expo-router';
import { DrawerButton } from '@/ui/NavDrawer';

export default function OneHubLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#0f172a' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: '700', fontSize: 19 },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'Maiyuri OneHub', headerLeft: () => <DrawerButton /> }}
      />
      <Stack.Screen name="my-work/index" options={{ title: '✅ My Work' }} />
      <Stack.Screen name="my-work/[id]" options={{ title: 'Work Item' }} />
      <Stack.Screen
        name="my-work/new"
        options={{ title: 'Assign Work', presentation: 'modal' }}
      />
      <Stack.Screen name="approvals" options={{ title: '👀 Approvals' }} />
      <Stack.Screen name="daily-report" options={{ title: '📊 Daily Report' }} />
      <Stack.Screen name="expenses/index" options={{ title: '💰 My Expenses' }} />
      <Stack.Screen
        name="expenses/new"
        options={{ title: 'Add Expense', presentation: 'modal' }}
      />
      <Stack.Screen name="department/[dept]" options={{ title: 'SOPs' }} />
      <Stack.Screen name="sop/[slug]" options={{ title: 'SOP' }} />
      <Stack.Screen name="edit/[slug]" options={{ title: 'Edit SOP', presentation: 'modal' }} />
      <Stack.Screen name="links" options={{ title: 'Important Links' }} />
      <Stack.Screen name="checklists" options={{ title: 'New Joiners' }} />
      <Stack.Screen name="checklist/[id]" options={{ title: 'Checklist' }} />
      <Stack.Screen name="ask" options={{ title: 'Ask Mayur' }} />
      <Stack.Screen name="training" options={{ title: '🎓 Training' }} />
    </Stack>
  );
}
