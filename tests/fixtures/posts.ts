import type { Post, TalkSlot, XSearchResponse } from "../../src/types.js";

/** Entirely fictional usernames / post text — not from any real event. */
export const FIXTURE_POSTS: Post[] = [
  {
    id: "1001",
    text: "Opening notes for DemoCon #demo_event https://speakerdeck.com/alice_demo/opening",
    createdAt: "2026-11-20T10:05:00.000Z",
    authorId: "u1",
    authorUsername: "alice_demo",
    urls: ["https://speakerdeck.com/alice_demo/opening"],
  },
  {
    id: "1002",
    text: "Talk A is starting #demo_event",
    createdAt: "2026-11-20T10:20:00.000Z",
    authorId: "u2",
    authorUsername: "bob_fixture",
    urls: [],
  },
  {
    id: "1003",
    text: "Great slide deck https://docs.google.com/presentation/d/abc123/edit #demo_event",
    createdAt: "2026-11-20T10:35:00.000Z",
    authorId: "u3",
    authorUsername: "carol_sample",
    urls: ["https://docs.google.com/presentation/d/abc123/edit"],
  },
  {
    id: "1004",
    text: "Afterparty vibes #demo_event https://example.com/afterparty",
    createdAt: "2026-11-20T12:10:00.000Z",
    authorId: "u1",
    authorUsername: "alice_demo",
    urls: ["https://example.com/afterparty"],
  },
  {
    id: "1005",
    text: "Boundary post exactly at talk B end should be unassigned #demo_event",
    createdAt: "2026-11-20T11:30:00.000Z",
    authorId: "u4",
    authorUsername: "dave_mock",
    urls: [],
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
  },
];

export function pageFromPosts(
  posts: Post[],
  nextToken?: string
): XSearchResponse {
  const users = new Map<string, { id: string; username: string }>();
  for (const p of posts) {
    users.set(p.authorId, { id: p.authorId, username: p.authorUsername });
  }
  return {
    data: posts.map((p) => ({
      id: p.id,
      text: p.text,
      created_at: p.createdAt,
      author_id: p.authorId,
      entities: {
        urls: p.urls.map((url) => ({
          url,
          expanded_url: url,
          display_url: url.replace(/^https?:\/\//, ""),
        })),
      },
    })),
    includes: { users: [...users.values()] },
    meta: {
      result_count: posts.length,
      newest_id: posts.length
        ? posts.reduce((a, b) => (a.id > b.id ? a : b)).id
        : undefined,
      oldest_id: posts.length
        ? posts.reduce((a, b) => (a.id < b.id ? a : b)).id
        : undefined,
      next_token: nextToken,
    },
  };
}
