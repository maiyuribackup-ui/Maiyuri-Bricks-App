/**
 * Customer delivery-schedule PDF (PRD §15, §87). A4, branded, versioned.
 * Renders ONLY DeliveryScheduleDocumentData — the whitelist built from the
 * version's snapshot — so it cannot leak internal information by construction.
 */

import React from "react";
import { Document, Page, Text, View, Image, StyleSheet } from "@react-pdf/renderer";
import { registerQuoteFonts, F } from "@/lib/pdf/fonts";
import { MAIYURI_MARK_PNG } from "@/lib/pdf/brand-mark";
import {
  type DeliveryScheduleDocumentData,
  formatScheduleDate,
} from "@/lib/pdf/delivery-schedule-data";

registerQuoteFonts();

const GREEN = "#1F6F43";
const INK = "#1c1917";
const MUTED = "#6b7280";
const LINE = "#e5e7eb";

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, color: INK, fontFamily: "Helvetica" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  mark: { width: 44, height: 44 },
  brand: { fontFamily: F.display, fontSize: 18, color: GREEN },
  docTitle: { fontFamily: F.display, fontSize: 24, marginTop: 28, marginBottom: 4 },
  statusChip: { color: GREEN, fontFamily: F.label, fontSize: 12, marginBottom: 20 },
  metaGrid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 24 },
  metaCell: { width: "50%", marginBottom: 10 },
  metaLabel: { color: MUTED, fontSize: 8, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 },
  metaValue: { fontSize: 11 },
  th: {
    flexDirection: "row", borderBottomWidth: 1, borderBottomColor: INK,
    paddingBottom: 6, marginBottom: 2,
  },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: LINE, paddingVertical: 7 },
  colDate: { width: "34%" },
  colProduct: { width: "44%" },
  colQty: { width: "22%", textAlign: "right" },
  totalRow: { flexDirection: "row", paddingTop: 8 },
  totalLabel: { width: "78%", fontFamily: F.label, fontSize: 12 },
  totalValue: { width: "22%", textAlign: "right", fontFamily: F.display, fontSize: 12 },
  footer: {
    position: "absolute", bottom: 36, left: 48, right: 48,
    borderTopWidth: 0.5, borderTopColor: LINE, paddingTop: 8,
    flexDirection: "row", justifyContent: "space-between",
  },
  footerText: { fontSize: 8, color: MUTED },
});

export function DeliveryScheduleDocument({ data }: { data: DeliveryScheduleDocumentData }) {
  return (
    <Document
      title={`Delivery Schedule ${data.orderName} V${data.versionNo}`}
      author="Maiyuri Bricks"
    >
      <Page size="A4" style={s.page}>
        <View style={s.headerRow}>
          <Text style={s.brand}>Maiyuri Bricks</Text>
          <Image src={MAIYURI_MARK_PNG} style={s.mark} />
        </View>

        <Text style={s.docTitle}>Delivery Schedule</Text>
        <Text style={s.statusChip}>
          {data.orderName} · Version {data.versionNo} · {data.statusLabel}
        </Text>

        <View style={s.metaGrid}>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Customer</Text>
            <Text style={s.metaValue}>{data.customerName ?? "—"}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Project / site</Text>
            <Text style={s.metaValue}>{data.siteName ?? "—"}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Delivery address</Text>
            <Text style={s.metaValue}>{data.address ?? "—"}</Text>
          </View>
          <View style={s.metaCell}>
            <Text style={s.metaLabel}>Site contact</Text>
            <Text style={s.metaValue}>
              {[data.contactName, data.phone].filter(Boolean).join(" · ") || "—"}
            </Text>
          </View>
        </View>

        <View style={s.th}>
          <Text style={[s.colDate, s.metaLabel]}>Planned date</Text>
          <Text style={[s.colProduct, s.metaLabel]}>Product</Text>
          <Text style={[s.colQty, s.metaLabel]}>Quantity</Text>
        </View>
        {data.lines.map((l, i) => (
          <View key={i} style={s.tr}>
            <Text style={s.colDate}>{formatScheduleDate(l.deliveryDate)}</Text>
            <Text style={s.colProduct}>{l.productName}</Text>
            <Text style={s.colQty}>{l.quantity.toLocaleString("en-IN")}</Text>
          </View>
        ))}
        <View style={s.totalRow}>
          <Text style={s.totalLabel}>Total scheduled</Text>
          <Text style={s.totalValue}>{data.totalScheduled.toLocaleString("en-IN")}</Text>
        </View>
        {data.totalOrdered !== null && (
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total ordered</Text>
            <Text style={s.totalValue}>{data.totalOrdered.toLocaleString("en-IN")}</Text>
          </View>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>Maiyuri Bricks · mb.maiyuri.com</Text>
          <Text style={s.footerText}>
            Generated {formatScheduleDate(data.generatedOn)} · Schedule {data.orderName} V
            {data.versionNo}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
