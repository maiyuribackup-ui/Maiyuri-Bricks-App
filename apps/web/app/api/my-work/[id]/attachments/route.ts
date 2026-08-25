export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { success, error } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import {
  assertActionable,
  assertAssignee,
  getWorkItemForUser,
  logWorkEvent,
  WorkAccessError,
  WORK_PHOTO_BUCKET,
} from "@/lib/my-work-service";
import type { WorkItemAttachment } from "@maiyuri/shared";

interface Params {
  params: Promise<{ id: string }>;
}

const ALLOWED_MIME = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
];
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB — matches the bucket limit

/**
 * POST /api/my-work/[id]/attachments — multipart photo upload.
 * fields: file (required), caption?, checklist_response_id?
 * Path: {work_item_id}/{user_id}/{ts}-{filename} in the private bucket.
 */
export async function POST(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    assertAssignee(item, user);
    assertActionable(item);

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return error("No file provided", 400);
    }
    if (!ALLOWED_MIME.includes(file.type)) {
      return error("Only photos (JPEG, PNG, WebP, HEIC) are allowed", 400);
    }
    if (file.size > MAX_SIZE_BYTES) {
      return error("Photo is too large (max 10MB)", 400);
    }

    const caption = (formData.get("caption") as string | null) ?? null;
    const responseId =
      (formData.get("checklist_response_id") as string | null) || null;

    if (responseId && item.checklist_instance_id) {
      const { data: resp } = await supabaseAdmin
        .from("work_checklist_responses")
        .select("id, instance_id")
        .eq("id", responseId)
        .single();
      if (!resp || resp.instance_id !== item.checklist_instance_id) {
        return error("Checklist item does not belong to this work item", 400);
      }
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const storagePath = `${id}/${user.id}/${Date.now()}-${safeName}`;
    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabaseAdmin.storage
      .from(WORK_PHOTO_BUCKET)
      .upload(storagePath, buffer, { contentType: file.type });

    if (uploadErr) {
      console.error("[MyWork] upload failed:", uploadErr);
      return error("Photo upload failed — please try again", 500);
    }

    const { data: attachment, error: metaErr } = await supabaseAdmin
      .from("work_item_attachments")
      .insert({
        work_item_id: id,
        checklist_response_id: responseId,
        uploaded_by: user.id,
        storage_path: storagePath,
        file_name: file.name,
        mime_type: file.type,
        file_size: file.size,
        caption,
      })
      .select("*")
      .single();

    if (metaErr || !attachment) {
      // Don't leave an orphan file behind
      await supabaseAdmin.storage.from(WORK_PHOTO_BUCKET).remove([storagePath]);
      console.error("[MyWork] attachment metadata failed:", metaErr);
      return error("Photo upload failed — please try again", 500);
    }

    await logWorkEvent({
      work_item_id: id,
      event_type: "photo_added",
      performed_by: user.id,
      metadata: { attachment_id: attachment.id, file_name: file.name },
    });

    const { data: signed } = await supabaseAdmin.storage
      .from(WORK_PHOTO_BUCKET)
      .createSignedUrl(storagePath, 3600);

    return success<WorkItemAttachment>({
      ...(attachment as WorkItemAttachment),
      url: signed?.signedUrl,
    });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] attachment POST failed:", err);
    return error("Photo upload failed", 500);
  }
}

// DELETE /api/my-work/[id]/attachments?attachment_id= — remove pre-submission
export async function DELETE(request: NextRequest, { params }: Params) {
  try {
    const user = await requireAuth(request);
    const { id } = await params;

    const item = await getWorkItemForUser(id, user);
    assertAssignee(item, user);
    assertActionable(item);

    const attachmentId = request.nextUrl.searchParams.get("attachment_id");
    if (!attachmentId) return error("attachment_id is required", 400);

    const { data: attachment } = await supabaseAdmin
      .from("work_item_attachments")
      .select("*")
      .eq("id", attachmentId)
      .eq("work_item_id", id)
      .single();

    if (!attachment) return error("Attachment not found", 404);
    if (attachment.uploaded_by !== user.id) {
      return error("You can only remove photos you uploaded", 403);
    }

    await supabaseAdmin.storage
      .from(WORK_PHOTO_BUCKET)
      .remove([attachment.storage_path]);
    await supabaseAdmin
      .from("work_item_attachments")
      .delete()
      .eq("id", attachmentId);

    await logWorkEvent({
      work_item_id: id,
      event_type: "photo_removed",
      performed_by: user.id,
      metadata: { attachment_id: attachmentId },
    });

    return success({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    if (err instanceof WorkAccessError) return error(err.message, err.status);
    console.error("[MyWork] attachment DELETE failed:", err);
    return error("Failed to remove the photo", 500);
  }
}
