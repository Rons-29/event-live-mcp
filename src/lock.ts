import fs from "node:fs/promises";
import path from "node:path";
import { encodeEventDirName } from "./paths.js";

export interface LockOptions {
  /** Max time to wait for the lock (default 30s). */
  timeoutMs?: number;
  /** Treat an existing lock older than this as stale (default 120s). */
  staleMs?: number;
  /** Poll interval while waiting (default ~50–100ms jitter). */
  pollMs?: number;
}

function eventLockPath(dataDir: string, eventId: string): string {
  return path.join(dataDir, encodeEventDirName(eventId), ".lock");
}

/**
 * Cross-process exclusive lock for one event directory.
 * Covers the full load → mutate → save critical section so concurrent
 * Claude Code / Cursor fetches cannot clobber each other's state.
 */
export async function withEventLock<T>(
  dataDir: string,
  eventId: string,
  fn: () => Promise<T>,
  options: LockOptions = {}
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const staleMs = options.staleMs ?? 120_000;
  const pollMs = options.pollMs ?? 50;
  const lockPath = eventLockPath(dataDir, eventId);

  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  const started = Date.now();
  for (;;) {
    try {
      // "wx" = create exclusively; fails with EEXIST if another holder exists.
      const handle = await fs.open(lockPath, "wx");
      try {
        await handle.writeFile(
          `${JSON.stringify({
            pid: process.pid,
            at: new Date().toISOString(),
          })}\n`,
          "utf8"
        );
      } finally {
        await handle.close();
      }

      try {
        return await fn();
      } finally {
        await fs.unlink(lockPath).catch(() => {
          /* ignore missing lock on cleanup */
        });
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") throw err;

      try {
        const st = await fs.stat(lockPath);
        if (Date.now() - st.mtimeMs > staleMs) {
          await fs.unlink(lockPath).catch(() => undefined);
          continue;
        }
      } catch {
        // Lock disappeared between EEXIST and stat — retry immediately.
        continue;
      }

      if (Date.now() - started > timeoutMs) {
        throw new Error(
          `Timed out waiting for event lock (${eventId}). Another fetch may still be running.`
        );
      }

      const jitter = Math.floor(Math.random() * pollMs);
      await new Promise((resolve) => setTimeout(resolve, pollMs + jitter));
    }
  }
}
