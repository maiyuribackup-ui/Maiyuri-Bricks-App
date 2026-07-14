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
  ...rest
}: ViewProps & { children: ReactNode; className?: string; padded?: boolean }) {
  return (
    <View
      className={`rounded-2xl bg-white ${padded ? 'p-4' : ''} ${className ?? ''}`}
      style={{
        // Cross-platform soft shadow (iOS) + elevation (Android).
        shadowColor: '#0f172a',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 4 },
        elevation: 2,
      }}
      {...rest}
    >
      {children}
    </View>
  );
}
