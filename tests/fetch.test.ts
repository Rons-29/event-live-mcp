import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchNewPosts } from "../src/fetch.js";
import { loadEventState } from "../src/state.js";
import type { XClient } from "../src/x-client.js";
import type { XSearchParams, XSearchResponse } from "../src/types.js";
import { FIXTURE_POSTS, pageFromPosts } from "./fixtures/posts.js";

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
  return {
    searchRecent: async (params) => handler(params),
  };
}

describe("fetchNewPosts dedupe + since_id cursor", () => {
  it("stores posts once and uses since_id on the second call", async () => {
    const dataDir = await makeDataDir();
    const calls: XSearchParams[] = [];
    let round = 0;

    const client = mockClient((params) => {
      calls.push({ ...params });
      round += 1;
      if (round === 1) {
        return pageFromPosts(FIXTURE_POSTS.slice(0, 3));
      }
      if (round === 2) {
        // API would return only newer ids when since_id is set; simulate that
        // plus an overlapping id that must not be double-stored.
        return pageFromPosts([FIXTURE_POSTS[2], FIXTURE_POSTS[3]]);
      }
      return pageFromPosts([]);
    });

    const first = await fetchNewPosts({
      eventId: "demo-event",
      hashtag: "#demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    expect(first.newPostCount).toBe(3);
    expect(first.totalPostCount).toBe(3);
    expect(first.sinceId).toBe("1003");
    expect(calls[0].start_time).toBe("2026-11-20T10:00:00.000Z");
    expect(calls[0].since_id).toBeUndefined();

    const second = await fetchNewPosts({
      eventId: "demo-event",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    expect(calls[1].since_id).toBe("1003");
    expect(calls[1].start_time).toBeUndefined();
    expect(second.newPostCount).toBe(1);
    expect(second.newPosts.map((p) => p.id)).toEqual(["1004"]);
    expect(second.totalPostCount).toBe(4);
    expect(second.sinceId).toBe("1004");

    const state = await loadEventState(dataDir, "demo-event");
    expect(state).not.toBeNull();
    expect(Object.keys(state!.posts).sort()).toEqual([
      "1001",
      "1002",
      "1003",
      "1004",
    ]);
  });

  it("paginates with next_token and still dedupes by id", async () => {
    const dataDir = await makeDataDir();
    const calls: XSearchParams[] = [];

    const client = mockClient((params) => {
      calls.push({ ...params });
      if (!params.next_token) {
        return pageFromPosts(FIXTURE_POSTS.slice(0, 2), "PAGE2");
      }
      if (params.next_token === "PAGE2") {
        // Overlap id 1002 intentionally
        return pageFromPosts([FIXTURE_POSTS[1], FIXTURE_POSTS[2]]);
      }
      return pageFromPosts([]);
    });

    const result = await fetchNewPosts({
      eventId: "paged",
      hashtag: "demo_event",
      startTime: "2026-11-20T09:00:00.000Z",
      dataDir,
      client,
    });

    expect(calls).toHaveLength(2);
    expect(calls[1].next_token).toBe("PAGE2");
    expect(result.newPostCount).toBe(3);
    expect(result.totalPostCount).toBe(3);
  });

  it("returns zero new posts when API returns nothing new", async () => {
    const dataDir = await makeDataDir();
    let round = 0;
    const client = mockClient(() => {
      round += 1;
      return round === 1 ? pageFromPosts([FIXTURE_POSTS[0]]) : pageFromPosts([]);
    });

    await fetchNewPosts({
      eventId: "empty-second",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    const second = await fetchNewPosts({
      eventId: "empty-second",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    expect(second.newPostCount).toBe(0);
    expect(second.totalPostCount).toBe(1);
  });
});

describe("fetchNewPosts concurrency + hashtag guard", () => {
  it("serializes overlapping fetches so both result sets are kept", async () => {
    const dataDir = await makeDataDir();
    let releaseA!: () => void;
    const gateA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    let aStarted = false;

    const clientA = mockClient(async () => {
      aStarted = true;
      await gateA;
      return pageFromPosts([FIXTURE_POSTS[0]]); // id 1001
    });
    const clientB = mockClient(async () => {
      return pageFromPosts([FIXTURE_POSTS[1]]); // id 1002
    });

    const pA = fetchNewPosts({
      eventId: "shared",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client: clientA,
    });

    // Wait until A holds the lock and is inside the API call.
    while (!aStarted) {
      await new Promise((r) => setTimeout(r, 5));
    }

    const pB = fetchNewPosts({
      eventId: "shared",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client: clientB,
    });

    // Give B a moment to block on the lock, then finish A.
    await new Promise((r) => setTimeout(r, 30));
    releaseA();

    const [a, b] = await Promise.all([pA, pB]);
    expect(a.newPostCount + b.newPostCount).toBe(2);

    const state = await loadEventState(dataDir, "shared");
    expect(Object.keys(state!.posts).sort()).toEqual(["1001", "1002"]);
    expect(state!.sinceId).toBe("1002");
  });

  it("rejects reusing event_id with a different hashtag", async () => {
    const dataDir = await makeDataDir();
    const client = mockClient(() => pageFromPosts([FIXTURE_POSTS[0]]));

    await fetchNewPosts({
      eventId: "bound",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    await expect(
      fetchNewPosts({
        eventId: "bound",
        hashtag: "other_tag",
        startTime: "2026-11-20T10:00:00.000Z",
        dataDir,
        client,
      })
    ).rejects.toThrow(/already bound to #demo_event/);
  });
});
