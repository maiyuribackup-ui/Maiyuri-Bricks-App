import { getDailyReport } from "@/lib/daily-report/aggregate";
import { DailyReportView } from "./DailyReportView";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Odoo + GA4 round-trips

// Today in IST as YYYY-MM-DD.
function istToday(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function DailyReportPage({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date =
    searchParams.date && DATE_RE.test(searchParams.date)
      ? searchParams.date
      : istToday();

  const report = await getDailyReport(date);
  return <DailyReportView report={report} />;
}
