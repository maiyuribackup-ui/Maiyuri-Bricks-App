import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Fail loud in dev — a misconfigured client is worse than a clear error.
  throw new Error(
    'Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Copy apps/native/.env.example to apps/native/.env and fill them in.',
  );
}

/**
 * Supabase client for React Native.
 *
 * Sessions are persisted in AsyncStorage. We intentionally do NOT use
 * expo-secure-store here: SecureStore has a ~2KB per-value limit and Supabase
 * sessions can exceed it, causing silent auth failures. If you need encrypted
 * at-rest storage, swap in a chunking SecureStore adapter (see README).
 *
 * detectSessionInUrl is false because there is no browser URL in a native app.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
