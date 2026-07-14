import { type ReactNode } from 'react';
import { Platform, Pressable, type PressableProps } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { haptic } from './haptics';

/**
 * The one touchable to rule them all: native press feedback everywhere.
 * - Android: material ripple (inner Pressable)
 * - iOS: subtle press-scale (reanimated) + opacity
 * - a light haptic tap on press (opt out with `haptics={false}`)
 *
 * Drop-in for Pressable. Replaces the web-style `active:opacity-70` fade that
 * made every button in the app feel "dead". Put your visual classes (bg,
 * padding, rounded) on `className` as usual.
 */
export function Touchable({
  children,
  className,
  onPress,
  haptics = true,
  rippleColor = 'rgba(15,23,42,0.12)',
  disabled,
  ...rest
}: PressableProps & {
  children: ReactNode;
  className?: string;
  haptics?: boolean;
  rippleColor?: string;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Animated.View style={animStyle}>
      <Pressable
        className={`overflow-hidden ${className ?? ''}`}
        disabled={disabled}
        android_ripple={
          disabled ? undefined : { color: rippleColor, foreground: true }
        }
        onPressIn={() => {
          scale.value = withTiming(0.97, { duration: 90 });
        }}
        onPressOut={() => {
          scale.value = withTiming(1, { duration: 130 });
        }}
        onPress={(e) => {
          if (haptics && !disabled) haptic.tap();
          onPress?.(e);
        }}
        style={({ pressed }) =>
          Platform.OS === 'ios' && pressed ? { opacity: 0.85 } : null
        }
        {...rest}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
