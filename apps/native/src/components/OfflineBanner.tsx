import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsOnline } from '@/lib/offline';

/**
 * Global connectivity banner. When offline, writes queue and sync later —
 * this tells the user that's happening instead of leaving them guessing
 * (audit #10: no offline indication anywhere).
 */
export function OfflineBanner() {
  const online = useIsOnline();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <View
      style={{ paddingTop: insets.top }}
      className="items-center bg-amber-500"
    >
      <Text className="px-3 py-1.5 text-xs font-bold text-white">
        📴 Offline — your saves are queued and will sync when connected
      </Text>
    </View>
  );
}
