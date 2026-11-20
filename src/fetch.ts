import type {
  EventState,
  Post,
  XSearchParams,
  XSearchResponse,
  XTweet,
} from "./types.js";
import type { XClient } from "./x-client.js";
import { withEventLock } from "./lock.js";
import { createEmptyState, loadEventState, saveEventState } from "./state.js";
import { extractUrlsFromText } from "./slides.js";

const TWEET_FIELDS = "created_at,author_id,entities";
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
  newPostCount: number;
  totalPostCount: number;
  sinceId: string | null;
  newPosts: Post[];
  statePath: string;
}

export function normalizeHashtag(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new Error("hashtag must not be empty");
  return trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
}

function buildQuery(hashtag: string): string {
  // Prefer original posts; callers can still see RTs if X returns them for the tag.
  return `#${hashtag} -is:reply`;
}

function compareSnowflakeIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

function maxId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return ids.reduce((best, id) =>
    compareSnowflakeIds(id, best) > 0 ? id : best
  );
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

  return {
    id: tweet.id,
    text: tweet.text,
    createdAt: tweet.created_at ?? new Date(0).toISOString(),
    authorId,
    authorUsername: username,
    urls,
  };
}

function parsePage(
  response: XSearchResponse
): { posts: Post[]; nextToken?: string; newestId?: string } {
  const usersById = new Map<string, { username: string }>();
  for (const user of response.includes?.users ?? []) {
    usersById.set(user.id, { username: user.username });
  }
  const posts = (response.data ?? []).map((t) => mapTweet(t, usersById));
  return {
    posts,
    nextToken: response.meta?.next_token,
    newestId: response.meta?.newest_id,
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

async function fetchNewPostsUnlocked(
  options: FetchOptions,
  hashtag: string
): Promise<FetchResult> {
  // Load INSIDE the lock so concurrent callers see each other's writes.
  const loaded = await loadEventState(options.dataDir, options.eventId);
  let state: EventState;
  if (loaded) {
    assertHashtagMatches(loaded, hashtag);
    state = {
      ...loaded,
      eventId: options.eventId,
      hashtag,
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
  let nextToken: string | undefined;

  do {
    const params: XSearchParams = {
      query: buildQuery(hashtag),
      max_results: MAX_RESULTS,
      "tweet.fields": TWEET_FIELDS,
      expansions: EXPANSIONS,
      "user.fields": USER_FIELDS,
    };

    // X API: at most one of start_time / since_id.
    if (state.sinceId) {
      params.since_id = state.sinceId;
    } else {
      params.start_time = options.startTime;
    }

    if (nextToken) {
      params.next_token = nextToken;
    }

    const page = parsePage(await options.client.searchRecent(params));
    gathered.push(...page.posts);
    nextToken = page.nextToken;
  } while (nextToken);

  const newPosts: Post[] = [];
  for (const post of gathered) {
    if (state.posts[post.id]) continue;
    state.posts[post.id] = post;
    newPosts.push(post);
  }

  const candidateIds = [
    ...Object.keys(state.posts),
    ...(state.sinceId ? [state.sinceId] : []),
  ];
  state.sinceId = maxId(candidateIds);
  state.updatedAt = new Date().toISOString();

  const statePath = await saveEventState(options.dataDir, state);

  newPosts.sort((a, b) => {
    const t = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return t !== 0 ? t : a.id.localeCompare(b.id);
  });

  return {
    eventId: state.eventId,
    hashtag: state.hashtag,
    newPostCount: newPosts.length,
    totalPostCount: Object.keys(state.posts).length,
    sinceId: state.sinceId,
    newPosts,
    statePath,
  };
}

/**
 * Fetch only posts newer than the persisted since_id cursor.
 * First run uses start_time; later runs use since_id (mutually exclusive per X API).
 * Posts already in state are never re-stored (dedupe by id).
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
