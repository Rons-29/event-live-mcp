import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fetchNewPosts, isRetweet } from "../src/fetch.js";
import type { XClient } from "../src/x-client.js";
import type { XSearchParams, XSearchResponse, XTweet } from "../src/types.js";
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
  return { searchRecent: async (params) => handler(params) };
}

describe("retweet exclusion", () => {
  it("detects retweets via referenced_tweets and RT @ prefix", () => {
    expect(
      isRetweet({
        id: "1",
        text: "hello",
        referenced_tweets: [{ type: "retweeted", id: "99" }],
      })
    ).toBe(true);
    expect(
      isRetweet({
        id: "2",
        text: "RT @someone: copied text",
      })
    ).toBe(true);
    expect(
      isRetweet({
        id: "3",
        text: "quoting thoughts",
        referenced_tweets: [{ type: "quoted", id: "88" }],
      })
    ).toBe(false);
  });

  it("excludes retweets from fetch results and uses -is:retweet in the query", async () => {
    const dataDir = await makeDataDir();
    const queries: string[] = [];
    const retweet: XTweet = {
      id: "9001",
      text: "RT @alice_demo: Opening notes",
      created_at: "2026-11-20T10:06:00.000Z",
      author_id: "u9",
      edit_history_tweet_ids: ["9001"],
      referenced_tweets: [{ type: "retweeted", id: "1001" }],
    };

    const client = mockClient((params) => {
      queries.push(params.query);
      return pageFromPosts([FIXTURE_POSTS[0]], undefined, { rawTweets: [retweet] });
    });

    const result = await fetchNewPosts({
      eventId: "no-rt",
      hashtag: "demo_event",
      startTime: "2026-11-20T10:00:00.000Z",
      dataDir,
      client,
    });

    expect(queries[0]).toContain("-is:retweet");
    expect(result.newPostCount).toBe(1);
    expect(result.newPosts.map((p) => p.id)).toEqual(["1001"]);
    expect(result.totalPostCount).toBe(1);
  });
});
