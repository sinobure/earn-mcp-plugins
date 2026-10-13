import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { handleFetchFeed, handleGetArticle, handleSearchFeed, handleListPopularFeeds, clearCache, cacheSize, CACHE_MAX_ENTRIES, POPULAR_FEEDS } from "./tools.js";

const deps = { fetchOptions: { ipBlocked: () => false } };
let srv: http.Server;
let base: string;
let hits = 0;

beforeAll(async () => {
  srv = http.createServer((q, s) => {
    hits++;
    const p = q.url ?? "";
    if (p.startsWith("/rss")) {
      return void s.end(`<rss><channel><title>T ${p}</title><item><title>Hello TypeScript</title><link>http://x/1</link><description>d</description><content:encoded><![CDATA[<p>Full text here</p>]]></content:encoded></item><item><title>Two</title><link>http://x/2</link></item></channel></rss>`);
    }
    if (p === "/many") {
      return void s.end(`<rss><channel><title>M</title>${Array.from({ length: 80 }, (_, i) => `<item><title>I${i}</title></item>`).join("")}</channel></rss>`);
    }
    if (p === "/html") return void s.end("<html><body>no</body></html>");
    s.end("");
  });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
});
afterAll(() => {
  srv.closeAllConnections();
  srv.close();
});
beforeEach(() => clearCache());

describe("tools", () => {
  it("fetch_feed lists articles and caches", async () => {
    const out = await handleFetchFeed({ url: `${base}/rss` }, deps);
    expect(out).toContain("[0] Hello TypeScript");
    const before = hits;
    await handleFetchFeed({ url: `${base}/rss` }, deps);
    expect(hits).toBe(before);
  });
  it("fetch_feed announces truncation to 50", async () => {
    const out = await handleFetchFeed({ url: `${base}/many` }, deps);
    expect(out).toContain("80 items");
    expect(out).toContain("first 50");
  });
  it("get_article returns full content and validates index", async () => {
    expect(await handleGetArticle({ feed_url: `${base}/rss`, index: 0 }, deps)).toContain("Full text here");
    await expect(handleGetArticle({ feed_url: `${base}/rss`, index: 1.5 }, deps)).rejects.toThrow(/non-negative integer/);
    await expect(handleGetArticle({ feed_url: `${base}/rss`, index: "1" }, deps)).rejects.toThrow(/non-negative integer/);
    await expect(handleGetArticle({ feed_url: `${base}/rss`, index: -1 }, deps)).rejects.toThrow(/non-negative integer/);
    await expect(handleGetArticle({ feed_url: `${base}/rss`, index: 99 }, deps)).rejects.toThrow(/out of range/);
  });
  it("search_feed is case-insensitive and rejects empty keyword", async () => {
    expect(await handleSearchFeed({ url: `${base}/rss`, keyword: "TYPESCRIPT" }, deps)).toContain("[0]");
    expect(await handleSearchFeed({ url: `${base}/rss`, keyword: "zzz" }, deps)).toContain("No articles found");
    await expect(handleSearchFeed({ url: `${base}/rss`, keyword: "  " }, deps)).rejects.toThrow(/keyword/);
  });
  it("rejects missing/invalid args without leaking internals", async () => {
    await expect(handleFetchFeed(undefined, deps)).rejects.toThrow(/"url" is required/);
    await expect(handleFetchFeed({ url: 5 }, deps)).rejects.toThrow(/"url" is required/);
  });
  it("non-feed responses are errors", async () => {
    await expect(handleFetchFeed({ url: `${base}/html` }, deps)).rejects.toThrow();
    await expect(handleFetchFeed({ url: `${base}/empty` }, deps)).rejects.toThrow(/Empty response/);
  });
  it("blocks private targets with default policy", async () => {
    await expect(handleFetchFeed({ url: `${base}/rss` })).rejects.toThrow(/not permitted/);
  });
  it("cache is size-limited", async () => {
    for (let i = 0; i < CACHE_MAX_ENTRIES + 10; i++) await handleFetchFeed({ url: `${base}/rss?${i}` }, deps);
    expect(cacheSize()).toBe(CACHE_MAX_ENTRIES);
  });
  it("list_popular_feeds has verified dates", () => {
    expect(POPULAR_FEEDS).toHaveLength(10);
    expect(handleListPopularFeeds()).toContain("Last verified: 2026-10-13");
  });
});
