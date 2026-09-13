export const dynamic = "force-dynamic";

import { NextRequest } from "next/server";
import { z } from "zod";
import { success, error, parseBody } from "@/lib/api-utils";
import { requireAuth, AuthError } from "@/lib/api-helpers";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { parseYouTubeId } from "@/lib/youtube-id";

const videoSchema = z.object({
  id: z.string().uuid().optional(),
  // May be a full URL; normalised to an id below.
  youtube_id: z.string().min(1),
  title_en: z.string().min(1),
  title_ta: z.string().nullable().optional(),
  caption_en: z.string().nullable().optional(),
  caption_ta: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  playlist_id: z.string().nullable().optional(),
  duration_label: z.string().nullable().optional(),
  sort_order: z.number().int().default(0),
  is_active: z.boolean().default(true),
});

// GET /api/onehub/videos — the Start Here carousel
export async function GET() {
  try {
    const { data, error: dbError } = await supabaseAdmin
      .from("onehub_videos")
      .select("*")
      .eq("is_active", true)
      .order("sort_order");
    if (dbError) {
      console.error("onehub videos GET failed:", dbError);
      return error("Failed to load videos", 500);
    }
    return success(data ?? []);
  } catch (err) {
    console.error("onehub videos GET failed:", err);
    return error("Failed to load videos", 500);
  }
}

// POST /api/onehub/videos — add or update (founder/owner)
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    if (user.role !== "founder" && user.role !== "owner") {
      return error("Only founders can edit videos", 403);
    }

    const parsed = await parseBody(request, videoSchema);
    if (parsed.error) return parsed.error;

    const youtubeId = parseYouTubeId(parsed.data.youtube_id);
    if (!youtubeId) {
      return error(
        "Could not read a YouTube video id from that link. Paste the video URL or the 11-character id.",
        400,
      );
    }

    const { data, error: dbError } = await supabaseAdmin
      .from("onehub_videos")
      .upsert(
        { ...parsed.data, youtube_id: youtubeId },
        { onConflict: "youtube_id" },
      )
      .select("*")
      .single();

    if (dbError || !data) {
      console.error("onehub videos POST failed:", dbError);
      return error("Failed to save the video", 500);
    }
    return success(data);
  } catch (err) {
    if (err instanceof AuthError) return error(err.message, err.status);
    console.error("onehub videos POST failed:", err);
    return error("Failed to save the video", 500);
  }
}
