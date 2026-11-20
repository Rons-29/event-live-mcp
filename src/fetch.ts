import type {
  EventState,
  Post,
  XSearchParams,
  XSearchResponse,
  XTweet,
} from "./types.js";
import type { XClient } from "./x-client.js";
import {
  maxSnowflakeId,
  mergePostsByEditHistory,
} from "./edits.js";
import { withEventLock } from "./lock.js";
import { createEmptyState, loadEventState, saveEventState } from "./state.js";
import { extractUrlsFromText } from "./slides.js";

const TWEET_FIELDS =
  "created_at,author_id,entities,edit_history_tweet_ids,edit_controls,referenced_tweets";
const EXPANSIONS = "author_id";
const USER_FIELDS = "username,name";
const MAX_RESULTS = 100;

export interface FetchOptions {
  eventId: string;
  hashtag: string;
  /** ISO-8601 lower bound used only when no sinceId cursor exists yet. */
  startTime: string;
  dataDir: string;
  client: XClient;
}

export interface FetchResult {
  eventId: string;
  hashtag: string;
  /** Newly added logical posts (not edit replacements). */
  newPostCount: number;
  /** Existing chains replaced with a newer edit version. */
  updatedPostCount: number;
  totalPostCount: number;
  sinceId: string | null;
  newPosts: Post[];
  updatedPosts: Post[];
  statePath: string;
}

export function normalizeHashtag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("hashtag must not be empty");
  return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
}

function buildQuery(hashtag: string): string {
  // Exclude pure retweets in the query; also filtered in code as defense in depth.
  // Replies remain excluded as in v1 (quotes are kept).
  return `#${hashtag} -is:retweet -is:reply`;
}

export function isRetweet(tweet: XTweet): boolean {
  if ((tweet.referenced_tweets ?? []).some((r) => r.type === "retweeted")) {
    return true;
  }
  // Fallback for payloads missing referenced_tweets.
  return /^RT\s+@/i.test(tweet.text.trim());
}

function mapTweet(
  tweet: XTweet,
  usersById: Map<string, { username: string }>
): Post {
  const authorId = tweet.author_id ?? "";
  const username = usersById.get(authorId)?.username ?? "unknown";
  const entityUrls =
    tweet.entities?.urls
      ?.map((u) => u.expanded_url || u.url || "")
      .filter(Boolean) ?? [];
  const urls = [...new Set([...entityUrls, ...extractUrlsFromText(tweet.text)])];
  const history =
    tweet.edit_history_tweet_ids && tweet.edit_history_tweet_ids.length > 0
      ? [...tweet.edit_history_tweet_ids]
      : [tweet.id];
  if (!history.includes(tweet.id)) {
    history.push(tweet.id);
  }

  return {
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at ?? new Date(0).toISOString(),
    authorId,
    authorUsername: username,
    urls,
    editHistoryIds: history,
  };
}

function parsePage(
  response: XSearchResponse
): { posts: Post[]; nextToken?: string } {
  const usersById = new Map<string, { username: string }>();
  for (const user of response.includes?.users ?? []) {
    usersById.set(user.id, { username: user.username });
  }
  const posts = (response.data ?? [])
    .filter((t) => !isRetweet(t))
    .map((t) => mapTweet(t, usersById));
  return {
    posts,
    nextToken: response.meta?.next_token,
  };
}

function assertHashtagMatches(state: EventState, hashtag: string): void {
  const existing = normalizeHashtag(state.hashtag);
  if (existing !== hashtag) {
    throw new Error(
      `event_id "${state.eventId}" is already bound to #${existing}; ` +
        `refusing to switch to #${hashtag}. Use a different event_id for the new hashtag.`
    );
  }
}

/** Advance since_id using kept posts and any ids observed in edit histories. */
function advanceSinceId(
  state: EventState,
  observedIds: string[]
): string | null {
  const candidates = [
    ...Object.keys(state.posts),
    ...Object.values(state.posts).flatMap((p) => p.editHistoryIds),
    ...observedIds,
    ...(state.sinceId ? [state.sinceId] : []),
  ];
  return maxSnowflakeId(candidates);
}

async function fetchNewPostsUnlocked(
  options: FetchOptions,
  hashtag: string
): Promise<FetchResult> {
  const loaded = await loadEventState(options.dataDir, options.eventId);
  let state: EventState;
  if (loaded) {
    assertHashtagMatches(loaded, hashtag);
    // Migrate posts that predate editHistoryIds.
    const posts: Record<string, Post> = {};
    for (const [id, post] of Object.entries(loaded.posts)) {
      posts[id] = {
        ...post,
        editHistoryIds:
          post.editHistoryIds && post.editHistoryIds.length > 0
            ? post.editHistoryIds
            : [post.id],
      };
    }
    state = {
      ...loaded,
      eventId: options.eventId,
      hashtag,
      posts,
      startTime: loaded.sinceId ? loaded.startTime : options.startTime,
    };
  } else {
    state = createEmptyState({
      eventId: options.eventId,
      hashtag,
      startTime: options.startTime,
    });
  }

  const gathered: Post[] = [];
  const observedIds: string[] = [];
  let nextToken: string | undefined;

  do {
    const params: XSearchParams = {
      query: buildQuery(hashtag),
      max_results: MAX_RESULTS,
      "tweet.fields": TWEET_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
    };

    if (state.sinceId) {
      params.since_id = state.sinceId;
    } else {
      params.start_time = options.startTime;
    }

    if (nextToken) {
      params.next_token = nextToken;
    }

    const page = parsePage(await options.client.searchRecent(params));
    for (const post of page.posts) {
      gathered.push(post);
      observedIds.push(...post.editHistoryIds, post.id);
    }
    nextToken = page.nextToken;
  } while (nextToken);

  const { added, updated } = mergePostsByEditHistory(state.posts, gathered);

  state.sinceId = advanceSinceId(state, observedIds);
  state.updatedAt = new Date().toISOString();

  const statePath = await saveEventState(options.dataDir, state);

  const byTime = (a: Post, b: Post) => {
    const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  };
  added.sort(byTime);
  updated.sort(byTime);

  return {
    eventId: state.eventId,
    hashtag: state.hashtag,
    newPostCount: added.length,
    updatedPostCount: updated.length,
    totalPostCount: Object.keys(state.posts).length,
    sinceId: state.sinceId,
    newPosts: added,
    updatedPosts: updated,
    statePath,
  };
}

/**
 * Fetch only posts newer than the persisted since_id cursor.
 * Retweets are excluded. Edited posts collapse to one logical post (latest version).
 * The full load/fetch/save path is serialized per event (cross-process lock).
 */
export async function fetchNewPosts(
  options: FetchOptions
): Promise<FetchResult> {
  const hashtag = normalizeHashtag(options.hashtag);
  return withEventLock(options.dataDir, options.eventId, () =>
    fetchNewPostsUnlocked(options, hashtag)
  );
}
