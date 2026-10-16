export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import React from "react";
import { error, notFound } from "@/lib/api-utils";
import { requireProductionRole } from "@/lib/production-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { SCHEDULE_ROLES } from "@/lib/ops-control/schedules";
import {
  buildDeliveryScheduleData,
  deliveryScheduleFilename,
} from "@/lib/pdf/delivery-schedule-data";
import { DeliveryScheduleDocument } from "@/lib/pdf/DeliveryScheduleDocument";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/ops-control/schedules/[id]/pdf?version=<n>
 *
 * The customer-facing schedule document (PRD §15, §87). ANY version is
 * renderable forever — superseded ones included — because the document reads
 * only the version's customer_snapshot and lines, never mutable masters.
 * Defaults to the newest version when ?version is omitted.
 */
export async function GET(request: NextRequest, { params }: Params) {
  const auth = await requireProductionRole(request, SCHEDULE_ROLES);
  if (auth.errorResponse) return auth.errorResponse;
  try {
    const { id } = await params;
    const versionParam = request.nextUrl.searchParams.get("version");
    const versionNo = versionParam ? Number(versionParam) : null;
    if (versionParam && (!Number.isInteger(versionNo) || (versionNo ?? 0) < 1)) {
      return error("version must be a positive integer", 400);
    }

    const { data: schedule } = await supabaseAdmin
      .from("oc_delivery_schedules")
      .select("id, odoo_order_id, order_name")
      .eq("id", id)
      .maybeSingle();
    if (!schedule) return notFound("Schedule");

    let versionQuery = supabaseAdmin
      .from("oc_delivery_schedule_versions")
      .select(
        "id, version_no, status, customer_snapshot, oc_delivery_schedule_lines(so_line_id, delivery_date, quantity, sort_order)",
      )
      .eq("schedule_id", id);
    versionQuery =
      versionNo !== null
        ? versionQuery.eq("version_no", versionNo)
        : versionQuery.order("version_no", { ascending: false }).limit(1);
    const { data: versionRows, error: vErr } = await versionQuery;
    if (vErr) return error(`Failed to load version: ${vErr.message}`, 500);
    const version = (versionRows ?? [])[0] as
      | {
          id: string;
          version_no: number;
          status: string;
          customer_snapshot: Record<string, unknown> | null;
          oc_delivery_schedule_lines: {
            so_line_id: string;
            delivery_date: string;
            quantity: number;
          }[];
        }
      | undefined;
    if (!version) return notFound("Schedule version");

    // Product names and the order total come from the SO lines the version
    // references. qty_ordered can move in Odoo, so "total ordered" is labelled
    // by generation date via the footer; the schedule content itself is frozen.
    const soLineIds = [
      ...new Set(version.oc_delivery_schedule_lines.map((l) => l.so_line_id)),
    ];
    const { data: soLines } = soLineIds.length
      ? await supabaseAdmin
          .from("oc_sales_order_lines")
          .select("id, product_name, qty_ordered")
          .in("id", soLineIds)
      : { data: [] };
    const soById = new Map(
      ((soLines ?? []) as {
        id: string;
        product_name: string | null;
        qty_ordered: number;
      }[]).map((r) => [r.id, r]),
    );

    const totalOrdered = [...soById.values()].reduce(
      (a, r) => a + Number(r.qty_ordered),
      0,
    );

    const data = buildDeliveryScheduleData(
      {
        version_no: version.version_no,
        status: version.status,
        customer_snapshot: version.customer_snapshot,
        lines: version.oc_delivery_schedule_lines.map((l) => ({
          product_name: soById.get(l.so_line_id)?.product_name ?? null,
          delivery_date: l.delivery_date,
          quantity: Number(l.quantity),
        })),
      },
      {
        totalOrdered: soLineIds.length ? totalOrdered : null,
        generatedOn: new Date().toISOString().slice(0, 10),
      },
    );

    // renderToBuffer's parameter type wants a <Document> element literally;
    // a component returning one is equivalent at runtime (QuoteDocument does
    // the same cast).
    type PdfRoot = Parameters<typeof renderToBuffer>[0];
    const buffer = await renderToBuffer(
      React.createElement(DeliveryScheduleDocument, { data }) as unknown as PdfRoot,
    );

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${deliveryScheduleFilename(
          (schedule as { order_name: string }).order_name,
          version.version_no,
        )}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[OpsControl] schedule PDF failed:", err);
    return error("Failed to generate the schedule PDF", 500);
  }
}
