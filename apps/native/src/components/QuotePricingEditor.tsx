import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import type { SmartQuote, SmartQuoteLineItem } from '@maiyuri/shared';
import { toast } from '@/lib/toast';
import { useQuotableProducts, useSaveQuotePricing } from '@/hooks/use-smart-quote';

/** A line being edited. Strings, because a half-typed number is not a number. */
interface DraftLine {
  productId: string | null;
  quantity: string;
  rate: string;
}

const inr = (n: number) => 'Rs. ' + Math.round(n).toLocaleString('en-IN');

function toDraft(quote: SmartQuote | null): DraftLine[] {
  const pricing = quote?.pricing_config;
  const items = pricing?.items;
  if (items?.length) {
    return items.map((i) => ({
      productId: i.product_id,
      quantity: String(i.quantity),
      rate: String(i.rate),
    }));
  }
  // A quote written before multi-product still has its single line here.
  if (pricing?.default_product) {
    return [
      {
        productId: pricing.default_product,
        quantity: pricing.default_area_sqft != null ? String(pricing.default_area_sqft) : '',
        rate: pricing.quoted_rate != null ? String(pricing.quoted_rate) : '',
      },
    ];
  }
  return [{ productId: null, quantity: '', rate: '' }];
}

/**
 * The engineer's price, set on the phone.
 *
 * This is the number the customer sees, so it is entered where the
 * conversation happens — standing on the plot — rather than back at a desk.
 * The quote stays unshareable until every line is priced.
 */
export function QuotePricingEditor({
  quote,
  leadId,
  onSaved,
}: {
  quote: SmartQuote;
  leadId: string;
  onSaved?: () => void;
}) {
  const { data: products, isLoading: loadingProducts } = useQuotableProducts();
  const save = useSaveQuotePricing(leadId);

  const [lines, setLines] = useState<DraftLine[]>(() => toDraft(quote));
  const [distance, setDistance] = useState(
    quote.pricing_config?.default_distance_km != null
      ? String(quote.pricing_config.default_distance_km)
      : '',
  );

  const update = (i: number, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  const total = useMemo(
    () =>
      lines.reduce((sum, l) => {
        const q = Number(l.quantity);
        const r = Number(l.rate);
        return sum + (q > 0 && r > 0 ? q * r : 0);
      }, 0),
    [lines],
  );

  const nameOf = (id: string | null) =>
    products?.find((p) => p.id === id)?.name ?? 'Choose product';

  function onSave() {
    const items: SmartQuoteLineItem[] = [];
    for (const [i, l] of lines.entries()) {
      const quantity = Number(l.quantity);
      const rate = Number(l.rate);
      if (!l.productId) return toast.error(`Line ${i + 1}: choose a product`);
      if (!(quantity > 0)) return toast.error(`Line ${i + 1}: enter a quantity`);
      if (!(rate > 0)) return toast.error(`Line ${i + 1}: enter a rate`);
      items.push({ product_id: l.productId, quantity, rate });
    }

    save.mutate(
      { quoteId: quote.id, items, distanceKm: distance ? Number(distance) : null },
      {
        onSuccess: () => {
          toast.success('Pricing saved');
          onSaved?.();
        },
        onError: (e) => toast.error(e instanceof Error ? e.message : 'Save failed'),
      },
    );
  }

  return (
    <View className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <Text className="text-sm font-bold text-ink">Set the price</Text>
      <Text className="mt-0.5 text-xs text-slate-400">
        Your rate is the quoted price — the rate card is not used.
      </Text>

      {loadingProducts ? (
        <ActivityIndicator size="small" color="#94a3b8" className="mt-3" />
      ) : null}

      {lines.map((line, i) => (
        <View key={i} className="mt-3 rounded-lg border border-slate-200 bg-white p-2.5">
          <View className="flex-row items-center justify-between">
            <Text className="text-xs font-semibold text-slate-500">Line {i + 1}</Text>
            {lines.length > 1 ? (
              <Pressable
                onPress={() => setLines((prev) => prev.filter((_, n) => n !== i))}
                className="px-2 py-0.5 active:opacity-60"
              >
                <Text className="text-xs font-medium text-red-500">Remove</Text>
              </Pressable>
            ) : null}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-2">
            <View className="flex-row gap-1.5">
              {(products ?? []).map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => update(i, { productId: p.id })}
                  className={`rounded-full border px-3 py-1.5 ${
                    line.productId === p.id
                      ? 'border-brand bg-brand/10'
                      : 'border-slate-200 bg-white'
                  }`}
                >
                  <Text
                    className={`text-xs ${
                      line.productId === p.id ? 'font-bold text-ink' : 'text-slate-600'
                    }`}
                  >
                    {p.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>

          <View className="mt-2 flex-row gap-2">
            <View className="flex-1">
              <Text className="text-[10px] font-medium uppercase text-slate-400">Quantity</Text>
              <TextInput
                value={line.quantity}
                onChangeText={(v) => update(i, { quantity: v.replace(/[^0-9.]/g, '') })}
                keyboardType="numeric"
                placeholder="40000"
                className="mt-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-ink"
              />
            </View>
            <View className="flex-1">
              <Text className="text-[10px] font-medium uppercase text-slate-400">
                Rate (₹ per unit)
              </Text>
              <TextInput
                value={line.rate}
                onChangeText={(v) => update(i, { rate: v.replace(/[^0-9.]/g, '') })}
                keyboardType="numeric"
                placeholder="52"
                className="mt-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-semibold text-ink"
              />
            </View>
          </View>

          {Number(line.quantity) > 0 && Number(line.rate) > 0 ? (
            <Text className="mt-1.5 text-xs text-slate-500">
              {nameOf(line.productId)} · {inr(Number(line.quantity) * Number(line.rate))}
            </Text>
          ) : null}
        </View>
      ))}

      <Pressable
        onPress={() =>
          setLines((prev) => [...prev, { productId: null, quantity: '', rate: '' }])
        }
        className="mt-2 items-center rounded-lg border border-dashed border-slate-300 py-2 active:opacity-70"
      >
        <Text className="text-xs font-semibold text-slate-500">+ Add another product</Text>
      </Pressable>

      <View className="mt-3">
        <Text className="text-[10px] font-medium uppercase text-slate-400">
          Delivery distance (km)
        </Text>
        <TextInput
          value={distance}
          onChangeText={(v) => setDistance(v.replace(/[^0-9.]/g, ''))}
          keyboardType="numeric"
          placeholder="108"
          className="mt-1 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm text-ink"
        />
      </View>

      {total > 0 ? (
        <View className="mt-3 flex-row items-center justify-between rounded-lg bg-ink px-3 py-2.5">
          <Text className="text-xs font-medium text-white/70">Total</Text>
          <Text className="text-base font-bold text-white">{inr(total)}</Text>
        </View>
      ) : null}

      <Pressable
        disabled={save.isPending}
        onPress={onSave}
        className={`mt-3 items-center rounded-lg py-2.5 ${
          save.isPending ? 'bg-slate-200' : 'bg-brand active:opacity-80'
        }`}
      >
        <Text className="text-sm font-bold text-ink">
          {save.isPending ? 'Saving…' : 'Save pricing'}
        </Text>
      </Pressable>
    </View>
  );
}
