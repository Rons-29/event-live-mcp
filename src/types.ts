/** A single X post stored locally after fetch. */
export interface Post {
  id: string;
  text: string;
  createdAt: string;
  authorId: string;
  authorUsername: string;
  /** Expanded URLs from entities (or parsed from text as fallback). */
  urls: string[];
  /**
   * X edit-history chain (oldest → newest). Always includes `id`.
   * All versions of an edited post share one chain and count as one logical post.
   */
  editHistoryIds: string[];
}

/** Persisted per-event fetch cursor + post store. */
export interface EventState {
  eventId: string;
  hashtag: string;
  /** ISO-8601 start bound for the first fetch (when no sinceId yet). */
  startTime: string;
  /** Highest post id seen; used as X API since_id on later fetches. */
  sinceId: string | null;
  /**
   * Posts keyed by the kept (latest) version id.
   * Edit chains are collapsed so only one entry exists per logical post.
   */
  posts: Record<string, Post>;
  updatedAt: string;
}

/** One talk slot on the caller-supplied timetable. */
export interface TalkSlot {
  id: string;
  speaker: string;
  title: string;
  /** Inclusive start (ISO-8601). */
  startTime: string;
  /** Exclusive end (ISO-8601). */
  endTime: string;
  /**
   * Optional official materials / slides URL supplied by the caller
   * (not scraped by this server). Merged with URLs extracted from posts.
   */
  materialsUrl?: string;
}

export interface SlideLink {
  url: string;
  /** True when host looks like a known slide host. */
  isSlideHost: boolean;
  /** Source post id when extracted from a post; null for timetable materials. */
  sourcePostId: string | null;
  /** True when the URL came from TalkSlot.materialsUrl. */
  fromMaterials: boolean;
}

export interface TalkGroup {
  talkId: string;
  speaker: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  /** Echo of timetable materialsUrl when present. */
  materialsUrl: string | null;
  posts: Post[];
  slideLinks: SlideLink[];
}

export interface GroupResult {
  eventId: string;
  talks: TalkGroup[];
  unassigned: TalkGroup;
}

export interface TalkSummaryInput {
  talkId: string;
  /** Key points / summary lines produced by the calling AI. */
  keyPoints: string[];
}

export interface RenderInput {
  title: string;
  intro?: string;
  grouping: GroupResult;
  summaries: TalkSummaryInput[];
}

/** Minimal X API recent-search response shapes we care about. */
export interface XSearchResponse {
  data?: XTweet[];
  includes?: {
    users?: XUser[];
  };
  meta?: {
    newest_id?: string;
    oldest_id?: string;
    result_count?: number;
    next_token?: string;
  };
  errors?: unknown[];
}

export interface XTweet {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  edit_history_tweet_ids?: string[];
  edit_controls?: {
    edits_remaining?: number | string;
    is_edit_eligible?: boolean;
    editable_until?: string;
  };
  referenced_tweets?: Array<{
    type: "retweeted" | "quoted" | "replied_to" | string;
    id: string;
  }>;
  entities?: {
    urls?: Array<{
      url?: string;
      expanded_url?: string;
      display_url?: string;
    }>;
  };
}

export interface XUser {
  id: string;
  username: string;
  name?: string;
}

export interface XSearchParams {
  query: string;
  max_results?: number;
  start_time?: string;
  since_id?: string;
  next_token?: string;
  "tweet.fields"?: string;
  expansions?: string;
  "user.fields"?: string;
}
