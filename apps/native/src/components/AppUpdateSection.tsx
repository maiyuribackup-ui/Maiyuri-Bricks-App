import { useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

/**
 * Which build am I actually running, and can I pull the latest?
 *
 * An OTA that fails does so invisibly: checkForAppUpdate() swallows errors to
 * console.warn, which nobody can read on a phone. Staff kept using stale code
 * with no way to tell — the app looked fine, it was just old. This makes the
 * running bundle visible and gives a manual lever that reports what happened.
 */
function Row({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between border-b border-slate-100 py-2">
      <Text className="text-xs text-slate-400">{label}</Text>
      <Text
        className="ml-3 flex-1 text-right text-xs font-medium text-ink"
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
}

export function AppUpdateSection() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  // Embedded means the bundle shipped inside the APK — no OTA has been applied.
  const updateId = Updates.updateId ?? null;
  const createdAt = Updates.createdAt
    ? new Date(Updates.createdAt).toLocaleString()
    : null;

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      if (!Updates.isEnabled) {
        setResult(
          'Updates are disabled in this build. This is a development build, so it will never receive an OTA — a preview APK is needed.',
        );
        return;
      }
      const found = await Updates.checkForUpdateAsync();
      if (!found.isAvailable) {
        setResult('Already on the latest update.');
        return;
      }
      setResult('New update found — downloading…');
      await Updates.fetchUpdateAsync();
      setResult('Downloaded. Restarting…');
      setTimeout(() => void Updates.reloadAsync(), 900);
    } catch (err) {
      // The whole point of this panel: say what went wrong, out loud.
      setResult(
        `Update check failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
      <Text className="text-base font-bold text-ink">📦 App version</Text>
      <Text className="mt-0.5 text-xs text-slate-400">
        What this phone is running, and whether anything newer is waiting.
      </Text>

      <View className="mt-3">
        <Row label="Runtime" value={Updates.runtimeVersion ?? 'unknown'} />
        <Row label="Channel" value={Updates.channel ?? 'none (dev build)'} />
        <Row
          label="Bundle"
          value={updateId ? updateId.slice(0, 8) : 'embedded (no OTA applied)'}
        />
        {createdAt ? <Row label="Published" value={createdAt} /> : null}
      </View>

      <Pressable
        disabled={busy}
        onPress={check}
        className={`mt-3 items-center rounded-lg py-2.5 ${
          busy ? 'bg-slate-200' : 'bg-brand active:opacity-80'
        }`}
      >
        {busy ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator size="small" color="#0f172a" />
            <Text className="text-sm font-semibold text-slate-500">Checking…</Text>
          </View>
        ) : (
          <Text className="text-sm font-bold text-ink">Check for updates</Text>
        )}
      </Pressable>

      {result ? (
        <Text className="mt-2 text-xs text-slate-600">{result}</Text>
      ) : null}
    </View>
  );
}
