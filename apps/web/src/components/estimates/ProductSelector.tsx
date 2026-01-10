'use client';

import { useState } from 'react';
import { Card, Button } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';
import type { Product } from '@maiyuri/shared';

interface LineItem {
  productId: string;
  product: Product;
  quantity: number;
  unitPrice: number;
}

interface ProductSelectorProps {
  products: Product[];
  lineItems: LineItem[];
  onAddProduct: (product: Product) => void;
  onUpdateQuantity: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
}

// Group products by category
const categoryLabels: Record<string, string> = {
  cement_interlock: 'Cement Interlock',
  mud_interlock: 'Mud Interlock',
  project: 'Projects & Services',
};

const categoryColors: Record<string, string> = {
  cement_interlock: 'border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-900/20',
  mud_interlock: 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20',
  project: 'border-purple-200 bg-purple-50 dark:border-purple-800 dark:bg-purple-900/20',
};

export function ProductSelector({
  products,
  lineItems,
  onAddProduct,
  onUpdateQuantity,
  onRemoveItem,
}: ProductSelectorProps) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // Group products by category
  const productsByCategory = products.reduce(
    (acc, product) => {
      if (!acc[product.category]) {
        acc[product.category] = [];
      }
      acc[product.category].push(product);
      return acc;
    },
    {} as Record<string, Product[]>
  );

  const categories = Object.keys(productsByCategory);

  return (
    <Card className="p-4">
      <h3 className="mb-3 font-medium text-slate-900 dark:text-white">
        Products
      </h3>

      {/* Selected Items */}
      {lineItems.length > 0 && (
        <div className="mb-4 space-y-2">
          {lineItems.map((item) => (
            <div
              key={item.productId}
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800"
            >
              <div className="flex-1">
                <p className="font-medium text-slate-900 dark:text-white">
                  {item.product.name}
                </p>
                <p className="text-sm text-slate-500">
                  {item.product.unit} @ Rs.{item.unitPrice.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateQuantity(item.productId, item.quantity - 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  <MinusIcon className="h-4 w-4" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={(e) =>
                    onUpdateQuantity(item.productId, parseInt(e.target.value) || 1)
                  }
                  className="h-8 w-16 rounded-md border border-slate-300 bg-white px-2 text-center text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                />
                <button
                  onClick={() => onUpdateQuantity(item.productId, item.quantity + 1)}
                  className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
                <span className="ml-2 w-20 text-right font-medium text-slate-900 dark:text-white">
                  Rs.{(item.quantity * item.unitPrice).toFixed(2)}
                </span>
                <button
                  onClick={() => onRemoveItem(item.productId)}
                  className="ml-2 text-red-500 hover:text-red-600"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Category Tabs */}
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() =>
              setActiveCategory(activeCategory === category ? null : category)
            }
            className={cn(
              'whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              activeCategory === category
                ? 'bg-amber-500 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600'
            )}
          >
            {categoryLabels[category] || category}
          </button>
        ))}
      </div>

      {/* Product List */}
      {activeCategory && productsByCategory[activeCategory] && (
        <div className={cn('rounded-lg border p-3', categoryColors[activeCategory])}>
          <div className="grid gap-2">
            {productsByCategory[activeCategory].map((product) => {
              const isAdded = lineItems.some(
                (item) => item.productId === product.id
              );
              return (
                <button
                  key={product.id}
                  onClick={() => !isAdded && onAddProduct(product)}
                  disabled={isAdded}
                  className={cn(
                    'flex items-center justify-between rounded-md p-2 text-left transition-colors',
                    isAdded
                      ? 'cursor-not-allowed opacity-50'
                      : 'hover:bg-white/50 dark:hover:bg-slate-700/50'
                  )}
                >
                  <div>
                    <p className="font-medium text-slate-900 dark:text-white">
                      {product.name}
                    </p>
                    <p className="text-sm text-slate-500">
                      {product.description}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      Rs.{product.base_price.toFixed(2)}
                    </p>
                    <p className="text-xs text-slate-500">per {product.unit}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!activeCategory && lineItems.length === 0 && (
        <p className="text-center text-sm text-slate-500 dark:text-slate-400">
          Select a category above to add products
        </p>
      )}
    </Card>
  );
}

// Icon Components
function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}

function MinusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12h-15" />
    </svg>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
    </svg>
  );
}

export default ProductSelector;
