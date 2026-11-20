import { describe, expect, it } from "vitest";
import { findSlotForPost, groupPostsByTimetable } from "../src/group.js";
import { FIXTURE_POSTS, FIXTURE_TIMETABLE } from "./fixtures/posts.js";

describe("groupPostsByTimetable", () => {
  it("assigns posts to slots and puts outsiders in unassigned", () => {
    const result = groupPostsByTimetable(
      "demo-event",
      FIXTURE_POSTS,
      FIXTURE_TIMETABLE
    );

    expect(result.talks).toHaveLength(2);

    const talkA = result.talks[0];
    expect(talkA.talkId).toBe("talk-a");
    // 1001 @10:05, 1002 @10:20 → talk-a [10:00, 10:30)
    expect(talkA.posts.map((p) => p.id)).toEqual(["1001", "1002"]);

    const talkB = result.talks[1];
    expect(talkB.talkId).toBe("talk-b");
    // 1003 @10:35 → talk-b [10:30, 11:30); 1005 @11:30 is exclusive end → unassigned
    expect(talkB.posts.map((p) => p.id)).toEqual(["1003"]);

    expect(result.unassigned.posts.map((p) => p.id)).toEqual(["1005", "1004"]);
  });

  it("treats endTime as exclusive and startTime as inclusive", () => {
    const atStart = FIXTURE_POSTS.find((p) => p.id === "1001")!;
    // 10:05 is inside talk-a
    expect(findSlotForPost(atStart, FIXTURE_TIMETABLE)?.id).toBe("talk-a");

    const atEndBoundary = FIXTURE_POSTS.find((p) => p.id === "1005")!;
    expect(findSlotForPost(atEndBoundary, FIXTURE_TIMETABLE)).toBeNull();

    const after = FIXTURE_POSTS.find((p) => p.id === "1004")!;
    expect(findSlotForPost(after, FIXTURE_TIMETABLE)).toBeNull();
  });

  it("extracts slide links per talk", () => {
    const result = groupPostsByTimetable(
      "demo-event",
      FIXTURE_POSTS,
      FIXTURE_TIMETABLE
    );

    const talkA = result.talks[0];
    expect(talkA.slideLinks.some((l) => l.url.includes("speakerdeck.com"))).toBe(
      true
    );
    expect(talkA.slideLinks[0].isSlideHost).toBe(true);

    const talkB = result.talks[1];
    expect(
      talkB.slideLinks.some((l) => l.url.includes("docs.google.com/presentation"))
    ).toBe(true);

    const unassigned = result.unassigned;
    expect(unassigned.posts.map((p) => p.id).sort()).toEqual(["1004", "1005"]);
    expect(unassigned.slideLinks.map((l) => l.url)).toEqual([
      "https://example.com/afterparty",
    ]);
    expect(unassigned.slideLinks[0].isSlideHost).toBe(false);
  });

  it("keeps talk order identical to timetable even when empty", () => {
    const result = groupPostsByTimetable("empty", [], FIXTURE_TIMETABLE);
    expect(result.talks.map((t) => t.talkId)).toEqual(["talk-a", "talk-b"]);
    expect(result.talks.every((t) => t.posts.length === 0)).toBe(true);
    expect(result.unassigned.posts).toEqual([]);
  });
});
