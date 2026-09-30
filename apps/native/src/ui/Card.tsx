import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

/**
 * Native surface with soft elevation instead of a hairline slate border —
 * the app leans on depth + spacing (native) rather than outlined boxes (web).
 */
export function Card({
  children,
  className,
  padded = true,
  style,
  ...rest
}: ViewProps & { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <View
      className={`rounded-2xl bg-white ${padded ? 'p-4' : ''} ${className ?? ''}`}
      // Passed style is MERGED after the shadow so callers can reliably
      // override e.g. backgroundColor — a `bg-ink` in className can lose the
      // conflict with our own `bg-white` depending on compiled class order
      // (this made the OneHub "My Work" accent card render white-on-white).
      style={[
        {
          // Cross-platform soft shadow (iOS) + elevation (Android).
          shadowColor: '#0f172a',
          shadowOpacity: 0.06,
          shadowRadius: 12,
          shadowOffset: { width: 0, height: 4 },
          elevation: 2,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}
