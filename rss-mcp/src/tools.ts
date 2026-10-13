import { fetchText, type FetchOptions } from "./fetcher.js";
import { parseFeed, MAX_ARTICLES, type ParsedFeed } from "./parser.js";

export const CACHE_TTL_MS = 5 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 50;

export class InputError extends Error {}

export interface PopularFeed {
  name: string;
  url: string;
  description: string;
  language: string;
  last_verified_date: string;
}

// Each URL returned HTTP 200 with a parseable RSS/Atom/RDF body on last_verified_date.
export const POPULAR_FEEDS: PopularFeed[] = [
  { name: "Zenn", url: "https://zenn.dev/feed", description: "Zennの新着記事フィード（技術・プログラミング全般）", language: "ja", last_verified_date: "2026-10-13" },
  { name: "Qiita", url: "https://qiita.com/popular-items/feed", description: "Qiitaの人気記事フィード（技術・プログラミング全般）", language: "ja", last_verified_date: "2026-10-13" },
  { name: "はてなブックマーク IT", url: "https://b.hatena.ne.jp/hotentry/it.rss", description: "はてなブックマークのIT・テクノロジー人気エントリ", language: "ja", last_verified_date: "2026-10-13" },
  { name: "Publickey", url: "https://www.publickey1.jp/atom.xml", description: "ITエンタープライズ・クラウド・開発者向けニュース", language: "ja", last_verified_date: "2026-10-13" },
  { name: "gihyo.jp", url: "https://gihyo.jp/feed/rss2", description: "技術評論社の技術情報サイト。書籍・WEB特集・連載記事", language: "ja", last_verified_date: "2026-10-13" },
  { name: "ITPro（日経クロステック）", url: "https://xtech.nikkei.com/rss/index.rdf", description: "日経クロステックの最新IT・ビジネスニュース", language: "ja", last_verified_date: "2026-10-13" },
  { name: "AWS News Blog", url: "https://aws.amazon.com/blogs/aws/feed/", description: "AWSの公式ブログ。サービス発表・新機能情報（英語）", language: "en", last_verified_date: "2026-10-13" },
  { name: "Google Developers Blog", url: "https://developers.googleblog.com/feeds/posts/default", description: "Googleの開発者向け公式ブログ（英語）", language: "en", last_verified_date: "2026-10-13" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage", description: "Hacker Newsのフロントページ記事フィード（英語）", language: "en", last_verified_date: "2026-10-13" },
  { name: "Dev.to", url: "https://dev.to/feed", description: "開発者コミュニティDev.toの新着記事（英語）", language: "en", last_verified_date: "2026-10-13" },
];

// ---------------------------------------------------------------------------
// Cache (TTL + size cap, oldest entry evicted first)
// ---------------------------------------------------------------------------

interface CacheEntry {
  feed: ParsedFeed;
  fetchedAt: number;
}
const cache = new Map<string, CacheEntry>();

export function clearCache(): void {
  cache.clear();
}
export function cacheSize(): number {
  return cache.size;
}

function getCached(url: string, now = Date.now()): ParsedFeed | null {
  const e = cache.get(url);
  if (!e) return null;
  if (now - e.fetchedAt > CACHE_TTL_MS) {
    cache.delete(url);
    return null;
  }
  return e.feed;
}

function setCache(url: string, feed: ParsedFeed): void {
  cache.delete(url);
  cache.set(url, { feed, fetchedAt: Date.now() });
  while (cache.size > CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value as string;
    cache.delete(oldest);
  }
}

export interface Deps {
  fetchOptions?: FetchOptions;
}

async function loadFeed(url: string, deps: Deps): Promise<ParsedFeed> {
  const cached = getCached(url);
  if (cached) return cached;
  const { text } = await fetchText(url, deps.fetchOptions);
  if (!text.trim()) throw new Error(`Empty response from feed URL: ${url}`);
  const feed = parseFeed(text);
  setCache(url, feed);
  return feed;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function str(args: Record<string, unknown> | undefined, key: string, max: number): string {
  const v = args?.[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new InputError(`"${key}" is required and must be a non-empty string.`);
  }
  if (v.length > max) throw new InputError(`"${key}" is too long (max ${max} characters).`);
  return v.trim();
}

function truncationNote(feed: ParsedFeed): string[] {
  return feed.totalItems > feed.articles.length
    ? [`Note: the feed has ${feed.totalItems} items; only the first ${MAX_ARTICLES} are available (indexes 0-${feed.articles.length - 1}).`]
    : [];
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

export async function handleFetchFeed(args: Record<string, unknown> | undefined, deps: Deps = {}): Promise<string> {
  const url = str(args, "url", 2048);
  const feed = await loadFeed(url, deps);
  if (feed.articles.length === 0) {
    return `Feed: ${feed.feedTitle} (type: ${feed.feedType})\nNo articles found.`;
  }
  const lines = [`Feed: ${feed.feedTitle} (type: ${feed.feedType}, ${feed.articles.length} articles)`, ...truncationNote(feed), ""];
  feed.articles.forEach((a, i) => {
    lines.push(`[${i}] ${a.title}`, `    Link: ${a.link}`);
    if (a.pubDate) lines.push(`    Date: ${a.pubDate}`);
    if (a.summary) lines.push(`    Summary: ${a.summary.slice(0, 200)}`);
    lines.push("");
  });
  return lines.join("\n");
}

export async function handleGetArticle(args: Record<string, unknown> | undefined, deps: Deps = {}): Promise<string> {
  const feedUrl = str(args, "feed_url", 2048);
  const index = args?.["index"];
  if (typeof index !== "number" || !Number.isInteger(index) || index < 0) {
    throw new InputError('"index" must be a non-negative integer (0-based). Use fetch_feed to see the index numbers.');
  }
  const feed = await loadFeed(feedUrl, deps);
  if (index >= feed.articles.length) {
    throw new InputError(
      `Index ${index} is out of range. The feed has ${feed.articles.length} accessible articles (0 to ${Math.max(0, feed.articles.length - 1)}).`
    );
  }
  const a = feed.articles[index];
  return [
    `Feed: ${feed.feedTitle}`,
    `Article [${index}]`,
    "---",
    `Title:   ${a.title}`,
    `Link:    ${a.link || "(not provided)"}`,
    `Date:    ${a.pubDate || "(not provided)"}`,
    "",
    `Content:\n${a.content || "(not provided)"}`,
    ...(a.contentTruncated ? ["", "[content truncated at 20000 characters]"] : []),
  ].join("\n");
}

export async function handleSearchFeed(args: Record<string, unknown> | undefined, deps: Deps = {}): Promise<string> {
  const url = str(args, "url", 2048);
  const keyword = str(args, "keyword", 200);
  const feed = await loadFeed(url, deps);
  const kw = keyword.toLowerCase();
  const hits = feed.articles
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.title.toLowerCase().includes(kw) || a.summary.toLowerCase().includes(kw) || a.content.toLowerCase().includes(kw));
  if (hits.length === 0) {
    return [`No articles found matching "${keyword}" in feed: ${feed.feedTitle}`, ...truncationNote(feed)].join("\n");
  }
  const lines = [`Found ${hits.length} article(s) matching "${keyword}" in: ${feed.feedTitle}`, ...truncationNote(feed), ""];
  for (const { a, i } of hits) {
    lines.push(`[${i}] ${a.title}`, `    Link: ${a.link}`);
    if (a.pubDate) lines.push(`    Date: ${a.pubDate}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function handleListPopularFeeds(): string {
  const lines = [`Popular RSS/Atom Feeds (${POPULAR_FEEDS.length} feeds)`, ""];
  POPULAR_FEEDS.forEach((f, i) => {
    lines.push(`[${i + 1}] ${f.name}`, `    URL: ${f.url}`, `    Description: ${f.description}`, `    Language: ${f.language}`, `    Last verified: ${f.last_verified_date}`, "");
  });
  return lines.join("\n");
}
