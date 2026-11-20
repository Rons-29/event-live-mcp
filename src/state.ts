import fs from "node:fs/promises";
import path from "node:path";
import type { EventState, GroupResult } from "./types.js";
import { eventGroupingPath, eventStatePath } from "./paths.js";

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

export async function loadEventState(
  dataDir: string,
  eventId: string
): Promise<EventState | null> {
  const filePath = eventStatePath(dataDir, eventId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as EventState;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function saveEventState(
  dataDir: string,
  state: EventState
): Promise<string> {
  const filePath = eventStatePath(dataDir, state.eventId);
  await ensureParentDir(filePath);
  const body = `${JSON.stringify(state, null, 2)}\n`;
  await fs.writeFile(filePath, body, "utf8");
  return filePath;
}

export function createEmptyState(input: {
  eventId: string;
  hashtag: string;
  startTime: string;
}): EventState {
  return {
    eventId: input.eventId,
    hashtag: input.hashtag,
    startTime: input.startTime,
    sinceId: null,
    posts: {},
    updatedAt: new Date(0).toISOString(),
  };
}

export async function loadGrouping(
  dataDir: string,
  eventId: string
): Promise<GroupResult | null> {
  const filePath = eventGroupingPath(dataDir, eventId);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as GroupResult;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return null;
    throw err;
  }
}

export async function saveGrouping(
  dataDir: string,
  grouping: GroupResult
): Promise<string> {
  const filePath = eventGroupingPath(dataDir, grouping.eventId);
  await ensureParentDir(filePath);
  const body = `${JSON.stringify(grouping, null, 2)}\n`;
  await fs.writeFile(filePath, body, "utf8");
  return filePath;
}
