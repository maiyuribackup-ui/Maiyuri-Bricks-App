import { Redirect } from 'expo-router';
import { useState } from 'react';
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
import { useAuth } from '@/store/auth';

export default function LoginScreen() {
  const { session, signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (session) return <Redirect href="/(tabs)" />;

  const onSubmit = async () => {
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
      // Navigation happens automatically via the auth listener + index gate.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign in failed');
    } finally {
      setLoading(false);
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

          {error ? (
            <Text className="text-sm text-red-400">{error}</Text>
          ) : null}

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
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
