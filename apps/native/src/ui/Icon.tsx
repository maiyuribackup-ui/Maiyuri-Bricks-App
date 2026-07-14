import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';

/**
 * Single crisp, tintable icon set for the whole app (Ionicons — native-feeling
 * on both platforms). Replaces the emoji-as-icons that made the app read like
 * a web prototype. Use semantic names below so screens don't hardcode glyphs.
 */
export type IconName = ComponentProps<typeof Ionicons>['name'];

export function Icon({
  name,
  size = 22,
  color = '#0f172a',
}: {
  name: IconName;
  size?: number;
  color?: string;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

/** Named glyphs used across the app — one place to keep them consistent. */
export const ICONS = {
  dashboard: 'grid-outline',
  leads: 'people-outline',
  plan: 'calendar-outline',
  production: 'construct-outline',
  deliveries: 'cube-outline',
  settings: 'settings-outline',
  onehub: 'compass-outline',
  expenses: 'wallet-outline',
  approvals: 'checkmark-done-outline',
  myWork: 'checkbox-outline',
  training: 'school-outline',
  ask: 'chatbubbles-outline',
  links: 'link-outline',
  checklist: 'list-outline',
  renewals: 'refresh-circle-outline',
  quote: 'document-text-outline',
  petrol: 'car-outline',
  call: 'call-outline',
  whatsapp: 'logo-whatsapp',
  navigate: 'navigate-outline',
  camera: 'camera-outline',
  add: 'add',
  chevron: 'chevron-forward',
  back: 'chevron-back',
  menu: 'menu',
  check: 'checkmark-circle',
  close: 'close-circle',
  money: 'cash-outline',
  receipt: 'receipt-outline',
  project: 'briefcase-outline',
  bell: 'notifications-outline',
  logout: 'log-out-outline',
} as const satisfies Record<string, IconName>;
