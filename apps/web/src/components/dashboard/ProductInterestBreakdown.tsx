"use client";

import { Card } from "@maiyuri/ui";
import { cn } from "@maiyuri/ui";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface ProductInterest {
  product: string;
  label: string;
  inquiries: number;
  converted: number;
  avgQuantity: number;
  avgValue?: number;
  trend: "up" | "down" | "stable";
}

interface ProductInterestBreakdownProps {
  products: ProductInterest[];
  title?: string;
  loading?: boolean;
}

const COLORS = [
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
];

export function ProductInterestBreakdown({
  products,
  title = "Product Interest",
  loading = false,
}: ProductInterestBreakdownProps) {
  if (loading) {
    return (
      <Card className="p-6">
        <div className="h-6 w-36 bg-slate-200 dark:bg-slate-700 rounded animate-pulse mb-4" />
        <div className="h-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
      </Card>
    );
  }

  const sortedProducts = [...products].sort(
    (a, b) => b.inquiries - a.inquiries,
  );
  const chartData = sortedProducts.map((p, i) => ({
    name: p.label,
    inquiries: p.inquiries,
    converted: p.converted,
    fill: COLORS[i % COLORS.length],
  }));

  const totalInquiries = products.reduce((sum, p) => sum + p.inquiries, 0);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {totalInquiries} total inquiries
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical">
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 12, fill: "#64748b" }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "rgba(255, 255, 255, 0.95)",
                  border: "none",
                  borderRadius: "8px",
                  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
                }}
                formatter={(value: number, name: string) => [
                  value,
                  name === "inquiries" ? "Inquiries" : "Converted",
                ]}
              />
              <Bar dataKey="inquiries" radius={[0, 4, 4, 0]}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Product Details */}
        <div className="space-y-3">
          {sortedProducts.slice(0, 5).map((product, index) => (
            <div
              key={product.product}
              className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50"
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: COLORS[index % COLORS.length] }}
                />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">
                      {product.label}
                    </p>
                    <TrendIndicator trend={product.trend} />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Avg. qty: {(product.avgQuantity || 0).toLocaleString()}{" "}
                    units
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {product.inquiries}
                </p>
                <p className="text-[10px] text-slate-500">
                  {product.converted} converted (
                  {product.inquiries > 0
                    ? Math.round((product.converted / product.inquiries) * 100)
                    : 0}
                  %)
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Most Popular Product Highlight */}
      {sortedProducts.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BrickIcon className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-slate-600 dark:text-slate-400">
                Most requested:{" "}
                <strong className="text-slate-900 dark:text-white">
                  {sortedProducts[0]?.label}
                </strong>
              </span>
            </div>
            <span className="text-sm font-medium text-orange-600">
              {totalInquiries > 0
                ? Math.round(
                    ((sortedProducts[0]?.inquiries ?? 0) / totalInquiries) *
                      100,
                  )
                : 0}
              % of inquiries
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}

function TrendIndicator({ trend }: { trend: "up" | "down" | "stable" }) {
  if (trend === "up") {
    return (
      <span className="inline-flex items-center text-green-600">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 15.75l7.5-7.5 7.5 7.5"
          />
        </svg>
      </span>
    );
  }
  if (trend === "down") {
    return (
      <span className="inline-flex items-center text-red-600">
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={2}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
          />
        </svg>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center text-slate-400">
      <svg
        className="h-3 w-3"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={2}
        stroke="currentColor"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 12H6" />
      </svg>
    </span>
  );
}

export function getDefaultProductInterests(): ProductInterest[] {
  return [
    {
      product: "red_brick",
      label: "Red Clay Brick",
      inquiries: 0,
      converted: 0,
      avgQuantity: 0,
      trend: "stable",
    },
    {
      product: "fly_ash",
      label: "Fly Ash Brick",
      inquiries: 0,
      converted: 0,
      avgQuantity: 0,
      trend: "stable",
    },
    {
      product: "cement_block",
      label: "Cement Block",
      inquiries: 0,
      converted: 0,
      avgQuantity: 0,
      trend: "stable",
    },
    {
      product: "hollow_block",
      label: "Hollow Block",
      inquiries: 0,
      converted: 0,
      avgQuantity: 0,
      trend: "stable",
    },
    {
      product: "paver",
      label: "Paver Block",
      inquiries: 0,
      converted: 0,
      avgQuantity: 0,
      trend: "stable",
    },
  ];
}

// Icons
function BrickIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth={1.5}
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
      />
    </svg>
  );
}

export default ProductInterestBreakdown;
