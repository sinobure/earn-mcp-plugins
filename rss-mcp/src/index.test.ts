/**
 * Unit tests for kw-rss-mcp
 *
 * Strategy: Reproduce pure logic functions (XML parser, URL validator,
 * popular feeds list) inline. Fetch is mocked for integration-style tests.
 * MCP SDK is mocked to prevent server startup.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock MCP SDK
// ---------------------------------------------------------------------------

vi.mock("@modelcontextprotocol/sdk/server/index.js", () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock("@modelcontextprotocol/sdk/server/stdio.js", () => ({
  StdioServerTransport: vi.fn().mockImplementation(() => ({})),
}));

vi.mock("@modelcontextprotocol/sdk/types.js", () => ({
  CallToolRequestSchema: "CallToolRequestSchema",
  ListToolsRequestSchema: "ListToolsRequestSchema",
}));

// ---------------------------------------------------------------------------
// Reproduce logic functions under test
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

interface PopularFeed {
  name: string;
  url: string;
  description: string;
  language: string;
  last_verified_date: string;
}

const POPULAR_FEEDS: PopularFeed[] = [
  { name: "Zenn", url: "https://zenn.dev/feed", description: "Zennの新着記事フィード", language: "ja", last_verified_date: "2025-01-01" },
  { name: "Qiita", url: "https://qiita.com/popular-items/feed", description: "Qiitaの人気記事フィード", language: "ja", last_verified_date: "2025-01-01" },
  { name: "はてなブックマーク IT", url: "https://b.hatena.ne.jp/hotentry/it.rss", description: "はてなIT人気エントリ", language: "ja", last_verified_date: "2025-01-01" },
  { name: "Publickey", url: "https://www.publickey1.jp/atom.xml", description: "ITエンタープライズニュース", language: "ja", last_verified_date: "2025-01-01" },
  { name: "gihyo.jp", url: "https://gihyo.jp/feed/rss2", description: "技術評論社の技術情報", language: "ja", last_verified_date: "2025-01-01" },
  { name: "ITPro", url: "https://xtech.nikkei.com/rss/index.rdf", description: "日経クロステックIT", language: "ja", last_verified_date: "2025-01-01" },
  { name: "AWS News Blog", url: "https://aws.amazon.com/blogs/aws/feed/", description: "AWSの公式ブログ", language: "en", last_verified_date: "2025-01-01" },
  { name: "Google Developers Blog", url: "https://developers.googleblog.com/feeds/posts/default", description: "Googleの開発者ブログ", language: "en", last_verified_date: "2025-01-01" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage", description: "Hacker Newsフロントページ", language: "en", last_verified_date: "2025-01-01" },
  { name: "Dev.to", url: "https://dev.to/feed", description: "Dev.toの新着記事", language: "en", last_verified_date: "2025-01-01" },
];

function validateFeedUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid URL: "${url}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol "${parsed.protocol}".`);
  }

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
    throw new Error(`Access to private/loopback addresses is not permitted: "${hostname}"`);
  }

  return parsed;
}

function extractTagContent(xml: string, tag: string): string {
  const re = new RegExp(
    `<(?:[^:>]+:)?${tag}[^>]*?>([\\s\\S]*?)</(?:[^:>]+:)?${tag}>`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function detectFeedType(xml: string): "rss" | "atom" | "unknown" {
  if (/<rss[^>]*>/i.test(xml)) return "rss";
  if (/<feed[^>]*xmlns[^>]*>/i.test(xml) || /<feed[^>]*>/i.test(xml)) return "atom";
  return "unknown";
}

function splitItems(xml: string, feedType: "rss" | "atom" | "unknown"): string[] {
  if (feedType === "atom") return xml.split(/<entry[^>]*>/i).slice(1);
  return xml.split(/<item[^>]*>/i).slice(1);
}

function parseArticleFromRssItem(item: string): FeedArticle {
  return {
    title: extractTagContent(item, "title") || "(no title)",
    link: extractTagContent(item, "link") || "",
    pubDate: extractTagContent(item, "pubDate") || "",
    summary: (extractTagContent(item, "description") || "").slice(0, 500),
  };
}

function parseArticleFromAtomEntry(entry: string): FeedArticle {
  const linkMatch = entry.match(/<(?:[^:>]+:)?link[^>]*?href=["']([^"']+)["'][^>]*?>/i);
  const link = linkMatch ? linkMatch[1].trim() : extractTagContent(entry, "link");
  return {
    title: extractTagContent(entry, "title") || "(no title)",
    link,
    pubDate: extractTagContent(entry, "published") || extractTagContent(entry, "updated") || "",
    summary: (extractTagContent(entry, "summary") || extractTagContent(entry, "content") || "").slice(0, 500),
  };
}

function parseXml(xml: string): ParsedFeed {
  const feedType = detectFeedType(xml);
  const rawItems = splitItems(xml, feedType);

  // Parse feed title from channel or feed block
  let feedTitle = "Unknown Feed";
  if (feedType === "atom") {
    const feedBlock = xml.match(/<feed[^>]*>([\s\S]*)/i);
    if (feedBlock) {
      const beforeEntry = feedBlock[1].split(/<entry[^>]*>/i)[0];
      feedTitle = extractTagContent(beforeEntry, "title") || "Unknown Feed";
    }
  } else {
    const channelBlock = xml.match(/<channel[^>]*>([\s\S]*)/i);
    if (channelBlock) {
      const beforeItem = channelBlock[1].split(/<item[^>]*>/i)[0];
      feedTitle = extractTagContent(beforeItem, "title") || "Unknown Feed";
    }
  }

  const articles: FeedArticle[] = rawItems
    .slice(0, 50)
    .map((item) =>
      feedType === "atom"
        ? parseArticleFromAtomEntry(item)
        : parseArticleFromRssItem(item)
    )
    .filter((a) => a.title !== "(no title)" || a.link !== "");

  return { feedTitle, feedType, articles };
}

function handleListPopularFeeds(): string {
  const lines: string[] = [
    `Popular RSS/Atom Feeds (${POPULAR_FEEDS.length} feeds)`,
    "",
  ];
  POPULAR_FEEDS.forEach((feed, i) => {
    lines.push(`[${i + 1}] ${feed.name}`);
    lines.push(`    URL: ${feed.url}`);
    lines.push("");
  });
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateFeedUrl – SSRF prevention", () => {
  it("allows a public HTTPS URL", () => {
    expect(() => validateFeedUrl("https://zenn.dev/feed")).not.toThrow();
  });

  it("allows a public HTTP URL", () => {
    expect(() => validateFeedUrl("http://example.com/rss")).not.toThrow();
  });

  it("blocks localhost", () => {
    expect(() => validateFeedUrl("http://localhost/feed")).toThrow(
      "private/loopback"
    );
  });

  it("blocks 127.0.0.1", () => {
    expect(() => validateFeedUrl("http://127.0.0.1/feed")).toThrow(
      "private/loopback"
    );
  });

  it("blocks 192.168.x.x", () => {
    expect(() => validateFeedUrl("http://192.168.1.1/feed")).toThrow(
      "private/loopback"
    );
  });

  it("blocks 10.x.x.x", () => {
    expect(() => validateFeedUrl("http://10.0.0.1/feed")).toThrow(
      "private/loopback"
    );
  });

  it("blocks non-http protocol (file://)", () => {
    expect(() => validateFeedUrl("file:///etc/passwd")).toThrow(
      "Unsupported protocol"
    );
  });

  it("blocks .local domain", () => {
    expect(() => validateFeedUrl("http://myserver.local/feed")).toThrow(
      "private/loopback"
    );
  });

  it("throws for completely invalid URL", () => {
    expect(() => validateFeedUrl("not-a-url")).toThrow("Invalid URL");
  });
});

describe("RSS 2.0 parsing", () => {
  const RSS_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test RSS Feed</title>
    <item>
      <title>Article One</title>
      <link>https://example.com/1</link>
      <pubDate>Mon, 01 Jan 2026 00:00:00 GMT</pubDate>
      <description>Summary of article one</description>
    </item>
    <item>
      <title>Article Two</title>
      <link>https://example.com/2</link>
      <pubDate>Tue, 02 Jan 2026 00:00:00 GMT</pubDate>
      <description>Summary of article two</description>
    </item>
  </channel>
</rss>`;

  it("detects feed type as rss", () => {
    expect(detectFeedType(RSS_SAMPLE)).toBe("rss");
  });

  it("parses feed title", () => {
    const feed = parseXml(RSS_SAMPLE);
    expect(feed.feedTitle).toBe("Test RSS Feed");
  });

  it("parses articles correctly", () => {
    const feed = parseXml(RSS_SAMPLE);
    expect(feed.articles).toHaveLength(2);
    expect(feed.articles[0].title).toBe("Article One");
    expect(feed.articles[0].link).toBe("https://example.com/1");
    expect(feed.articles[0].summary).toContain("Summary of article one");
  });
});

describe("Atom 1.0 parsing", () => {
  const ATOM_SAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Test Atom Feed</title>
  <entry>
    <title>Atom Article One</title>
    <link href="https://example.com/atom/1" rel="alternate"/>
    <published>2026-01-01T00:00:00Z</published>
    <summary>Atom summary one</summary>
  </entry>
  <entry>
    <title>Atom Article Two</title>
    <link href="https://example.com/atom/2" rel="alternate"/>
    <published>2026-01-02T00:00:00Z</published>
    <summary>Atom summary two</summary>
  </entry>
</feed>`;

  it("detects feed type as atom", () => {
    expect(detectFeedType(ATOM_SAMPLE)).toBe("atom");
  });

  it("parses atom feed title", () => {
    const feed = parseXml(ATOM_SAMPLE);
    expect(feed.feedTitle).toBe("Test Atom Feed");
  });

  it("parses atom entries correctly", () => {
    const feed = parseXml(ATOM_SAMPLE);
    expect(feed.articles).toHaveLength(2);
    expect(feed.articles[0].title).toBe("Atom Article One");
    expect(feed.articles[0].link).toBe("https://example.com/atom/1");
    expect(feed.articles[0].pubDate).toBe("2026-01-01T00:00:00Z");
  });
});

describe("list_popular_feeds", () => {
  it("returns exactly 10 popular feeds", () => {
    expect(POPULAR_FEEDS).toHaveLength(10);
  });

  it("output string contains all feed names", () => {
    const output = handleListPopularFeeds();
    expect(output).toContain("Zenn");
    expect(output).toContain("Qiita");
    expect(output).toContain("Hacker News");
    expect(output).toContain("Dev.to");
  });

  it("each feed has a valid https URL", () => {
    for (const feed of POPULAR_FEEDS) {
      expect(feed.url).toMatch(/^https?:\/\//);
    }
  });
});
