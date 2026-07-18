export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  EXPENSE_ADMIN_ROLES,
  EXPENSE_RECEIPT_BUCKET,
  EXPENSE_SUBMITTER_ROLES,
} from "@/lib/expenses";

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/pdf",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

/**
 * POST /api/expenses/receipts — multipart receipt upload (before claim save).
 * Returns { path, url } — the claim stores `path` in receipt_url; `url` is a
 * short-lived signed URL for immediate preview. Fetch a fresh URL later via
 * GET /api/expenses/receipts?path=...
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (
      !EXPENSE_SUBMITTER_ROLES.includes(user.role) &&
      !EXPENSE_ADMIN_ROLES.includes(user.role)
    ) {
      return error("Not permitted", 403);
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return error("No file provided", 400);
    if (!ALLOWED_MIME.includes(file.type)) {
      return error("Only images or PDF receipts are allowed", 400);
    }
    if (file.size > MAX_SIZE_BYTES) return error("Receipt too large (max 10MB)", 400);

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const path = `${user.id}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from(EXPENSE_RECEIPT_BUCKET)
      .upload(path, buffer, { contentType: file.type });
    if (upErr) {
      console.error("[Expenses] receipt upload failed:", upErr);
      return error("Receipt upload failed", 500);
    }

    const { data: signed } = await supabaseAdmin.storage
      .from(EXPENSE_RECEIPT_BUCKET)
      .createSignedUrl(path, 3600);

    return success({ path, url: signed?.signedUrl ?? null });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("[Expenses] receipt POST error:", err);
    return error("Receipt upload failed", 500);
  }
}

/**
 * GET /api/expenses/receipts?path=... — fresh signed URL for a stored receipt.
 * Allowed for the claim's owner or an admin.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    const path = new URL(request.url).searchParams.get("path");
    if (!path) return error("path required", 400);

    const isAdmin = EXPENSE_ADMIN_ROLES.includes(user.role);
    if (!isAdmin) {
      // Non-admins may only sign their own uploads (paths are prefixed by uid).
      if (!path.startsWith(`${user.id}/`)) return error("Not permitted", 403);
    }

    const { data: signed, error: sErr } = await supabaseAdmin.storage
      .from(EXPENSE_RECEIPT_BUCKET)
      .createSignedUrl(path, 3600);
    if (sErr || !signed) return error("Receipt not found", 404);
    return success({ url: signed.signedUrl });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    return error("Failed to sign receipt", 500);
  }
}
