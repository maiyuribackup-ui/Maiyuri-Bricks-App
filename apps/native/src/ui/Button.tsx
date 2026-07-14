import { type ReactNode } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Icon, type IconName } from './Icon';
import { Touchable } from './Touchable';

type Variant = 'primary' | 'dark' | 'success' | 'danger' | 'outline' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const VARIANT: Record<Variant, { bg: string; text: string; ripple?: string }> = {
  primary: { bg: 'bg-brand', text: 'text-ink' },
  dark: { bg: 'bg-ink', text: 'text-white', ripple: 'rgba(255,255,255,0.16)' },
  success: { bg: 'bg-green-500', text: 'text-white', ripple: 'rgba(255,255,255,0.18)' },
  danger: { bg: 'bg-red-500', text: 'text-white', ripple: 'rgba(255,255,255,0.18)' },
  outline: { bg: 'border border-slate-200 bg-white', text: 'text-slate-700' },
  ghost: { bg: '', text: 'text-slate-600' },
};
const SIZE: Record<Size, { pad: string; text: string; icon: number }> = {
  sm: { pad: 'px-3.5 py-2', text: 'text-sm', icon: 16 },
  md: { pad: 'px-4 py-3', text: 'text-base', icon: 18 },
  lg: { pad: 'py-4 px-5', text: 'text-lg', icon: 20 },
};

/**
 * The standard app button — tactile (ripple + scale + haptic via Touchable),
 * with consistent sizing, an optional leading icon, and a loading state.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  loading,
  disabled,
  full = true,
  className,
  children,
}: {
  label?: string;
  onPress?: () => void;
  variant?: Variant;
  size?: Size;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  full?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  const isDisabled = disabled || loading;
  const textColor =
    v.text === 'text-white'
      ? '#ffffff'
      : v.text === 'text-ink'
        ? '#0f172a'
        : '#334155';

  return (
    <Touchable
      onPress={onPress}
      disabled={isDisabled}
      rippleColor={v.ripple}
      className={`flex-row items-center justify-center rounded-2xl ${s.pad} ${
        isDisabled ? 'bg-slate-200' : v.bg
      } ${className ?? ''}`}
    >
      {loading ? (
        <ActivityIndicator color={textColor} />
      ) : (
        <View className="flex-row items-center gap-2">
          {icon ? <Icon name={icon} size={s.icon} color={isDisabled ? '#94a3b8' : textColor} /> : null}
          {label ? (
            <Text
              className={`font-bold ${s.text} ${isDisabled ? 'text-slate-400' : v.text}`}
            >
              {label}
            </Text>
          ) : null}
          {children}
        </View>
      )}
    </Touchable>
  );
}
