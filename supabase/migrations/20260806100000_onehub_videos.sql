-- ============================================================================
-- OneHub videos — the carousel + playlist from maiyuri.com/start, brought
-- into the app so staff see the same films without leaving OneHub.
--
-- Rows are ordered by sort_order and rendered as a horizontal carousel on the
-- Start Here page. An optional shared playlist id powers the "watch the full
-- playlist" link. Reads are open to signed-in staff; writes go through the
-- service-role API route with a founder/owner check.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.onehub_videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- YouTube video id (the 11-char code in a watch?v= or youtu.be link).
  youtube_id TEXT NOT NULL,
  title_en TEXT NOT NULL,
  title_ta TEXT,
  caption_en TEXT,
  caption_ta TEXT,
  -- Optional grouping label shown above the carousel (e.g. "Product", "Process")
  category TEXT,
  -- Playlist this video belongs to, for the "full playlist" link.
  playlist_id TEXT,
  duration_label TEXT,          -- e.g. "3:12" — display only, no API call needed
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (youtube_id)
);

CREATE INDEX IF NOT EXISTS idx_onehub_videos_order
  ON public.onehub_videos(is_active, sort_order);

ALTER TABLE public.onehub_videos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth read onehub videos" ON public.onehub_videos;
CREATE POLICY "auth read onehub videos" ON public.onehub_videos
  FOR SELECT TO authenticated USING (true);

DROP TRIGGER IF EXISTS trg_onehub_videos_updated_at ON public.onehub_videos;
CREATE TRIGGER trg_onehub_videos_updated_at
  BEFORE UPDATE ON public.onehub_videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

COMMENT ON TABLE public.onehub_videos IS
  'Videos shown in the OneHub Start Here carousel (mirrors maiyuri.com/start)';
