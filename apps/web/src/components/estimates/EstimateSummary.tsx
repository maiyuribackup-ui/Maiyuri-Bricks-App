'use client';

import { Card } from '@maiyuri/ui';
import { cn } from '@maiyuri/ui';

interface EstimateSummaryProps {
  subtotal: number;
  transportCost: number;
  discountPercentage: number;
  discountAmount: number;
  total: number;
}

export function EstimateSummary({
  subtotal,
  transportCost,
  discountPercentage,
  discountAmount,
  total,
}: EstimateSummaryProps) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount).replace('₹', 'Rs.');
  };

  const hasItems = subtotal > 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-700 dark:bg-slate-800">
        <h3 className="font-medium text-slate-900 dark:text-white">
          Estimate Summary
        </h3>
      </div>

      <div className="p-4">
        {hasItems ? (
          <div className="space-y-3">
            {/* Subtotal */}
            <div className="flex items-center justify-between">
              <span className="text-slate-600 dark:text-slate-400">Subtotal</span>
              <span className="font-medium text-slate-900 dark:text-white">
                {formatCurrency(subtotal)}
              </span>
            </div>

            {/* Transport Cost */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <TruckIcon className="h-4 w-4 text-slate-400" />
                <span className="text-slate-600 dark:text-slate-400">Transport</span>
              </div>
              <span
                className={cn(
                  'font-medium',
                  transportCost > 0
                    ? 'text-slate-900 dark:text-white'
                    : 'text-slate-400'
                )}
              >
                {transportCost > 0 ? `+ ${formatCurrency(transportCost)}` : '--'}
              </span>
            </div>

            {/* Discount */}
            {discountPercentage > 0 && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <TagIcon className="h-4 w-4 text-green-500" />
                  <span className="text-green-600 dark:text-green-400">
                    Discount ({discountPercentage}%)
                  </span>
                </div>
                <span className="font-medium text-green-600 dark:text-green-400">
                  - {formatCurrency(discountAmount)}
                </span>
              </div>
            )}

            {/* Divider */}
            <div className="border-t border-slate-200 dark:border-slate-700" />

            {/* Total */}
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-slate-900 dark:text-white">
                Total
              </span>
              <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {formatCurrency(total)}
              </span>
            </div>

            {/* Savings Badge */}
            {discountAmount > 0 && (
              <div className="rounded-md bg-green-50 px-3 py-2 text-center dark:bg-green-900/20">
                <p className="text-sm font-medium text-green-700 dark:text-green-300">
                  Customer saves {formatCurrency(discountAmount)} 🎉
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="py-8 text-center">
            <ReceiptIcon className="mx-auto h-12 w-12 text-slate-300 dark:text-slate-600" />
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Add products to see estimate summary
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}

// Icon Components
function TruckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
    </svg>
  );
}

function TagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
    </svg>
  );
}

function ReceiptIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  );
}

export default EstimateSummary;
