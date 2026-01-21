"use client";

import { ProductionOrdersList } from "@/components/production";
import { HelpButton } from "@/components/help";

export default function ProductionPage() {
  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10">
        <HelpButton section="production" variant="icon" />
      </div>
      <ProductionOrdersList />
    </div>
  );
}
