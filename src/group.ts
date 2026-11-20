import type {
  EventState,
  GroupResult,
  Post,
  TalkGroup,
  TalkSlot,
} from "./types.js";
import { mergeMaterialsAndPostLinks } from "./slides.js";

function parseTime(iso: string): number {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) {
    throw new Error(`Invalid ISO timestamp: ${iso}`);
  }
  return ms;
}

/** Find the talk slot whose [start, end) contains the post time. First match wins. */
export function findSlotForPost(
  post: Post,
  slots: TalkSlot[]
): TalkSlot | null {
  const t = parseTime(post.createdAt);
  for (const slot of slots) {
    const start = parseTime(slot.startTime);
    const end = parseTime(slot.endTime);
    if (t >= start && t < end) {
      return slot;
    }
  }
  return null;
}

function emptyTalkGroup(slot: TalkSlot): TalkGroup {
  return {
    talkId: slot.id,
    speaker: slot.speaker,
    title: slot.title,
    startTime: slot.startTime,
    endTime: slot.endTime,
    materialsUrl: slot.materialsUrl?.trim() || null,
    posts: [],
    slideLinks: [],
  };
}

function emptyUnassigned(): TalkGroup {
  return {
    talkId: "unassigned",
    speaker: "",
    title: "未割当",
    startTime: null,
    endTime: null,
    materialsUrl: null,
    posts: [],
    slideLinks: [],
  };
}

function sortPostsByTime(posts: Post[]): Post[] {
  return [...posts].sort((a, b) => {
    const ta = Date.parse(a.createdAt);
    const tb = Date.parse(b.createdAt);
    if (ta !== tb) return ta - tb;
    return a.id.localeCompare(b.id);
  });
}

/**
 * Assign stored posts to timetable slots.
 * Posts outside every slot land in the `unassigned` bucket.
 * Slide/URL links are extracted per bucket and merged with optional materialsUrl.
 */
export function groupPostsByTimetable(
  eventId: string,
  posts: Post[],
  timetable: TalkSlot[]
): GroupResult {
  const talks = new Map<string, TalkGroup>();
  for (const slot of timetable) {
    talks.set(slot.id, emptyTalkGroup(slot));
  }
  const unassigned = emptyUnassigned();

  for (const post of sortPostsByTime(posts)) {
    const slot = findSlotForPost(post, timetable);
    if (!slot) {
      unassigned.posts.push(post);
      continue;
    }
    const group = talks.get(slot.id);
    if (!group) {
      unassigned.posts.push(post);
      continue;
    }
    group.posts.push(post);
  }

  for (const slot of timetable) {
    const group = talks.get(slot.id)!;
    group.slideLinks = mergeMaterialsAndPostLinks(
      slot.materialsUrl,
      group.posts
    );
  }
  unassigned.slideLinks = mergeMaterialsAndPostLinks(null, unassigned.posts);

  return {
    eventId,
    talks: timetable.map((slot) => talks.get(slot.id)!),
    unassigned,
  };
}

export function groupFromState(
  state: EventState,
  timetable: TalkSlot[]
): GroupResult {
  return groupPostsByTimetable(
    state.eventId,
    Object.values(state.posts),
    timetable
  );
}
