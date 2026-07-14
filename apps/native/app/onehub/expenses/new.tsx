import type { ExpenseType, ExpenseVehicleRate, Lead, Project } from '@maiyuri/shared';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useCreateExpense, useMyExpenses, useUploadReceipt } from '@/hooks/use-expenses';
import { toast } from '@/lib/toast';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className={`mb-2 mr-2 rounded-full px-3 py-1.5 ${
        active ? 'bg-ink' : 'border border-slate-200 bg-white'
      }`}
    >
      <Text className={`text-xs font-medium ${active ? 'text-white' : 'text-slate-600'}`}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function NewExpense() {
  const router = useRouter();
  const { data: mine } = useMyExpenses();
  const create = useCreateExpense();
  const uploadReceipt = useUploadReceipt();

  const types = mine?.data?.types ?? [];
  const rates = mine?.data?.vehicleRates ?? [];
  const balance = mine?.data?.balance ?? 0;

  const projects = useQuery({
    queryKey: ['projects', 'picker'],
    queryFn: () => api.get<Project[]>('/api/projects'),
  });
  const leads = useQuery({
    queryKey: ['leads', 'picker'],
    queryFn: () => api.get<Lead[]>('/api/leads', { limit: 50 }),
  });

  const [typeId, setTypeId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [projectId, setProjectId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [receiptUri, setReceiptUri] = useState<string | null>(null);
  // petrol
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [leadId, setLeadId] = useState<string | null>(null);
  const [customer, setCustomer] = useState('');
  const [fromLoc, setFromLoc] = useState('');
  const [toLoc, setToLoc] = useState('');
  const [km, setKm] = useState('');

  const type = types.find((t) => t.id === typeId) as ExpenseType | undefined;
  const isPetrol = type?.kind === 'petrol';
  const vehicle = rates.find((r) => r.id === vehicleId) as
    | ExpenseVehicleRate
    | undefined;

  const petrolAmount = useMemo(() => {
    if (!isPetrol || !vehicle || !Number(km)) return 0;
    return Math.round(Number(vehicle.per_km_rate) * Number(km) * 100) / 100;
  }, [isPetrol, vehicle, km]);

  const effectiveAmount = isPetrol ? petrolAmount : Number(amount) || 0;

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchCameraAsync({ quality: 0.4 });
    if (!res.canceled && res.assets?.[0]?.uri) setReceiptUri(res.assets[0].uri);
  };

  const submit = async () => {
    if (!type) return toast.error('Pick an expense type');
    if (type.requires_project && !projectId) return toast.error('Pick a project');
    if (isPetrol) {
      if (!vehicleId) return toast.error('Pick a vehicle');
      if (!Number(km)) return toast.error('Enter kilometres');
    } else if (!Number(amount)) {
      return toast.error('Enter an amount');
    }
    if (effectiveAmount > balance) {
      return toast.error(`Over balance — you have ${inr(balance)}`);
    }

    // Upload the receipt first (if any), then create the claim with its path.
    let receiptPath: string | null = null;
    if (receiptUri) {
      try {
        const up = await uploadReceipt.mutateAsync(receiptUri);
        receiptPath = up.path;
      } catch (e) {
        return toast.error(e instanceof Error ? e.message : 'Receipt upload failed');
      }
    }

    create.mutate(
      {
        expense_type_id: type.id,
        project_id: projectId ?? undefined,
        description: description.trim() || undefined,
        receipt_url: receiptPath ?? undefined,
        ...(isPetrol
          ? {
              vehicle_rate_id: vehicleId ?? undefined,
              km: Number(km),
              lead_id: leadId ?? undefined,
              customer_name: customer.trim() || undefined,
              from_location: fromLoc.trim() || undefined,
              to_location: toLoc.trim() || undefined,
            }
          : { amount: Number(amount) }),
      },
      {
        onSuccess: () => {
          toast.success('Expense submitted ✅');
          router.back();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
      },
    );
  };

  const busy = create.isPending || uploadReceipt.isPending;

  return (
    <ScrollView className="flex-1 bg-slate-50" contentContainerClassName="p-4 pb-16">
      <Text className="mb-1 text-xs text-slate-400">
        Available balance {inr(balance)}
      </Text>

      <Text className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Expense type
      </Text>
      <View className="flex-row flex-wrap">
        {types.map((t) => (
          <Chip
            key={t.id}
            label={`${t.icon ?? ''} ${t.name}`}
            active={typeId === t.id}
            onPress={() => setTypeId(t.id)}
          />
        ))}
      </View>

      {isPetrol ? (
        <>
          <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Vehicle
          </Text>
          <View className="flex-row flex-wrap">
            {rates.map((r) => (
              <Chip
                key={r.id}
                label={`${r.label} · ₹${r.per_km_rate}/km`}
                active={vehicleId === r.id}
                onPress={() => setVehicleId(r.id)}
              />
            ))}
          </View>

          <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Customer (optional)
          </Text>
          <View className="flex-row flex-wrap">
            {(leads.data?.data ?? []).slice(0, 12).map((l) => (
              <Chip
                key={l.id}
                label={l.name}
                active={leadId === l.id}
                onPress={() => {
                  setLeadId(leadId === l.id ? null : l.id);
                  setCustomer('');
                }}
              />
            ))}
          </View>
          {!leadId ? (
            <TextInput
              value={customer}
              onChangeText={setCustomer}
              placeholder="…or type a customer name"
              placeholderTextColor="#94a3b8"
              className="mt-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
            />
          ) : null}

          <View className="mt-3 flex-row gap-2">
            <TextInput
              value={fromLoc}
              onChangeText={setFromLoc}
              placeholder="From"
              placeholderTextColor="#94a3b8"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
            />
            <TextInput
              value={toLoc}
              onChangeText={setToLoc}
              placeholder="To"
              placeholderTextColor="#94a3b8"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
            />
          </View>
          <TextInput
            value={km}
            onChangeText={setKm}
            keyboardType="numeric"
            placeholder="Kilometres"
            placeholderTextColor="#94a3b8"
            className="mt-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
          />
          <View className="mt-2 rounded-xl bg-orange-50 p-3">
            <Text className="text-sm font-semibold text-orange-800">
              {vehicle && Number(km)
                ? `${km} km × ₹${vehicle.per_km_rate}/km = ${inr(petrolAmount)}`
                : 'Pick a vehicle and enter km to see the amount'}
            </Text>
          </View>
        </>
      ) : (
        <>
          <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Amount ₹
          </Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            keyboardType="numeric"
            placeholder="Amount"
            placeholderTextColor="#94a3b8"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
          />
        </>
      )}

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Project {type?.requires_project ? '(required)' : '(optional)'}
      </Text>
      <View className="flex-row flex-wrap">
        <Chip label="None" active={projectId === null} onPress={() => setProjectId(null)} />
        {(projects.data?.data ?? []).map((p) => (
          <Chip
            key={p.id}
            label={p.name}
            active={projectId === p.id}
            onPress={() => setProjectId(p.id)}
          />
        ))}
      </View>

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Notes
      </Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="What was this for?"
        placeholderTextColor="#94a3b8"
        multiline
        className="min-h-[60px] rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-ink"
      />

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wider text-slate-400">
        Receipt
      </Text>
      {receiptUri ? (
        <Pressable onPress={() => setReceiptUri(null)}>
          <Image
            source={{ uri: receiptUri }}
            style={{ width: 96, height: 96, borderRadius: 10 }}
          />
          <Text className="mt-1 text-xs text-slate-400">Tap to remove</Text>
        </Pressable>
      ) : (
        <Pressable
          onPress={takePhoto}
          className="h-[80px] w-[80px] items-center justify-center rounded-xl border-2 border-dashed border-slate-300 active:opacity-70"
        >
          <Text className="text-2xl">📷</Text>
        </Pressable>
      )}

      <Pressable
        onPress={submit}
        disabled={busy}
        className={`mt-6 items-center rounded-xl py-3.5 ${
          busy ? 'bg-slate-200' : 'bg-brand active:opacity-80'
        }`}
      >
        {busy ? (
          <ActivityIndicator color="#0f172a" />
        ) : (
          <Text className="text-base font-bold text-ink">
            Submit {effectiveAmount > 0 ? inr(effectiveAmount) : ''}
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}
