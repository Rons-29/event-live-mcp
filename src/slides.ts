import type { Post, SlideLink } from "./types.js";

const SLIDE_HOST_PATTERNS = [
  /(^|\.)speakerdeck\.com$/i,
  /(^|\.)slideshare\.net$/i,
  /(^|\.)docs\.google\.com$/i,
  /(^|\.)slide\.google\.com$/i,
  /(^|\.)canva\.com$/i,
  /(^|\.)figma\.com$/i,
];

const URL_IN_TEXT =
  /https?:\/\/[^\s<>"')\]]+/gi;

export function isSlideHost(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    if (SLIDE_HOST_PATTERNS.some((re) => re.test(host))) {
      // Google Docs: only presentations count as slides
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
      });
    }
  }

  // Prefer known slide hosts first for stable ordering
  links.sort((a, b) => {
    if (a.isSlideHost !== b.isSlideHost) {
      return a.isSlideHost ? -1 : 1;
    }
    return a.url.localeCompare(b.url);
  });

  return links;
}

export function postUrl(post: Post): string {
  const user = post.authorUsername || "i";
  return `https://x.com/${user}/status/${post.id}`;
}
