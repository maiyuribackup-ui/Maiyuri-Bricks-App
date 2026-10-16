import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

/**
 * A shimmering placeholder block. Native apps show content-shaped skeletons
 * while loading — not a bare centered spinner (the web pattern). Compose a few
 * of these to mirror the screen that's about to appear.
 */
export function Skeleton({
  className,
  width,
  height = 16,
  rounded = 8,
}: {
  className?: string;
  width?: number | string;
  height?: number;
  rounded?: number;
}) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      className={`bg-slate-200 ${className ?? ''}`}
      style={[
        style,
        {
          width: (width as number) ?? undefined,
          height,
          borderRadius: rounded,
        },
      ]}
    />
  );
}

/** A card-shaped skeleton row — the common list-item placeholder. */
export function SkeletonCard() {
  return (
    <View
      className="mb-3 rounded-2xl bg-white p-4"
      style={{
        shadowColor: '#0f172a',
        shadowOpacity: 0.05,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 3 },
        elevation: 1,
      }}
    >
      <View className="flex-row items-center justify-between">
        <Skeleton width={160} height={16} />
        <Skeleton width={60} height={16} />
      </View>
      <Skeleton className="mt-3" width={220} height={12} />
      <Skeleton className="mt-2" width={120} height={12} />
    </View>
  );
}

/** N skeleton cards — drop straight into a loading branch. */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View className="p-4">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}
