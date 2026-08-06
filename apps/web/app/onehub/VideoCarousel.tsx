"use client";

/**
 * OneHub video carousel — the films from maiyuri.com/start, in the app.
 *
 * Thumbnails only until tapped: nothing from YouTube is loaded on page view, so
 * the Start Here page stays fast and no third-party cookies are set before the
 * user asks for a video. Playback uses youtube-nocookie.
 */

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Play, ListVideo } from "lucide-react";
import { onehub } from "./theme";

export interface OneHubVideo {
  id: string;
  youtube_id: string;
  title_en: string;
  title_ta: string | null;
  caption_en: string | null;
  caption_ta: string | null;
  category: string | null;
  playlist_id: string | null;
  duration_label: string | null;
  sort_order: number;
}

async function getVideos(): Promise<OneHubVideo[]> {
  const res = await fetch("/api/onehub/videos");
  if (!res.ok) throw new Error("Failed to load videos");
  const body = await res.json();
  return (body.data ?? []) as OneHubVideo[];
}

/** YouTube's thumbnail CDN — no API key needed. */
function thumbUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function VideoCarousel() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["onehub", "videos"],
    queryFn: getVideos,
  });
  const [playing, setPlaying] = useState<string | null>(null);

  const videos = data ?? [];
  // Any video may carry the playlist; the first one that does wins.
  const playlistId = videos.find((v) => v.playlist_id)?.playlist_id ?? null;

  const scroll = (dir: -1 | 1) => {
    const el = document.getElementById("onehub-video-strip");
    if (el) el.scrollBy({ left: dir * 320, behavior: "smooth" });
  };

  if (!isLoading && !isError && videos.length === 0) return null;

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: onehub.cardBorder }}
    >
      {/* Player takes over the card once a video is chosen */}
      {playing ? (
        <div className="space-y-3">
          <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${playing}?autoplay=1&rel=0`}
              title="Maiyuri Bricks video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="absolute inset-0 h-full w-full"
            />
          </div>
          <button
            onClick={() => setPlaying(null)}
            className="text-xs font-medium underline"
            style={{ color: onehub.accent }}
          >
            ← Back to all videos
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <div
              id="onehub-video-strip"
              className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2"
              style={{ scrollbarWidth: "thin" }}
            >
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={i}
                      className="h-[168px] w-[280px] flex-shrink-0 animate-pulse rounded-xl bg-[#f5efe4]"
                    />
                  ))
                : videos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setPlaying(v.youtube_id)}
                      className="group w-[280px] flex-shrink-0 snap-start text-left"
                      aria-label={`Play ${v.title_en}`}
                    >
                      <div
                        className="relative overflow-hidden rounded-xl border"
                        style={{ borderColor: onehub.cardBorder }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={thumbUrl(v.youtube_id)}
                          alt=""
                          loading="lazy"
                          className="h-[158px] w-full object-cover transition-transform group-hover:scale-[1.03]"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/25 opacity-90 transition-opacity group-hover:bg-black/35">
                          <span
                            className="flex h-11 w-11 items-center justify-center rounded-full"
                            style={{ background: onehub.accent }}
                          >
                            <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
                          </span>
                        </span>
                        {v.duration_label && (
                          <span className="absolute bottom-1.5 right-1.5 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white">
                            {v.duration_label}
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-2 line-clamp-2 text-sm font-semibold"
                        style={{ color: onehub.text }}
                      >
                        {v.title_en}
                      </p>
                      {v.caption_en && (
                        <p
                          className="mt-0.5 line-clamp-2 text-xs"
                          style={{ color: onehub.textMuted }}
                        >
                          {v.caption_en}
                        </p>
                      )}
                    </button>
                  ))}
            </div>

            {/* Arrows: desktop affordance; the strip is swipeable on touch */}
            {videos.length > 1 && (
              <>
                <button
                  onClick={() => scroll(-1)}
                  aria-label="Previous videos"
                  className="absolute -left-2 top-[70px] hidden h-9 w-9 items-center justify-center rounded-full border bg-white shadow-sm sm:flex"
                  style={{ borderColor: onehub.cardBorder }}
                >
                  <ChevronLeft className="h-5 w-5" style={{ color: onehub.brand }} />
                </button>
                <button
                  onClick={() => scroll(1)}
                  aria-label="More videos"
                  className="absolute -right-2 top-[70px] hidden h-9 w-9 items-center justify-center rounded-full border bg-white shadow-sm sm:flex"
                  style={{ borderColor: onehub.cardBorder }}
                >
                  <ChevronRight className="h-5 w-5" style={{ color: onehub.brand }} />
                </button>
              </>
            )}
          </div>

          {isError && (
            <p className="text-sm" style={{ color: onehub.textMuted }}>
              Could not load videos. Please refresh.
            </p>
          )}

          {playlistId && (
            <a
              href={`https://www.youtube.com/playlist?list=${playlistId}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: onehub.accent }}
            >
              <ListVideo className="h-4 w-4" />
              Watch the full playlist on YouTube
            </a>
          )}
        </>
      )}
    </div>
  );
}
