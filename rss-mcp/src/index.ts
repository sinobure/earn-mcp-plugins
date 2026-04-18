#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedArticle {
  title: string;
  link: string;
  pubDate: string;
  summary: string;
}

interface ParsedFeed {
  feedTitle: string;
  feedType: "rss" | "atom" | "unknown";
  articles: FeedArticle[];
}

interface CacheEntry {
  feed: ParsedFeed;
  fetchedAt: number;
}

interface PopularFeed {
  name: string;
  url: string;
  description: string;
  language: string;
  last_verified_date: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ARTICLES = 50;

const POPULAR_FEEDS: PopularFeed[] = [
  {
    name: "Zenn",
    url: "https://zenn.dev/feed",
    description: "Zennの新着記事フィード（技術・プログラミング全般）",
    language: "ja",
    last_verified_date: "2025-01-01",
  },
  {
    name: "Qiita",
    url: "https://qiita.com/popular-items/feed",
    description: "Qiitaの人気記事フィード（技術・プログラミング全般）",
    language: "ja",
    last_verified_date: "2025-01-01",
  },
  {
    name: "はてなブックマーク IT",
    url: "https://b.hatena.ne.jp/hotentry/it.rss",
    description: "はてなブックマークのIT・テクノロジー人気エントリ",
    language: "ja",
    last_verified_date: "2025-01-01",
  },
  {
    name: "Publickey",
    url: "https://www.publickey1.jp/atom.xml",
    description: "ITエンタープライズ・クラウド・開発者向けニュース",
    language: "ja",
    last_verified_date: "2025-01-01",
  },
  {
    name: "gihyo.jp",
    url: "https://gihyo.jp/feed/rss2",
    description: "技術評論社の技術情報サイト。書籍・WEB特集・連載記事",
    language: "ja",
    last_verified_date: "2025-01-01",
  },
  {
    name: "ITPro（日経クロステック）",
    url: "https://xtech.nikkei.com/rss/index.rdf",
    description: "日経クロステックの最新IT・ビジネスニュース",
    language: "ja",
    last_verified_date: "2025-01-01",
  },
  {
    name: "AWS News Blog",
    url: "https://aws.amazon.com/blogs/aws/feed/",
    description: "AWSの公式ブログ。サービス発表・新機能情報（英語）",
    language: "en",
    last_verified_date: "2025-01-01",
  },
  {
    name: "Google Developers Blog",
    url: "https://developers.googleblog.com/feeds/posts/default",
    description: "Googleの開発者向け公式ブログ（英語）",
    language: "en",
    last_verified_date: "2025-01-01",
  },
  {
    name: "Hacker News",
    url: "https://hnrss.org/frontpage",
    description: "Hacker Newsのフロントページ記事フィード（英語）",
    language: "en",
    last_verified_date: "2025-01-01",
  },
  {
    name: "Dev.to",
    url: "https://dev.to/feed",
    description: "開発者コミュニティDev.toの新着記事（英語）",
    language: "en",
    last_verified_date: "2025-01-01",
  },
];

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const feedCache = new Map<string, CacheEntry>();

function getCached(url: string): ParsedFeed | null {
  const entry = feedCache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    feedCache.delete(url);
    return null;
  }
  return entry.feed;
}

function setCache(url: string, feed: ParsedFeed): void {
  feedCache.set(url, { feed, fetchedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// URL validation (SSRF mitigation)
// ---------------------------------------------------------------------------

function validateFeedUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `Unsupported protocol "${parsed.protocol}". Only http and https are allowed.`
    );
  }

  // Block private/loopback address ranges
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.16.") ||
    hostname.endsWith(".local") ||
    hostname === "0.0.0.0"
  ) {
    throw new Error(
      `Access to private/loopback addresses is not permitted: "${hostname}"`
    );
  }

  return parsed;
}

// ---------------------------------------------------------------------------
// XML parser (RSS 2.0 and Atom 1.0, regex-based, no dependencies)
// ---------------------------------------------------------------------------

function extractTagContent(xml: string, tag: string): string {
  // Match both <tag>content</tag> and <ns:tag>content</ns:tag>
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*?>([\\s\\S]*?)</(?:[^:>]+:)?${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return "";
  // Strip CDATA
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function extractAttribute(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<(?:[^:>]+:)?${tag}[^>]*?${attr}=["']([^"']+)["'][^>]*?>`, "i");
  const m = xml.match(re);
  return m ? m[1].trim() : "";
}

function detectFeedType(xml: string): "rss" | "atom" | "unknown" {
  if (/<rss[^>]*>/i.test(xml)) return "rss";
  if (/<feed[^>]*xmlns[^>]*>/i.test(xml) || /<feed[^>]*>/i.test(xml)) return "atom";
  return "unknown";
}

function splitItems(xml: string, feedType: "rss" | "atom" | "unknown"): string[] {
  if (feedType === "atom") {
    return xml.split(/<entry[^>]*>/i).slice(1);
  }
  // RSS 2.0 or fallback
  return xml.split(/<item[^>]*>/i).slice(1);
}

function parseFeedTitle(xml: string, feedType: "rss" | "atom" | "unknown"): string {
  if (feedType === "atom") {
    // Atom: <feed><title>...
    const feedBlock = xml.match(/<feed[^>]*>([\s\S]*)/i);
    if (feedBlock) {
      // Find first <title> before first <entry>
      const beforeEntry = feedBlock[1].split(/<entry[^>]*>/i)[0];
      return extractTagContent(beforeEntry, "title") || "Unknown Feed";
    }
  }
  // RSS: <channel><title>
  const channelBlock = xml.match(/<channel[^>]*>([\s\S]*)/i);
  if (channelBlock) {
    const beforeItem = channelBlock[1].split(/<item[^>]*>/i)[0];
    return extractTagContent(beforeItem, "title") || "Unknown Feed";
  }
  return "Unknown Feed";
}

function parseArticleFromRssItem(item: string): FeedArticle {
  const title = extractTagContent(item, "title") || "(no title)";
  const link =
    extractTagContent(item, "link") ||
    extractAttribute(item, "link", "href") ||
    "";
  const pubDate =
    extractTagContent(item, "pubDate") ||
    extractTagContent(item, "published") ||
    extractTagContent(item, "updated") ||
    extractTagContent(item, "date") ||
    "";
  const summary =
    extractTagContent(item, "description") ||
    extractTagContent(item, "summary") ||
    extractTagContent(item, "content") ||
    "";

  return {
    title: decodeHtmlEntities(title),
    link: link.trim(),
    pubDate: pubDate.trim(),
    summary: decodeHtmlEntities(summary).slice(0, 500),
  };
}

function parseArticleFromAtomEntry(entry: string): FeedArticle {
  const title = extractTagContent(entry, "title") || "(no title)";

  // Atom link: <link href="..." rel="alternate" /> or <link>url</link>
  let link = extractAttribute(entry, "link", "href");
  if (!link) link = extractTagContent(entry, "link");

  const pubDate =
    extractTagContent(entry, "published") ||
    extractTagContent(entry, "updated") ||
    "";
  const summary =
    extractTagContent(entry, "summary") ||
    extractTagContent(entry, "content") ||
    "";

  return {
    title: decodeHtmlEntities(title),
    link: link.trim(),
    pubDate: pubDate.trim(),
    summary: decodeHtmlEntities(summary).slice(0, 500),
  };
}

function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16))
    );
}

function parseXml(xml: string): ParsedFeed {
  const feedType = detectFeedType(xml);
  const feedTitle = parseFeedTitle(xml, feedType);
  const rawItems = splitItems(xml, feedType);

  const articles: FeedArticle[] = rawItems
    .slice(0, MAX_ARTICLES)
    .map((item) =>
      feedType === "atom"
        ? parseArticleFromAtomEntry(item)
        : parseArticleFromRssItem(item)
    )
    .filter((a) => a.title !== "(no title)" || a.link !== "");

  return { feedTitle, feedType, articles };
}

// ---------------------------------------------------------------------------
// Fetch feed
// ---------------------------------------------------------------------------

async function fetchFeed(url: string): Promise<ParsedFeed> {
  const cached = getCached(url);
  if (cached) return cached;

  validateFeedUrl(url);

  const response = await fetch(url, {
    headers: {
      "User-Agent": "kw-rss-mcp/1.0 (MCP RSS Reader)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} when fetching feed: ${url}`);
  }

  const text = await response.text();

  if (!text.trim()) {
    throw new Error(`Empty response from feed URL: ${url}`);
  }

  const feed = parseXml(text);
  setCache(url, feed);
  return feed;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleFetchFeed(url: string): Promise<string> {
  if (!url) throw new Error('"url" is required.');
  const feed = await fetchFeed(url);

  if (feed.articles.length === 0) {
    return `Feed: ${feed.feedTitle} (${feed.feedType})\nNo articles found.`;
  }

  const lines: string[] = [
    `Feed: ${feed.feedTitle} (type: ${feed.feedType}, ${feed.articles.length} articles)`,
    "",
  ];

  feed.articles.forEach((article, i) => {
    lines.push(`[${i}] ${article.title}`);
    lines.push(`    Link: ${article.link}`);
    if (article.pubDate) lines.push(`    Date: ${article.pubDate}`);
    if (article.summary) lines.push(`    Summary: ${article.summary.slice(0, 200)}`);
    lines.push("");
  });

  return lines.join("\n");
}

async function handleGetArticle(feedUrl: string, index: number): Promise<string> {
  if (!feedUrl) throw new Error('"feed_url" is required.');
  if (typeof index !== "number" || !isFinite(index) || index < 0) {
    throw new Error('"index" must be a non-negative integer.');
  }

  const feed = await fetchFeed(feedUrl);

  if (index >= feed.articles.length) {
    throw new Error(
      `Index ${index} out of range. Feed has ${feed.articles.length} articles (0 to ${feed.articles.length - 1}).`
    );
  }

  const article = feed.articles[index];
  const lines: string[] = [
    `Feed: ${feed.feedTitle}`,
    `Article [${index}]`,
    "---",
    `Title:   ${article.title}`,
    `Link:    ${article.link}`,
    `Date:    ${article.pubDate || "(not provided)"}`,
    "",
    `Summary:\n${article.summary || "(not provided)"}`,
  ];

  return lines.join("\n");
}

async function handleSearchFeed(url: string, keyword: string): Promise<string> {
  if (!url) throw new Error('"url" is required.');
  if (!keyword || keyword.trim() === "") throw new Error('"keyword" is required.');

  const feed = await fetchFeed(url);
  const kw = keyword.toLowerCase();

  const matches = feed.articles.filter(
    (a) =>
      a.title.toLowerCase().includes(kw) ||
      a.summary.toLowerCase().includes(kw)
  );

  if (matches.length === 0) {
    return `No articles found matching "${keyword}" in feed: ${feed.feedTitle}`;
  }

  const lines: string[] = [
    `Found ${matches.length} article(s) matching "${keyword}" in: ${feed.feedTitle}`,
    "",
  ];

  matches.forEach((article, i) => {
    const origIndex = feed.articles.indexOf(article);
    lines.push(`[${origIndex}] ${article.title}`);
    lines.push(`    Link: ${article.link}`);
    if (article.pubDate) lines.push(`    Date: ${article.pubDate}`);
    lines.push("");
  });

  return lines.join("\n");
}

function handleListPopularFeeds(): string {
  const lines: string[] = [
    `Popular RSS/Atom Feeds (${POPULAR_FEEDS.length} feeds)`,
    "",
  ];

  POPULAR_FEEDS.forEach((feed, i) => {
    lines.push(`[${i + 1}] ${feed.name}`);
    lines.push(`    URL: ${feed.url}`);
    lines.push(`    Description: ${feed.description}`);
    lines.push(`    Language: ${feed.language}`);
    lines.push(`    Last verified: ${feed.last_verified_date}`);
    lines.push("");
  });

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "kw-rss-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fetch_feed",
      description:
        "Fetch an RSS or Atom feed URL and return a list of recent articles (title, link, pubDate, summary). Up to 50 articles. Results are cached for 5 minutes.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The RSS or Atom feed URL (http/https only)",
          },
        },
        required: ["url"],
      },
    },
    {
      name: "get_article",
      description:
        "Return the full details of a specific article from a feed by its index. Use fetch_feed first to see the index numbers.",
      inputSchema: {
        type: "object",
        properties: {
          feed_url: {
            type: "string",
            description: "The RSS or Atom feed URL",
          },
          index: {
            type: "number",
            description: "Zero-based index of the article in the feed",
          },
        },
        required: ["feed_url", "index"],
      },
    },
    {
      name: "search_feed",
      description:
        "Search articles in an RSS/Atom feed by keyword. Matches against title and summary fields.",
      inputSchema: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description: "The RSS or Atom feed URL",
          },
          keyword: {
            type: "string",
            description: "Keyword to search for (case-insensitive)",
          },
        },
        required: ["url", "keyword"],
      },
    },
    {
      name: "list_popular_feeds",
      description:
        "Return a curated list of popular Japanese tech blog RSS/Atom feeds (Zenn, Qiita, Hatena IT, Publickey, etc.) plus major English feeds.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text: string;

    switch (name) {
      case "fetch_feed": {
        const { url } = args as { url: string };
        text = await handleFetchFeed(url);
        break;
      }
      case "get_article": {
        const { feed_url, index } = args as { feed_url: string; index: number };
        text = await handleGetArticle(feed_url, index);
        break;
      }
      case "search_feed": {
        const { url, keyword } = args as { url: string; keyword: string };
        text = await handleSearchFeed(url, keyword);
        break;
      }
      case "list_popular_feeds": {
        text = handleListPopularFeeds();
        break;
      }
      default:
        throw new Error(`Unknown tool: "${name}"`);
    }

    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
});

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Intentionally no console output — MCP uses stdio for protocol messages
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
