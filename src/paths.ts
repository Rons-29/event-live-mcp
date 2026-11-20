import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Package root (parent of dist/ or src/). */
export const PACKAGE_ROOT = path.resolve(here, "..");

export function resolveDataDir(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.EVENT_LIVE_DATA_DIR) {
    return path.resolve(process.env.EVENT_LIVE_DATA_DIR);
  }
  return path.resolve(process.cwd(), ".data");
}

export function resolveOutputDir(override?: string): string {
  if (override) return path.resolve(override);
  if (process.env.EVENT_LIVE_OUTPUT_DIR) {
    return path.resolve(process.env.EVENT_LIVE_OUTPUT_DIR);
  }
  return path.resolve(process.cwd(), "output");
}

export function eventStatePath(dataDir: string, eventId: string): string {
  return path.join(dataDir, encodeEventDirName(eventId), "state.json");
}

export function eventGroupingPath(dataDir: string, eventId: string): string {
  return path.join(dataDir, encodeEventDirName(eventId), "grouping.json");
}

/**
 * Map an event_id to a unique filesystem directory name.
 * Safe ASCII ids pass through unchanged; all others use injective base64url
 * so distinct ids (e.g. "event/a" vs "event:a") never collide.
 */
export function encodeEventDirName(eventId: string): string {
  const trimmed = eventId.trim();
  if (!trimmed) {
    throw new Error("event_id must not be empty");
  }
  if (/^[a-zA-Z0-9._-]+$/.test(trimmed)) {
    return trimmed;
  }
  return `id_${Buffer.from(trimmed, "utf8").toString("base64url")}`;
}

/** @deprecated Use encodeEventDirName — kept as alias for clarity in call sites. */
export function sanitizeEventId(eventId: string): string {
  return encodeEventDirName(eventId);
}
