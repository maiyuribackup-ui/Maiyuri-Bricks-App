"use client";

import { use } from "react";
import { DeliveryDetail } from "@/components/deliveries";

interface DeliveryPageProps {
  params: Promise<{ id: string }>;
}

export default function DeliveryPage({ params }: DeliveryPageProps) {
  const { id } = use(params);
  return <DeliveryDetail id={id} />;
}
