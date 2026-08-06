import { describe, expect, it } from "vitest";
import { parseYouTubeId } from "@/../app/api/onehub/videos/route";

/**
 * Staff paste whatever YouTube gave them — a share link, the address bar, a
 * Shorts URL. All of them must resolve to the same 11-character id.
 */
describe("parseYouTubeId", () => {
  const ID = "dQw4w9WgXcQ";

  it("accepts a bare id", () => {
    expect(parseYouTubeId(ID)).toBe(ID);
  });

  it("accepts a standard watch link", () => {
    expect(parseYouTubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
  });

  it("accepts a watch link with extra params", () => {
    expect(
      parseYouTubeId(`https://www.youtube.com/watch?v=${ID}&list=PLabc&index=2`),
    ).toBe(ID);
  });

  it("accepts a youtu.be share link", () => {
    expect(parseYouTubeId(`https://youtu.be/${ID}?si=xyz`)).toBe(ID);
  });

  it("accepts an embed link", () => {
    expect(parseYouTubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
  });

  it("accepts a Shorts link", () => {
    expect(parseYouTubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
  });

  it("trims surrounding whitespace from a paste", () => {
    expect(parseYouTubeId(`  ${ID}  `)).toBe(ID);
  });

  it("returns null for anything without a video id", () => {
    expect(parseYouTubeId("https://www.maiyuri.com/start")).toBeNull();
    expect(parseYouTubeId("not a link")).toBeNull();
    expect(parseYouTubeId("")).toBeNull();
  });

  it("does not mistake a playlist-only link for a video", () => {
    expect(
      parseYouTubeId("https://www.youtube.com/playlist?list=PLabcdefghijk"),
    ).toBeNull();
  });
});
