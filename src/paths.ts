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
  return path.join(dataDir, sanitizeEventId(eventId), "state.json");
}

export function eventGroupingPath(dataDir: string, eventId: string): string {
  return path.join(dataDir, sanitizeEventId(eventId), "grouping.json");
}

/** Keep event ids filesystem-safe. */
export function sanitizeEventId(eventId: string): string {
  const cleaned = eventId.trim().replace(/[^a-zA-Z0-9._-]+/g, "_");
  if (!cleaned) {
    throw new Error("event_id must contain at least one alphanumeric character");
  }
  return cleaned;
}
