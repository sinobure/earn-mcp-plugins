#!/usr/bin/env node

import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  handleFetchFeed,
  handleGetArticle,
  handleSearchFeed,
  handleListPopularFeeds,
} from "./tools.js";

const { version } = createRequire(import.meta.url)("../package.json") as { version: string };

const server = new Server({ name: "kw-rss-mcp", version }, { capabilities: { tools: {} } });

const READ_ONLY_WEB = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "fetch_feed",
      description:
        "Fetch an RSS 2.0, Atom 1.0 or RSS 1.0 (RDF) feed and list its latest articles (index, title, link, date, short summary). Returns at most 50 articles; the output says when the feed has more. Results are cached for 5 minutes. Only public http/https URLs are allowed.",
      inputSchema: {
        type: "object",
        properties: { url: { type: "string", description: "Feed URL (public http/https only)", maxLength: 2048 } },
        required: ["url"],
      },
      annotations: { title: "Fetch feed", ...READ_ONLY_WEB },
    },
    {
      name: "get_article",
      description:
        "Return one article of a feed by its 0-based index (as shown by fetch_feed): title, link, date and the full text content provided by the feed (content:encoded / content / description converted to plain text, up to 20000 characters). It does not download the linked web page.",
      inputSchema: {
        type: "object",
        properties: {
          feed_url: { type: "string", description: "Feed URL (same URL passed to fetch_feed)", maxLength: 2048 },
          index: { type: "integer", minimum: 0, maximum: 49, description: "0-based article index from fetch_feed" },
        },
        required: ["feed_url", "index"],
      },
      annotations: { title: "Get article", ...READ_ONLY_WEB },
    },
    {
      name: "search_feed",
      description:
        "Search the (up to 50) latest articles of one feed for a keyword (case-insensitive substring match on title, summary and content). Returns matching articles with their fetch_feed indexes. It searches only that feed, not the web.",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string", description: "Feed URL (public http/https only)", maxLength: 2048 },
          keyword: { type: "string", minLength: 1, maxLength: 200, description: "Keyword to search for" },
        },
        required: ["url", "keyword"],
      },
      annotations: { title: "Search feed", ...READ_ONLY_WEB },
    },
    {
      name: "list_popular_feeds",
      description:
        "List 10 curated, working feed URLs (Japanese tech sites such as Zenn, Qiita, Hatena Bookmark IT, Publickey, plus major English ones) with the date each was last verified. Pass a URL to fetch_feed.",
      inputSchema: { type: "object", properties: {} },
      annotations: { title: "List popular feeds", readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    let text: string;
    switch (name) {
      case "fetch_feed":
        text = await handleFetchFeed(args);
        break;
      case "get_article":
        text = await handleGetArticle(args);
        break;
      case "search_feed":
        text = await handleSearchFeed(args);
        break;
      case "list_popular_feeds":
        text = handleListPopularFeeds();
        break;
      default:
        throw new Error(`Unknown tool: "${name}". Available: fetch_feed, get_article, search_feed, list_popular_feeds.`);
    }
    return { content: [{ type: "text", text }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${err instanceof Error ? err.message : String(err)}` }], isError: true };
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
