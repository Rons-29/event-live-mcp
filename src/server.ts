import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fetchNewPosts } from "./fetch.js";
import { groupFromState } from "./group.js";
import { withEventLock } from "./lock.js";
import { resolveDataDir, resolveOutputDir } from "./paths.js";
import { renderHtml, writeHtmlFile } from "./render.js";
import {
  loadEventState,
  loadGrouping,
  saveGrouping,
} from "./state.js";
import type { TalkSlot } from "./types.js";
import {
  createHttpXClient,
  getBearerTokenFromEnv,
  type XClient,
} from "./x-client.js";

const TalkSlotSchema = z.object({
  id: z.string().min(1).describe("Stable talk id used across group/render"),
  speaker: z.string().describe("Speaker name"),
  title: z.string().describe("Talk title"),
  startTime: z
    .string()
    .describe("Inclusive start time (ISO-8601, preferably with timezone)"),
  endTime: z
    .string()
    .describe("Exclusive end time (ISO-8601, preferably with timezone)"),
  materialsUrl: z
    .string()
    .url()
    .optional()
    .describe(
      "Optional official materials/slides URL from the caller (not scraped). Merged with URLs found in posts."
    ),
});

const TalkSummarySchema = z.object({
  talkId: z
    .string()
    .describe('Talk id from the timetable, or "unassigned"'),
  keyPoints: z
    .array(z.string())
    .describe("Summary bullets produced by the calling AI (not by this server)"),
});

export interface ServerDeps {
  /** Injected in tests; production creates an HTTP client from X_BEARER_TOKEN. */
  xClientFactory?: () => XClient;
}

function jsonResult(payload: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true as const,
    content: [{ type: "text" as const, text: message }],
  };
}

export function createServer(deps: ServerDeps = {}): McpServer {
  const server = new McpServer({
    name: "event-live-mcp",
    version: "0.1.0",
  });

  const getClient = (): XClient => {
    if (deps.xClientFactory) return deps.xClientFactory();
    return createHttpXClient({ bearerToken: getBearerTokenFromEnv() });
  };

  server.registerTool(
    "fetch_posts",
    {
      title: "Fetch new hashtag posts",
      description:
        "Fetch NEW X posts for a hashtag since the last fetch (X API v2 recent search). Uses since_id + post id + edit_history_tweet_ids so already-fetched / edited posts are never double-counted (latest edit kept). Retweets are excluded. Bearer token must be in X_BEARER_TOKEN env (never pass it here).",
      inputSchema: {
        event_id: z
          .string()
          .min(1)
          .describe(
            "Local event key for state files (e.g. demo-event-2026-11-20). Prefer [A-Za-z0-9._-]; other characters are base64url-encoded so distinct ids never collide."
          ),
        hashtag: z
          .string()
          .min(1)
          .describe("Hashtag with or without # (e.g. demo_event)"),
        start_time: z
          .string()
          .describe(
            "ISO-8601 lower bound for the FIRST fetch only; later fetches use since_id"
          ),
        data_dir: z
          .string()
          .optional()
          .describe("Override state directory (default: .data or EVENT_LIVE_DATA_DIR)"),
      },
    },
    async ({ event_id, hashtag, start_time, data_dir }) => {
      try {
        const result = await fetchNewPosts({
          eventId: event_id,
          hashtag,
          startTime: start_time,
          dataDir: resolveDataDir(data_dir),
          client: getClient(),
        });
        return jsonResult({
          event_id: result.eventId,
          hashtag: result.hashtag,
          new_post_count: result.newPostCount,
          updated_post_count: result.updatedPostCount,
          total_post_count: result.totalPostCount,
          since_id: result.sinceId,
          state_path: result.statePath,
          new_posts: result.newPosts,
          updated_posts: result.updatedPosts,
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "group_posts",
    {
      title: "Group posts by timetable",
      description:
        "Assign previously fetched posts to talks using a caller-supplied timetable. Posts outside every slot go to unassigned. Extracts URLs / slide links per talk.",
      inputSchema: {
        event_id: z.string().min(1).describe("Event id used in fetch_posts"),
        timetable: z
          .array(TalkSlotSchema)
          .min(1)
          .describe("Talk slots with speaker, title, start/end"),
        data_dir: z.string().optional().describe("Override state directory"),
      },
    },
    async ({ event_id, timetable, data_dir }) => {
      try {
        const dir = resolveDataDir(data_dir);
        return await withEventLock(dir, event_id, async () => {
          const state = await loadEventState(dir, event_id);
          if (!state) {
            throw new Error(
              `No state for event_id=${event_id}. Call fetch_posts first.`
            );
          }
          const slots = timetable as TalkSlot[];
          const grouping = groupFromState(state, slots);
          const groupingPath = await saveGrouping(dir, grouping);
          return jsonResult({
            event_id: grouping.eventId,
            grouping_path: groupingPath,
            talks: grouping.talks,
            unassigned: grouping.unassigned,
          });
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  server.registerTool(
    "render_html",
    {
      title: "Render HTML page",
      description:
        "Write a simple phone-friendly HTML file from the last grouping plus AI-provided key points. This server does NOT summarize — pass key_points from the calling model.",
      inputSchema: {
        event_id: z.string().min(1).describe("Event id used in fetch/group"),
        title: z.string().min(1).describe("Page <title> / H1"),
        intro: z.string().optional().describe("Optional intro paragraph"),
        summaries: z
          .array(TalkSummarySchema)
          .describe("Per-talk key points from the calling AI"),
        output_path: z
          .string()
          .optional()
          .describe(
            "HTML output path (default: output/<event_id>.html or EVENT_LIVE_OUTPUT_DIR)"
          ),
        data_dir: z.string().optional().describe("Override state directory"),
      },
    },
    async ({ event_id, title, intro, summaries, output_path, data_dir }) => {
      try {
        const dir = resolveDataDir(data_dir);
        const grouping = await loadGrouping(dir, event_id);
        if (!grouping) {
          throw new Error(
            `No grouping for event_id=${event_id}. Call group_posts first.`
          );
        }
        const html = renderHtml({
          title,
          intro,
          grouping,
          summaries: summaries.map((s) => ({
            talkId: s.talkId,
            keyPoints: s.keyPoints,
          })),
        });
        const out =
          output_path ??
          `${resolveOutputDir()}/${event_id.replace(/[^a-zA-Z0-9._-]+/g, "_")}.html`;
        const written = await writeHtmlFile(html, out);
        return jsonResult({
          event_id,
          output_path: written,
          bytes: Buffer.byteLength(html, "utf8"),
        });
      } catch (err) {
        return errorResult(err);
      }
    }
  );

  return server;
}
