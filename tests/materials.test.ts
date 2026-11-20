import { describe, expect, it } from "vitest";
import { groupPostsByTimetable } from "../src/group.js";
import { renderHtml } from "../src/render.js";
import { mergeMaterialsAndPostLinks } from "../src/slides.js";
import type { Post, TalkSlot } from "../src/types.js";
import { FIXTURE_POSTS } from "./fixtures/posts.js";

describe("materialsUrl merge + render", () => {
  it("merges materials URL with extracted links and dedupes identical URLs", () => {
    const post: Post = {
      id: "5001",
      text: "see https://speakerdeck.com/bob_fixture/talk-b-official and https://example.com/notes",
      createdAt: "2026-11-20T10:40:00.000Z",
      authorId: "u2",
      authorUsername: "bob_fixture",
      urls: [
        "https://speakerdeck.com/bob_fixture/talk-b-official",
        "https://example.com/notes",
      ],
      editHistoryIds: ["5001"],
    };

    const links = mergeMaterialsAndPostLinks(
      "https://speakerdeck.com/bob_fixture/talk-b-official",
      [post]
    );

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      url: "https://speakerdeck.com/bob_fixture/talk-b-official",
      fromMaterials: true,
    });
    expect(links.filter((l) => l.url.includes("talk-b-official"))).toHaveLength(
      1
    );
    expect(links.some((l) => l.url === "https://example.com/notes")).toBe(true);
  });

  it("renders materials URL in HTML alongside post-extracted links", () => {
    const timetable: TalkSlot[] = [
      {
        id: "talk-b",
        speaker: "Bob Example",
        title: "Talk B: Testing Stories",
        startTime: "2026-11-20T10:30:00.000Z",
        endTime: "2026-11-20T11:30:00.000Z",
        materialsUrl: "https://speakerdeck.com/bob_fixture/talk-b-official",
      },
    ];

    const grouping = groupPostsByTimetable(
      "materials-demo",
      [FIXTURE_POSTS[2]], // 1003 has google slides link in talk-b window
      timetable
    );

    expect(grouping.talks[0].materialsUrl).toBe(
      "https://speakerdeck.com/bob_fixture/talk-b-official"
    );
    expect(grouping.talks[0].slideLinks.map((l) => l.url)).toEqual([
      "https://speakerdeck.com/bob_fixture/talk-b-official",
      "https://docs.google.com/presentation/d/abc123/edit",
    ]);

    const html = renderHtml({
      title: "Materials demo",
      grouping,
      summaries: [{ talkId: "talk-b", keyPoints: ["Fixture point"] }],
    });

    expect(html).toContain(
      "資料: https://speakerdeck.com/bob_fixture/talk-b-official"
    );
    expect(html).toContain(
      "スライド: https://docs.google.com/presentation/d/abc123/edit"
    );
  });
});
