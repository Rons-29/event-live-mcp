import { describe, expect, it } from "vitest";
import { groupPostsByTimetable } from "../src/group.js";
import { renderHtml } from "../src/render.js";
import { FIXTURE_POSTS, FIXTURE_TIMETABLE } from "./fixtures/posts.js";

describe("renderHtml", () => {
  it("is byte-identical for the same input", () => {
    const grouping = groupPostsByTimetable(
      "demo-event",
      FIXTURE_POSTS,
      FIXTURE_TIMETABLE
    );
    const input = {
      title: "DemoCon live",
      intro: "Fictional meetup tracking page.",
      grouping,
      summaries: [
        {
          talkId: "talk-a",
          keyPoints: ["Point one about quality.", "Point two."],
        },
        {
          talkId: "talk-b",
          keyPoints: ["Testing stories matter."],
        },
        {
          talkId: "unassigned",
          keyPoints: ["Hallway track notes."],
        },
      ],
    };

    const a = renderHtml(input);
    const b = renderHtml(input);
    expect(a).toBe(b);
    expect(Buffer.from(a, "utf8").equals(Buffer.from(b, "utf8"))).toBe(true);
  });

  it("escapes HTML in titles and key points", () => {
    const grouping = groupPostsByTimetable("demo-event", [], FIXTURE_TIMETABLE);
    const html = renderHtml({
      title: `Title <script>alert("x")</script>`,
      grouping,
      summaries: [
        {
          talkId: "talk-a",
          keyPoints: [`Use <b>bold</b> & "quotes"`],
        },
      ],
    });

    expect(html).toContain("Title &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("Use &lt;b&gt;bold&lt;/b&gt; &amp; &quot;quotes&quot;");
    expect(html).not.toContain("<script>alert");
  });

  it("includes post permalinks and slide links", () => {
    const grouping = groupPostsByTimetable(
      "demo-event",
      FIXTURE_POSTS,
      FIXTURE_TIMETABLE
    );
    const html = renderHtml({
      title: "Demo",
      grouping,
      summaries: [],
    });

    expect(html).toContain("https://x.com/alice_demo/status/1001");
    expect(html).toContain("https://speakerdeck.com/alice_demo/opening");
    expect(html).toContain("Talk A: Quality Basics");
    expect(html).toContain("未割当");
  });
});
