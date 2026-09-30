import { redirect } from "next/navigation";

// Demand is the screen everybody shares (sales included); masters is reached
// via the tab by production roles.
export default function OpsIndexPage() {
  redirect("/ops/demand");
}
