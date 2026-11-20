import type { Post, TalkSlot, XSearchResponse, XTweet } from "../../src/types.js";

/** Entirely fictional usernames / post text — not from any real event. */
export const FIXTURE_POSTS: Post[] = [
  {
    id: "1001",
    text: "Opening notes for DemoCon #demo_event https://speakerdeck.com/alice_demo/opening",
    createdAt: "2026-11-20T10:05:00.000Z",
    authorId: "u1",
    authorUsername: "alice_demo",
    urls: ["https://speakerdeck.com/alice_demo/opening"],
    editHistoryIds: ["1001"],
  },
  {
    id: "1002",
    text: "Talk A is starting #demo_event",
    createdAt: "2026-11-20T10:20:00.000Z",
    authorId: "u2",
    authorUsername: "bob_fixture",
    urls: [],
    editHistoryIds: ["1002"],
  },
  {
    id: "1003",
    text: "Great slide deck https://docs.google.com/presentation/d/abc123/edit #demo_event",
    createdAt: "2026-11-20T10:35:00.000Z",
    authorId: "u3",
    authorUsername: "carol_sample",
    urls: ["https://docs.google.com/presentation/d/abc123/edit"],
    editHistoryIds: ["1003"],
  },
  {
    id: "1004",
    text: "Afterparty vibes #demo_event https://example.com/afterparty",
    createdAt: "2026-11-20T12:10:00.000Z",
    authorId: "u1",
    authorUsername: "alice_demo",
    urls: ["https://example.com/afterparty"],
    editHistoryIds: ["1004"],
  },
  {
    id: "1005",
    text: "Boundary post exactly at talk B end should be unassigned #demo_event",
    createdAt: "2026-11-20T11:30:00.000Z",
    authorId: "u4",
    authorUsername: "dave_mock",
    urls: [],
    editHistoryIds: ["1005"],
  },
];

export const FIXTURE_TIMETABLE: TalkSlot[] = [
  {
    id: "talk-a",
    speaker: "Alice Example",
    title: "Talk A: Quality Basics",
    startTime: "2026-11-20T10:00:00.000Z",
    endTime: "2026-11-20T10:30:00.000Z",
  },
  {
    id: "talk-b",
    speaker: "Bob Example",
    title: "Talk B: Testing Stories",
    startTime: "2026-11-20T10:30:00.000Z",
    endTime: "2026-11-20T11:30:00.000Z",
    materialsUrl: "https://speakerdeck.com/bob_fixture/talk-b-official",
  },
];

export function pageFromPosts(
  posts: Post[],
  nextToken?: string,
  extras?: {
    /** Extra raw tweets appended (e.g. retweets) after mapped posts. */
    rawTweets?: XTweet[];
  }
): XSearchResponse {
  const users = new Map<string, { id: string; username: string }>();
  for (const p of posts) {
    users.set(p.authorId, { id: p.authorId, username: p.authorUsername });
  }

  const data: XTweet[] = posts.map((p) => ({
    id: p.id,
    text: p.text,
    created_at: p.createdAt,
    author_id: p.authorId,
    edit_history_tweet_ids: p.editHistoryIds,
    entities: {
      urls: p.urls.map((url) => ({
        url,
        expanded_url: url,
        display_url: url.replace(/^https?:\/\//, ""),
      })),
    },
  }));

  if (extras?.rawTweets) {
    data.push(...extras.rawTweets);
    for (const t of extras.rawTweets) {
      if (t.author_id) {
        users.set(t.author_id, {
          id: t.author_id,
          username: "rt_bot_fixture",
        });
      }
    }
  }

  return {
    data,
    includes: { users: [...users.values()] },
    meta: {
      result_count: data.length,
      newest_id: data.length
        ? data.reduce((a, b) => (a.id > b.id ? a : b)).id
        : undefined,
      oldest_id: data.length
        ? data.reduce((a, b) => (a.id < b.id ? a : b)).id
        : undefined,
      next_token: nextToken,
    },
  };
}
