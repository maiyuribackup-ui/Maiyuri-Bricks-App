import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSaveLabour } from '@/hooks/use-factory';
import { WORK_TYPES } from '@/lib/factory';

const todayISO = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// Labour & wages entry. Advance = qty 1 × negative amount so the weekly sum
// nets out automatically.
export default function FactoryLabourEntry() {
  const save = useSaveLabour();
  const [worker, setWorker] = useState('');
  const [workType, setWorkType] = useState<string>('Loading');
  const [qty, setQty] = useState('');
  const [rate, setRate] = useState('');
  const [notes, setNotes] = useState('');
  const isAdvance = workType === 'Advance';

  const submit = () => {
    save.mutate(
      {
        work_date: todayISO(),
        worker: worker.trim(),
        work_type: workType,
        qty: isAdvance ? 1 : Number(qty.replace(/[,\s]/g, '')),
        rate: isAdvance
          ? -Math.abs(Number(rate.replace(/[,\s]/g, '')))
          : Number(rate.replace(/[,\s]/g, '')),
        notes: notes.trim() || null,
      },
      {
        onSuccess: () => {
          setQty('');
          setRate('');
          setNotes('');
        },
      },
    );
  };

  return (
    <ScrollView className="flex-1 bg-canvas" contentContainerClassName="p-4 pb-10">
      <Text className="mb-2 text-sm font-bold text-ink">Today · {todayISO()}</Text>

      <TextInput
        value={worker}
        onChangeText={setWorker}
        placeholder="Worker / team name"
        placeholderTextColor="#94a3b8"
        className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
      />

      <Text className="mb-1 mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
        Work type
      </Text>
      <View className="flex-row flex-wrap gap-1.5">
        {WORK_TYPES.map((t) => (
          <Pressable
            key={t}
            onPress={() => setWorkType(t)}
            className={`rounded-full px-3 py-1.5 ${
              workType === t ? 'bg-ink' : 'bg-slate-200'
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                workType === t ? 'text-white' : 'text-slate-600'
              }`}
            >
              {t}
            </Text>
          </Pressable>
        ))}
      </View>

      <View className="mt-3 flex-row gap-2">
        {!isAdvance ? (
          <TextInput
            value={qty}
            onChangeText={setQty}
            keyboardType="numeric"
            placeholder="Qty (bricks / days)"
            placeholderTextColor="#94a3b8"
            className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
          />
        ) : null}
        <TextInput
          value={rate}
          onChangeText={setRate}
          keyboardType="numeric"
          placeholder={isAdvance ? 'Advance amount ₹' : 'Rate ₹/unit'}
          placeholderTextColor="#94a3b8"
          className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
        />
      </View>
      {isAdvance ? (
        <Text className="mt-1 text-xs text-slate-400">
          Advances are recorded as negative amounts and deducted from the week's
          net payable automatically.
        </Text>
      ) : null}

      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Notes (optional)"
        placeholderTextColor="#94a3b8"
        multiline
        className="mt-3 min-h-[60px] rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-ink"
      />

      <Pressable
        onPress={submit}
        disabled={
          save.isPending || !worker.trim() || rate.trim() === '' || (!isAdvance && qty.trim() === '')
        }
        className={`mt-4 items-center rounded-xl py-3 ${
          save.isPending || !worker.trim() || rate.trim() === ''
            ? 'bg-slate-200'
            : 'bg-brand active:opacity-80'
        }`}
      >
        {save.isPending ? (
          <ActivityIndicator size="small" color="#0f172a" />
        ) : (
          <Text className="font-bold text-ink">
            {isAdvance ? 'Record advance' : 'Save labour entry'}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
