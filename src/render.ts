import fs from "node:fs/promises";
import path from "node:path";
import type {
  GroupResult,
  Post,
  RenderInput,
  SlideLink,
  TalkGroup,
  TalkSummaryInput,
} from "./types.js";
import { postUrl } from "./slides.js";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLocalTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // Deterministic UTC formatting (byte-identical across TZ/locales).
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  return `${mm}/${dd} ${hh}:${mi} UTC`;
}

function summaryMap(
  summaries: TalkSummaryInput[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const s of summaries) {
    map.set(s.talkId, s.keyPoints);
  }
  return map;
}

function renderKeyPoints(points: string[]): string {
  if (points.length === 0) {
    return `<p class="muted">（要点はまだありません）</p>`;
  }
  const items = points
    .map((p) => `<li>${escapeHtml(p)}</li>`)
    .join("\n");
  return `<ul class="keypoints">\n${items}\n</ul>`;
}

function renderSlideLinks(links: SlideLink[]): string {
  if (links.length === 0) {
    return `<p class="muted">スライドリンクなし</p>`;
  }
  const items = links
    .map((l) => {
      const label = l.isSlideHost ? "スライド" : "リンク";
      return `<li><a href="${escapeHtml(l.url)}">${label}: ${escapeHtml(l.url)}</a></li>`;
    })
    .join("\n");
  return `<ul class="slides">\n${items}\n</ul>`;
}

function renderPosts(posts: Post[]): string {
  if (posts.length === 0) {
    return `<p class="muted">投稿なし</p>`;
  }
  const items = posts
    .map((p) => {
      const href = postUrl(p);
      const who = escapeHtml(p.authorUsername || "unknown");
      const when = escapeHtml(formatLocalTime(p.createdAt));
      return `<li><span class="t">${when}</span> <a href="${escapeHtml(href)}">@${who}</a></li>`;
    })
    .join("\n");
  return `<ul class="posts">\n${items}\n</ul>`;
}

function sectionHeading(group: TalkGroup): string {
  if (group.talkId === "unassigned") {
    return "未割当";
  }
  const speaker = group.speaker ? `（${group.speaker}）` : "";
  return `${group.title}${speaker}`;
}

function renderSection(
  group: TalkGroup,
  keyPoints: string[]
): string {
  return [
    `<section id="${escapeHtml(group.talkId)}">`,
    `<h2>${escapeHtml(sectionHeading(group))}</h2>`,
    `<h3>要点</h3>`,
    renderKeyPoints(keyPoints),
    `<h3>スライド・リンク</h3>`,
    renderSlideLinks(group.slideLinks),
    `<h3>元投稿</h3>`,
    renderPosts(group.posts),
    `</section>`,
  ].join("\n");
}

const DEFAULT_CSS = `body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:16px;line-height:1.6;color:#222}
h1{font-size:1.4rem}h2{font-size:1.15rem;margin-top:1.6em;border-bottom:1px solid #ddd;padding-bottom:4px}
h3{font-size:1rem;margin-top:1em}.t{color:#888;font-size:.85em}.muted{color:#888}
ul{padding-left:1.2em}li{margin:8px 0}a{color:#0b57d0;word-break:break-all}`;

/**
 * Build phone-friendly HTML. Template is intentionally minimal and easy to swap.
 * Same input always yields byte-identical output.
 */
export function renderHtml(input: RenderInput): string {
  const summaries = summaryMap(input.summaries);
  const sections: TalkGroup[] = [
    ...input.grouping.talks,
    input.grouping.unassigned,
  ];

  const bodySections = sections
    .map((g) => renderSection(g, summaries.get(g.talkId) ?? []))
    .join("\n");

  const intro = input.intro
    ? `<p>${escapeHtml(input.intro)}</p>`
    : "";

  // Fixed newline style + no trailing variance for deterministic bytes.
  return [
    `<!doctype html>`,
    `<html lang="ja">`,
    `<head>`,
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1">`,
    `<title>${escapeHtml(input.title)}</title>`,
    `<style>${DEFAULT_CSS}</style>`,
    `</head>`,
    `<body>`,
    `<h1>${escapeHtml(input.title)}</h1>`,
    intro,
    bodySections,
    `</body>`,
    `</html>`,
    ``,
  ].join("\n");
}

export async function writeHtmlFile(
  html: string,
  outputPath: string
): Promise<string> {
  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, html, "utf8");
  return resolved;
}

export function assertGrouping(grouping: GroupResult): void {
  if (!grouping?.eventId) {
    throw new Error("grouping.eventId is required");
  }
}
