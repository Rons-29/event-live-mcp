import type { Post, SlideLink } from "./types.js";

const SLIDE_HOST_PATTERNS = [
  /(^|\.)speakerdeck\.com$/i,
  /(^|\.)slideshare\.net$/i,
  /(^|\.)docs\.google\.com$/i,
  /(^|\.)slide\.google\.com$/i,
  /(^|\.)canva\.com$/i,
  /(^|\.)figma\.com$/i,
];

const URL_IN_TEXT = /https?:\/\/[^\s<>"')\]]+/gi;

export function isSlideHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    if (SLIDE_HOST_PATTERNS.some((re) => re.test(host))) {
      if (/docs\.google\.com$/i.test(host)) {
        return /\/presentation\//i.test(url);
      }
      if (/figma\.com$/i.test(host)) {
        return /\/(proto|slides|deck|file)\//i.test(url) || /figjam/i.test(url);
      }
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** Normalize trailing punctuation often left on pasted URLs. */
export function cleanUrl(raw: string): string {
  return raw.replace(/[.,;:!?)]+$/g, "");
}

export function extractUrlsFromText(text: string): string[] {
  const matches = text.match(URL_IN_TEXT) ?? [];
  return [...new Set(matches.map(cleanUrl))];
}

export function collectPostUrls(post: Post): string[] {
  const fromEntities = post.urls.map(cleanUrl);
  const fromText = extractUrlsFromText(post.text);
  return [...new Set([...fromEntities, ...fromText])];
}

function sortLinks(links: SlideLink[]): SlideLink[] {
  return [...links].sort((a, b) => {
    // Materials first, then known slide hosts, then URL.
    if (a.fromMaterials !== b.fromMaterials) {
      return a.fromMaterials ? -1 : 1;
    }
    if (a.isSlideHost !== b.isSlideHost) {
      return a.isSlideHost ? -1 : 1;
    }
    return a.url.localeCompare(b.url);
  });
}

/**
 * Collect unique URLs from posts. Known slide hosts are flagged;
 * other URLs are still included (per product requirement).
 */
export function extractSlideLinks(posts: Post[]): SlideLink[] {
  const seen = new Set<string>();
  const links: SlideLink[] = [];

  for (const post of posts) {
    for (const url of collectPostUrls(post)) {
      if (seen.has(url)) continue;
      seen.add(url);
      links.push({
        url,
        isSlideHost: isSlideHost(url),
        sourcePostId: post.id,
        fromMaterials: false,
      });
    }
  }

  return sortLinks(links);
}

/**
 * Merge optional timetable materials URL with URLs extracted from posts.
 * Identical URLs are stored once; materials origin wins the label.
 */
export function mergeMaterialsAndPostLinks(
  materialsUrl: string | undefined | null,
  posts: Post[]
): SlideLink[] {
  const fromPosts = extractSlideLinks(posts);
  const cleaned = materialsUrl?.trim() ? cleanUrl(materialsUrl.trim()) : "";
  if (!cleaned) return fromPosts;

  const materialsLink: SlideLink = {
    url: cleaned,
    isSlideHost: isSlideHost(cleaned),
    sourcePostId: null,
    fromMaterials: true,
  };

  const rest = fromPosts.filter((l) => l.url !== cleaned);
  return sortLinks([materialsLink, ...rest]);
}

export function postUrl(post: Post): string {
  const user = post.authorUsername || "i";
  return `https://x.com/${user}/status/${post.id}`;
}
