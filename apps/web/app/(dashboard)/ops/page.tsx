import { redirect } from "next/navigation";

// Phase 1 has one screen; /ops lands on it rather than showing an empty shell.
export default function OpsIndexPage() {
  redirect("/ops/masters");
}
