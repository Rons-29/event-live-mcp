import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { collapseEditVersions, mergePostsByEditHistory } from "../src/edits.js";
import { fetchNewPosts } from "../src/fetch.js";
import { loadEventState } from "../src/state.js";
import type { XClient } from "../src/x-client.js";
import type { Post, XSearchParams, XSearchResponse } from "../src/types.js";
import { pageFromPosts } from "./fixtures/posts.js";

const tempDirs: string[] = [];

async function makeDataDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "event-live-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) await fs.rm(dir, { recursive: true, force: true });
  }
});

function mockClient(
  handler: (params: XSearchParams) => XSearchResponse | Promise<XSearchResponse>
): XClient {
  return { searchRecent: async (params) => handler(params) };
}

function post(partial: Partial<Post> & Pick<Post, "id" | "text">): Post {
  return {
    createdAt: "2026-11-20T10:00:00.000Z",
    authorId: "u1",
    authorUsername: "edit_fixture",
    urls: [],
    editHistoryIds: [partial.id],
    ...partial,
  };
}

describe("edit history collapse", () => {
  it("keeps only the latest version when both appear in one batch", () => {
    const original = post({
      id: "2001",
      text: "draft text #demo_event",
      editHistoryIds: ["2001"],
    });
    const edited = post({
      id: "2002",
      text: "final text #demo_event",
      createdAt: "2026-11-20T10:01:00.000Z",
      editHistoryIds: ["2001", "2002"],
    });

    const collapsed = collapseEditVersions([original, edited]);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].id).toBe("2002");
    expect(collapsed[0].text).toBe("final text #demo_event");
  });

  it("replaces a stored original when a later fetch returns the edit", () => {
    const store: Record<string, Post> = {
      "2001": post({
        id: "2001",
        text: "draft text #demo_event",
        editHistoryIds: ["2001"],
      }),
    };
    const edited = post({
      id: "2002",
      text: "final text #demo_event",
      editHistoryIds: ["2001", "2002"],
    });

    const result = mergePostsByEditHistory(store, [edited]);
    expect(Object.keys(store)).toEqual(["2002"]);
    expect(store["2002"].text).toBe("final text #demo_event");
    expect(result.added).toHaveLength(0);
    expect(result.updated).toHaveLength(1);
    expect(result.updated[0].id).toBe("2002");
  });
});

describe("fetchNewPosts edit dedupe across calls", () => {
  it("counts an edit pair in one fetch as a single post", async () => {
    const dataDir = await makeDataDir();
    const original = post({
      id: "3001",
      text: "v1 #demo_event",
      editHistoryIds: ["3001"],
    });
    const edited = post({
      id: "3002",
      text: "v2 #demo_event",
      createdAt: "2026-11-20T10:05:00.000Z",
      editHistoryIds: ["3001", "3002"],
    });

    const client = mockClient(() => pageFromPosts([original, edited]));
    const result = await fetchNewPosts({
      eventId: "edit-same-fetch",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    expect(result.newPostCount).toBe(1);
    expect(result.updatedPostCount).toBe(0);
    expect(result.totalPostCount).toBe(1);
    expect(result.newPosts[0].id).toBe("3002");

    const state = await loadEventState(dataDir, "edit-same-fetch");
    expect(Object.keys(state!.posts)).toEqual(["3002"]);
  });

  it("keeps only the latest version when the edit arrives in a later fetch", async () => {
    const dataDir = await makeDataDir();
    let round = 0;
    const client = mockClient(() => {
      round += 1;
      if (round === 1) {
        return pageFromPosts([
          post({
            id: "4001",
            text: "original body #demo_event",
            editHistoryIds: ["4001"],
          }),
        ]);
      }
      return pageFromPosts([
        post({
          id: "4002",
          text: "edited body #demo_event",
          createdAt: "2026-11-20T10:10:00.000Z",
          editHistoryIds: ["4001", "4002"],
        }),
      ]);
    });

    const first = await fetchNewPosts({
      eventId: "edit-later",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });
    expect(first.newPostCount).toBe(1);
    expect(first.totalPostCount).toBe(1);

    const second = await fetchNewPosts({
      eventId: "edit-later",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });
    expect(second.newPostCount).toBe(0);
    expect(second.updatedPostCount).toBe(1);
    expect(second.totalPostCount).toBe(1);
    expect(second.updatedPosts[0].id).toBe("4002");
    expect(second.updatedPosts[0].text).toBe("edited body #demo_event");

    const state = await loadEventState(dataDir, "edit-later");
    expect(Object.keys(state!.posts)).toEqual(["4002"]);
    expect(state!.posts["4002"].editHistoryIds).toEqual(["4001", "4002"]);
  });
});
