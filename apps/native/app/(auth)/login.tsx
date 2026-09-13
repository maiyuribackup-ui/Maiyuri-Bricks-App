import AsyncStorage from '@react-native-async-storage/async-storage';
import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '@/lib/api';
import { useAuth } from '@/store/auth';

const EMAIL_KEY = 'mb.login.email';

export default function LoginScreen() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  // Remember the last-used email so staff only type their password.
  useEffect(() => {
    void AsyncStorage.getItem(EMAIL_KEY).then((saved) => {
      if (saved) setEmail((current) => current || saved);
    });
  }, []);

  if (session) return <Redirect href="/(tabs)" />;

  const onSubmit = async () => {
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await signIn(email, password);
      void AsyncStorage.setItem(EMAIL_KEY, email.trim());
      // Navigation happens automatically via the auth listener + index gate.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const onForgotPassword = async () => {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError('Enter your email above first, then tap Forgot password.');
      return;
    }
    setResetting(true);
    try {
      await api.post('/api/auth/forgot-password', { email: email.trim() });
    } catch {
      // Deliberately ignored — same neutral message either way (no
      // account-enumeration, and the endpoint always claims success anyway).
    } finally {
      setResetting(false);
      setInfo('If an account exists for that email, a reset link has been sent.');
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-ink">
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        className="flex-1 justify-center px-6"
      >
        <View className="mb-10 items-center">
          <Image
            source={require('../../assets/logo.png')}
            style={{ width: 96, height: 96, borderRadius: 20 }}
            resizeMode="contain"
          />
          <Text className="mt-4 text-3xl font-bold text-white">Maiyuri Bricks</Text>
          <Text className="mt-1 text-base text-slate-400">
            AI Lead Management
          </Text>
        </View>

        <View className="gap-4">
          <View>
            <Text className="mb-1 text-sm text-slate-300">Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              placeholder="you@example.com"
              placeholderTextColor="#64748b"
              className="rounded-xl bg-slate-800 px-4 py-3 text-white"
            />
          </View>

          <View>
            <Text className="mb-1 text-sm text-slate-300">Password</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="••••••••"
              placeholderTextColor="#64748b"
              className="rounded-xl bg-slate-800 px-4 py-3 text-white"
            />
          </View>

          {error ? <Text className="text-sm text-red-400">{error}</Text> : null}
          {info ? <Text className="text-sm text-emerald-400">{info}</Text> : null}

          <Pressable
            onPress={onSubmit}
            disabled={loading}
            className="mt-2 items-center rounded-xl bg-brand py-3.5 active:opacity-80"
          >
            {loading ? (
              <ActivityIndicator color="#0f172a" />
            ) : (
              <Text className="text-base font-semibold text-ink">Sign in</Text>
            )}
          </Pressable>

          <Pressable
            onPress={onForgotPassword}
            disabled={resetting}
            className="items-center py-2 active:opacity-70"
          >
            <Text className="text-sm text-slate-400">
              {resetting ? 'Sending reset link…' : 'Forgot password?'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
