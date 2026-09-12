import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast, type ToastKind } from '@/lib/toast';

const STYLES: Record<ToastKind, { bg: string; icon: string }> = {
  success: { bg: 'bg-green-600', icon: '✓' },
  error: { bg: 'bg-red-600', icon: '⚠️' },
  info: { bg: 'bg-slate-800', icon: 'ℹ️' },
};

/** Single toast host — mount once near the root, above the navigator. */
export function ToastHost() {
  const { message, kind, seq, clear } = useToast();
  const insets = useSafeAreaInsets();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    translateY.setValue(20);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 180, useNativeDriver: true }),
    ]).start();

    const timer = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(
        () => clear(),
      );
    }, 2600);
    return () => clearTimeout(timer);
    // seq drives re-fire even when message text is unchanged.
  }, [seq, message]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!message) return null;
  const style = STYLES[kind];

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: insets.bottom + 70 }}
      className="items-center px-4"
    >
      <Animated.View style={{ opacity, transform: [{ translateY }] }} className="w-full max-w-md">
        <Pressable
          onPress={clear}
          className={`flex-row items-center rounded-xl ${style.bg} px-4 py-3 shadow-lg active:opacity-90`}
        >
          <Text className="mr-2 text-base text-white">{style.icon}</Text>
          <Text className="flex-1 text-sm font-semibold text-white">{message}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}
