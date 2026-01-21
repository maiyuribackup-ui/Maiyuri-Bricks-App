"use client";

import { DeliveriesList } from "@/components/deliveries";
import { HelpButton } from "@/components/help";

export default function DeliveriesPage() {
  return (
    <div className="relative">
      <div className="absolute right-0 top-0 z-10">
        <HelpButton section="deliveries" variant="icon" />
      </div>
      <DeliveriesList />
    </div>
  );
}
