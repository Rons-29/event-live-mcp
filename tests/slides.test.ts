import { describe, expect, it } from "vitest";
import {
  cleanUrl,
  collectPostUrls,
  extractSlideLinks,
  extractUrlsFromText,
  isSlideHost,
} from "../src/slides.js";
import type { Post } from "../src/types.js";

describe("slide / URL extraction", () => {
  it("detects known slide hosts", () => {
    expect(isSlideHost("https://speakerdeck.com/user/deck")).toBe(true);
    expect(isSlideHost("https://www.slideshare.net/user/deck")).toBe(true);
    expect(
      isSlideHost("https://docs.google.com/presentation/d/xyz/edit")
    ).toBe(true);
    expect(isSlideHost("https://docs.google.com/document/d/xyz/edit")).toBe(
      false
    );
    expect(isSlideHost("https://example.com/notes")).toBe(false);
  });

  it("extracts URLs from text and strips trailing punctuation", () => {
    const text =
      "See https://speakerdeck.com/demo/deck. Also https://example.com/x)!";
    expect(extractUrlsFromText(text)).toEqual([
      "https://speakerdeck.com/demo/deck",
      "https://example.com/x",
    ]);
    expect(cleanUrl("https://example.com/a.")).toBe("https://example.com/a");
  });

  it("merges entity urls with text urls and flags slide hosts first", () => {
    const post: Post = {
      id: "9",
      text: "extra https://example.com/blog",
      createdAt: "2026-01-01T00:00:00.000Z",
      authorId: "u",
      authorUsername: "fixture_user",
      urls: ["https://speakerdeck.com/fixture/deck"],
      editHistoryIds: ["9"],
    };
    expect(collectPostUrls(post).sort()).toEqual([
      "https://example.com/blog",
      "https://speakerdeck.com/fixture/deck",
    ]);

    const links = extractSlideLinks([post]);
    expect(links[0].url).toBe("https://speakerdeck.com/fixture/deck");
    expect(links[0].isSlideHost).toBe(true);
    expect(links[1].isSlideHost).toBe(false);
  });
});
