import type { Post } from "./types.js";

/** Compare X snowflake ids as big-endian decimal strings. */
export function compareSnowflakeIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length < b.length ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

export function maxSnowflakeId(ids: string[]): string | null {
  if (ids.length === 0) return null;
  return ids.reduce((best, id) =>
    compareSnowflakeIds(id, best) > 0 ? id : best
  );
}

export function postEditIds(post: Post): string[] {
  const ids = post.editHistoryIds.length > 0 ? post.editHistoryIds : [post.id];
  return [...new Set(ids)];
}

export function historiesOverlap(a: string[], b: string[]): boolean {
  const setB = new Set(b);
  return a.some((id) => setB.has(id));
}

/** Prefer the post with the highest snowflake id among the union of histories. */
export function preferNewerVersion(a: Post, b: Post): Post {
  const latest = maxSnowflakeId([...postEditIds(a), ...postEditIds(b)]);
  if (latest === a.id) return a;
  if (latest === b.id) return b;
  // Fallback: longer history wins, then lexicographic id.
  const aHist = postEditIds(a);
  const bHist = postEditIds(b);
  if (aHist.length !== bHist.length) {
    return aHist.length > bHist.length ? a : b;
  }
  return compareSnowflakeIds(a.id, b.id) >= 0 ? a : b;
}

/**
 * Collapse pre-edit / post-edit versions that appear in the same batch
 * into a single logical post (latest version only).
 */
export function collapseEditVersions(posts: Post[]): Post[] {
  const groups: Post[][] = [];

  for (const post of posts) {
    const ids = postEditIds(post);
    let mergedInto: Post[] | null = null;
    const consumed: number[] = [];

    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      const groupIds = group.flatMap(postEditIds);
      if (historiesOverlap(ids, groupIds)) {
        if (!mergedInto) {
          mergedInto = group;
          mergedInto.push(post);
        } else {
          mergedInto.push(...group);
          consumed.push(i);
        }
      }
    }

    if (!mergedInto) {
      groups.push([post]);
    } else {
      for (const idx of consumed.reverse()) {
        groups.splice(idx, 1);
      }
    }
  }

  return groups.map((group) =>
    group.reduce((best, cur) => preferNewerVersion(best, cur))
  );
}

export interface MergeEditResult {
  /** Posts stored after merge (map is mutated in place). */
  posts: Record<string, Post>;
  /** Logical posts added for the first time. */
  added: Post[];
  /** Existing chains replaced with a newer edit version. */
  updated: Post[];
}

/**
 * Merge incoming posts into the store, treating edit-history chains as one post.
 * Older versions are removed; only the latest version remains.
 */
export function mergePostsByEditHistory(
  store: Record<string, Post>,
  incoming: Post[]
): MergeEditResult {
  const collapsed = collapseEditVersions(incoming);
  const added: Post[] = [];
  const updated: Post[] = [];

  for (const post of collapsed) {
    const incomingIds = postEditIds(post);
    let conflictKey: string | null = null;

    for (const [key, existing] of Object.entries(store)) {
      if (historiesOverlap(incomingIds, postEditIds(existing))) {
        conflictKey = key;
        break;
      }
    }

    if (conflictKey) {
      const existing = store[conflictKey];
      if (post.id === existing.id) {
        // Same version id (re-fetch) — refresh payload, not a new logical post.
        store[conflictKey] = {
          ...existing,
          ...post,
          editHistoryIds:
            postEditIds(post).length >= postEditIds(existing).length
              ? postEditIds(post)
              : postEditIds(existing),
        };
        continue;
      }
      const preferred = preferNewerVersion(post, existing);
      if (preferred.id === existing.id) {
        // Incoming is an older version — keep store as-is.
        continue;
      }
      delete store[conflictKey];
      for (const id of incomingIds) {
        if (store[id] && store[id].id !== preferred.id) {
          delete store[id];
        }
      }
      store[preferred.id] = preferred;
      updated.push(preferred);
      continue;
    }

    if (store[post.id]) {
      continue;
    }

    store[post.id] = post;
    added.push(post);
  }

  return { posts: store, added, updated };
}
