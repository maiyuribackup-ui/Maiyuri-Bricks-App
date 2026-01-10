'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, Button, Spinner } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import type { Lead, Product, Estimate, EstimateItemInput } from '@maiyuri/shared';
import {
  useProducts,
  useFactorySettings,
  useCreateEstimate,
  useCalculateDistance,
  useQuickDiscountSuggestion,
  calculateEstimateSummary,
} from '@/hooks/useEstimates';
import { ProductSelector } from './ProductSelector';
import { DeliveryLocationInput } from './DeliveryLocationInput';
import { DiscountSection } from './DiscountSection';
import { EstimateSummary } from './EstimateSummary';

interface PriceEstimatorPanelProps {
  lead: Lead;
  isOpen: boolean;
  onClose: () => void;
  onEstimateCreated?: (estimate: Estimate) => void;
}

interface LineItem {
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
}

export function PriceEstimatorPanel({
  lead,
  isOpen,
  onClose,
  onEstimateCreated,
}: PriceEstimatorPanelProps) {
  const { data: productsData, isLoading: productsLoading } = useProducts();
  const { data: factoryData } = useFactorySettings();
  const createMutation = useCreateEstimate();
  const calculateDistanceMutation = useCalculateDistance();
  const quickDiscountMutation = useQuickDiscountSuggestion();

  // Form state
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryLat, setDeliveryLat] = useState<number | null>(null);
  const [deliveryLng, setDeliveryLng] = useState<number | null>(null);
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const [transportCost, setTransportCost] = useState(0);
  const [discountPercentage, setDiscountPercentage] = useState(0);
  const [discountReason, setDiscountReason] = useState('');
  const [notes, setNotes] = useState('');
  const [aiSuggestion, setAiSuggestion] = useState<{
    percentage: number;
    reasoning: string;
    confidence: number;
  } | null>(null);

  const products = productsData?.data || [];
  const factorySettings = factoryData?.data;

  // Calculate summary
  const summary = useMemo(() => {
    return calculateEstimateSummary(
      lineItems.map((item) => ({
        quantity: item.quantity,
        unit_price: item.unitPrice,
      })),
      transportCost,
      discountPercentage
    );
  }, [lineItems, transportCost, discountPercentage]);

  // Handle distance calculation
  const handleLocationSelect = async (
    lat: number,
    lng: number,
    address: string
  ) => {
    setDeliveryAddress(address);
    setDeliveryLat(lat);
    setDeliveryLng(lng);

    if (factorySettings) {
      try {
        const result = await calculateDistanceMutation.mutateAsync({
          destination_latitude: lat,
          destination_longitude: lng,
        });
        if (result.data) {
          setDistanceKm(result.data.distanceKm);
          setTransportCost(result.data.transportCost);
        }
      } catch (error) {
        console.error('Failed to calculate distance:', error);
      }
    }
  };

  // Add product to line items
  const handleAddProduct = (product: Product) => {
    const existing = lineItems.find((item) => item.productId === product.id);
    if (existing) {
      setLineItems(
        lineItems.map((item) =>
          item.productId === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        )
      );
    } else {
      setLineItems([
        ...lineItems,
        {
          productId: product.id,
          product,
          quantity: 1,
          unitPrice: product.base_price,
        },
      ]);
    }
  };

  // Update line item quantity
  const handleUpdateQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      setLineItems(lineItems.filter((item) => item.productId !== productId));
    } else {
      setLineItems(
        lineItems.map((item) =>
          item.productId === productId ? { ...item, quantity } : item
        )
      );
    }
  };

  // Remove line item
  const handleRemoveItem = (productId: string) => {
    setLineItems(lineItems.filter((item) => item.productId !== productId));
  };

  // Get AI discount suggestion (without creating a draft estimate)
  const handleGetAISuggestion = async () => {
    setAiSuggestion(null);

    try {
      const suggestion = await quickDiscountMutation.mutateAsync({
        leadId: lead.id,
        subtotal: summary.subtotal,
        itemsCount: lineItems.length,
        distanceKm: distanceKm ?? undefined,
      });

      if (suggestion.data) {
        setAiSuggestion({
          percentage: suggestion.data.suggestedPercentage,
          reasoning: suggestion.data.reasoning,
          confidence: suggestion.data.confidence,
        });
      }
    } catch (error) {
      console.error('Failed to get AI suggestion:', error);
    }
  };

  // Apply AI suggestion
  const handleApplyAISuggestion = () => {
    if (aiSuggestion) {
      setDiscountPercentage(aiSuggestion.percentage);
      setDiscountReason(`AI Suggested: ${aiSuggestion.reasoning}`);
    }
  };

  // Create estimate
  const handleCreateEstimate = async () => {
    if (!deliveryAddress || lineItems.length === 0) {
      return;
    }

    try {
      const items: EstimateItemInput[] = lineItems.map((item) => ({
        product_id: item.productId,
        quantity: item.quantity,
        unit_price: item.unitPrice,
      }));

      const result = await createMutation.mutateAsync({
        leadId: lead.id,
        data: {
          delivery_address: deliveryAddress,
          delivery_latitude: deliveryLat ?? undefined,
          delivery_longitude: deliveryLng ?? undefined,
          distance_km: distanceKm ?? undefined,
          items,
          discount_percentage: discountPercentage,
          discount_reason: discountReason || undefined,
          notes: notes || undefined,
          // Include AI suggestion data if available
          ai_suggested_discount: aiSuggestion?.percentage,
          ai_discount_reasoning: aiSuggestion?.reasoning,
          ai_confidence: aiSuggestion?.confidence,
        },
      });

      if (result.data && onEstimateCreated) {
        onEstimateCreated(result.data);
      }
      onClose();
    } catch (error) {
      console.error('Failed to create estimate:', error);
    }
  };

  // Reset form when panel closes
  useEffect(() => {
    if (!isOpen) {
      setLineItems([]);
      setDeliveryAddress('');
      setDeliveryLat(null);
      setDeliveryLng(null);
      setDistanceKm(null);
      setTransportCost(0);
      setDiscountPercentage(0);
      setDiscountReason('');
      setNotes('');
      setAiSuggestion(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isCreating = createMutation.isPending;
  const canCreate = lineItems.length > 0 && deliveryAddress.length > 0;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="relative ml-auto flex h-full w-full max-w-xl flex-col bg-white shadow-xl dark:bg-slate-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <CalculatorIcon className="h-5 w-5 text-amber-500" />
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                Price Estimator
              </h2>
              <p className="text-sm text-slate-500">
                {lead.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-500 dark:hover:bg-slate-800"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {productsLoading ? (
            <div className="flex h-64 items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Products Section */}
              <ProductSelector
                products={products}
                lineItems={lineItems}
                onAddProduct={handleAddProduct}
                onUpdateQuantity={handleUpdateQuantity}
                onRemoveItem={handleRemoveItem}
              />

              {/* Delivery Location */}
              <DeliveryLocationInput
                address={deliveryAddress}
                distanceKm={distanceKm}
                transportCost={transportCost}
                onAddressChange={setDeliveryAddress}
                onLocationSelect={handleLocationSelect}
                isCalculating={calculateDistanceMutation.isPending}
              />

              {/* Discount Section */}
              <DiscountSection
                discountPercentage={discountPercentage}
                discountReason={discountReason}
                aiSuggestion={aiSuggestion}
                onDiscountChange={setDiscountPercentage}
                onReasonChange={setDiscountReason}
                onGetAISuggestion={handleGetAISuggestion}
                onApplyAISuggestion={handleApplyAISuggestion}
                isLoadingSuggestion={quickDiscountMutation.isPending}
                hasItems={lineItems.length > 0}
              />

              {/* Notes */}
              <Card className="p-4">
                <h3 className="mb-3 font-medium text-slate-900 dark:text-white">
                  Notes
                </h3>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes..."
                  rows={3}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                />
              </Card>

              {/* Summary */}
              <EstimateSummary
                subtotal={summary.subtotal}
                transportCost={summary.transportCost}
                discountPercentage={discountPercentage}
                discountAmount={summary.discountAmount}
                total={summary.total}
              />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="border-t border-slate-200 px-6 py-4 dark:border-slate-700">
          <div className="flex gap-3">
            <Button
              className="flex-1"
              variant="primary"
              onClick={handleCreateEstimate}
              disabled={!canCreate || isCreating}
            >
              {isCreating ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Creating...
                </>
              ) : (
                <>
                  <SaveIcon className="mr-2 h-4 w-4" />
                  Create Estimate
                </>
              )}
            </Button>
            <Button variant="ghost" onClick={onClose} disabled={isCreating}>
              Cancel
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Icon Components
function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V13.5zm0 2.25h.008v.008H8.25v-.008zm0 2.25h.008v.008H8.25V18zm2.498-6.75h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V13.5zm0 2.25h.007v.008h-.007v-.008zm0 2.25h.007v.008h-.007V18zm2.504-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zm0 2.25h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V18zm2.498-6.75h.008v.008h-.008v-.008zm0 2.25h.008v.008h-.008V13.5zM8.25 6h7.5v2.25h-7.5V6zM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0012 2.25z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function SaveIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
    </svg>
  );
}

export default PriceEstimatorPanel;
