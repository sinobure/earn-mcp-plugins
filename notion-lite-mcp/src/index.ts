#!/usr/bin/env node

import { Client, APIResponseError } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  SearchResponse,
  PageObjectResponse,
  DatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Environment validation — fail fast before server starts
// ---------------------------------------------------------------------------

const NOTION_API_KEY = process.env["NOTION_API_KEY"];
if (!NOTION_API_KEY) {
  process.stderr.write(
    "Fatal: NOTION_API_KEY environment variable is not set.\n" +
      "Create a Notion integration at https://www.notion.so/my-integrations and set the secret.\n"
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Notion client
// ---------------------------------------------------------------------------

const notion = new Client({ auth: NOTION_API_KEY });

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnyBlock = BlockObjectResponse | PartialBlockObjectResponse;

// ---------------------------------------------------------------------------
// UUID validation
// UUID v4 canonical: 8-4-4-4-12 hex, hyphens required
// Also accept 32-char hex string without hyphens
// ---------------------------------------------------------------------------

const UUID_WITH_HYPHENS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_WITHOUT_HYPHENS = /^[0-9a-f]{32}$/i;

/**
 * Validates a Notion page/block ID.
 * Returns the ID normalised to hyphenated format.
 * Throws an Error with a human-readable message if invalid.
 */
function validateAndNormalizeId(raw: string, label: string): string {
  const trimmed = raw.trim();

  if (UUID_WITH_HYPHENS.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (UUID_WITHOUT_HYPHENS.test(trimmed)) {
    // Insert hyphens: 8-4-4-4-12
    const h = trimmed.toLowerCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  throw new Error(
    `Invalid ${label}: "${raw}". ` +
      `Expected a UUID in hyphenated (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx) ` +
      `or plain 32-character hex format.`
  );
}

// ---------------------------------------------------------------------------
// Block → plain text conversion
// ---------------------------------------------------------------------------

/** Extract plain text from a RichText array. */
function richTextToPlain(
  richText: Array<{ plain_text: string }> | undefined
): string {
  if (!richText || richText.length === 0) return "";
  return richText.map((t) => t.plain_text).join("");
}

/** Convert a single block to a human-readable line. */
function blockToText(block: AnyBlock): string {
  if (!("type" in block)) {
    // PartialBlockObjectResponse has no type details
    return `[block: ${block.id}]`;
  }

  const b = block as BlockObjectResponse;

  switch (b.type) {
    case "heading_1": {
      const text = richTextToPlain(b.heading_1.rich_text);
      return `# ${text}`;
    }
    case "heading_2": {
      const text = richTextToPlain(b.heading_2.rich_text);
      return `## ${text}`;
    }
    case "heading_3": {
      const text = richTextToPlain(b.heading_3.rich_text);
      return `### ${text}`;
    }
    case "paragraph": {
      const text = richTextToPlain(b.paragraph.rich_text);
      return text || "";
    }
    case "bulleted_list_item": {
      const text = richTextToPlain(b.bulleted_list_item.rich_text);
      return `- ${text}`;
    }
    case "numbered_list_item": {
      const text = richTextToPlain(b.numbered_list_item.rich_text);
      return `1. ${text}`;
    }
    case "to_do": {
      const text = richTextToPlain(b.to_do.rich_text);
      const checked = b.to_do.checked ? "[x]" : "[ ]";
      return `${checked} ${text}`;
    }
    case "toggle": {
      const text = richTextToPlain(b.toggle.rich_text);
      return `> ${text}`;
    }
    case "code": {
      const text = richTextToPlain(b.code.rich_text);
      const lang = b.code.language || "";
      return `\`\`\`${lang}\n${text}\n\`\`\``;
    }
    case "quote": {
      const text = richTextToPlain(b.quote.rich_text);
      return `> ${text}`;
    }
    case "callout": {
      const text = richTextToPlain(b.callout.rich_text);
      return `[!] ${text}`;
    }
    case "divider":
      return "---";
    case "table_of_contents":
      return "[Table of Contents]";
    case "image":
      return "[image]";
    case "video":
      return "[video]";
    case "file":
      return "[file]";
    case "pdf":
      return "[pdf]";
    case "bookmark": {
      const url = b.bookmark.url;
      return `[bookmark: ${url}]`;
    }
    case "child_page": {
      return `[child page: ${b.child_page.title}]`;
    }
    case "child_database": {
      return `[child database: ${b.child_database.title}]`;
    }
    default:
      return `[${b.type}]`;
  }
}

// ---------------------------------------------------------------------------
// Pagination helper
// ---------------------------------------------------------------------------

/** Fetch all children of a block/page with automatic cursor pagination. */
async function fetchAllChildren(blockId: string): Promise<AnyBlock[]> {
  const results: AnyBlock[] = [];
  let cursor: string | undefined;

  do {
    const response = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...response.results);
    cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
  } while (cursor);

  return results;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

async function handleSearchNotion(
  query: string,
  limit: number
): Promise<string> {
  if (!query || query.trim() === "") {
    throw new Error('The "query" parameter must be a non-empty string.');
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    throw new Error('"limit" must be an integer between 1 and 100.');
  }

  const response: SearchResponse = await notion.search({
    query: query.trim(),
    page_size: limit,
  });

  if (response.results.length === 0) {
    return `No results found for query: "${query}"`;
  }

  const lines: string[] = [`Search results for "${query}" (${response.results.length} found):\n`];

  for (const item of response.results) {
    if (item.object === "page") {
      const page = item as PageObjectResponse;
      const titleProp = Object.values(page.properties).find(
        (p) => p.type === "title"
      );
      const title =
        titleProp?.type === "title"
          ? richTextToPlain(titleProp.title)
          : "(untitled)";
      const url = page.url;
      const id = page.id;
      const edited = page.last_edited_time.slice(0, 10);
      lines.push(`[page] ${title}\n  id: ${id}\n  url: ${url}\n  last edited: ${edited}`);
    } else if (item.object === "database") {
      const db = item as DatabaseObjectResponse;
      const title = richTextToPlain(db.title) || "(untitled)";
      const url = db.url;
      const id = db.id;
      const edited = db.last_edited_time.slice(0, 10);
      lines.push(`[database] ${title}\n  id: ${id}\n  url: ${url}\n  last edited: ${edited}`);
    }
  }

  if (response.has_more) {
    lines.push(`\n(More results exist. Increase limit or refine query.)`);
  }

  return lines.join("\n");
}

async function handleGetPage(pageId: string): Promise<string> {
  const normalizedId = validateAndNormalizeId(pageId, "page_id");

  // Retrieve page metadata to get the title
  const page = (await notion.pages.retrieve({
    page_id: normalizedId,
  })) as PageObjectResponse;

  const titleProp = Object.values(page.properties).find(
    (p) => p.type === "title"
  );
  const title =
    titleProp?.type === "title"
      ? richTextToPlain(titleProp.title)
      : "(untitled)";

  // Retrieve all blocks
  const blocks = await fetchAllChildren(normalizedId);
  const lines: string[] = [`# ${title}`, `(id: ${normalizedId})`, ""];

  for (const block of blocks) {
    const line = blockToText(block);
    if (line !== "") lines.push(line);
  }

  if (lines.length === 3) {
    lines.push("(empty page)");
  }

  return lines.join("\n");
}

async function handleAppendToPage(
  pageId: string,
  content: string
): Promise<string> {
  const normalizedId = validateAndNormalizeId(pageId, "page_id");

  if (!content || content.trim() === "") {
    throw new Error('"content" must be a non-empty string.');
  }

  // Split content by newlines and create paragraph blocks
  const paragraphs = content
    .split("\n")
    .map((line) => line.trimEnd())
    .filter((line) => line.length > 0);

  if (paragraphs.length === 0) {
    throw new Error('"content" contains no non-empty lines.');
  }

  const children = paragraphs.map((text) => ({
    object: "block" as const,
    type: "paragraph" as const,
    paragraph: {
      rich_text: [
        {
          type: "text" as const,
          text: { content: text },
        },
      ],
    },
  }));

  await notion.blocks.children.append({
    block_id: normalizedId,
    children,
  });

  return (
    `Successfully appended ${paragraphs.length} paragraph(s) to page ${normalizedId}.\n` +
    `Preview:\n${paragraphs.slice(0, 3).map((l) => `  ${l}`).join("\n")}` +
    (paragraphs.length > 3 ? `\n  ... (${paragraphs.length - 3} more)` : "")
  );
}

async function handleListChildren(blockId: string): Promise<string> {
  const normalizedId = validateAndNormalizeId(blockId, "block_id");

  const blocks = await fetchAllChildren(normalizedId);

  if (blocks.length === 0) {
    return `No child blocks found for block ${normalizedId}.`;
  }

  const lines: string[] = [
    `Child blocks of ${normalizedId} (${blocks.length} total):\n`,
  ];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i]!;
    const typeInfo = "type" in block ? (block as BlockObjectResponse).type : "unknown";
    const preview = blockToText(block);
    const truncated =
      preview.length > 80 ? preview.slice(0, 77) + "..." : preview;
    lines.push(`${i + 1}. [${typeInfo}] ${truncated}\n   id: ${block.id}`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Error message extraction
// ---------------------------------------------------------------------------

function extractErrorMessage(err: unknown): string {
  if (err instanceof APIResponseError) {
    return `Notion API error (${err.status}): ${err.message}`;
  }
  if (err instanceof Error) {
    return err.message;
  }
  return String(err);
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "notion-lite-mcp",
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
      name: "search_notion",
      description:
        "Search Notion for pages and databases by title keyword. Returns id, URL, and last-edited date for each result.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search keyword (page title or partial match)",
          },
          limit: {
            type: "number",
            description: "Maximum number of results to return (1–100, default 10)",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "get_page",
      description:
        "Retrieve a Notion page and render its content as plain text. " +
        "Supports heading, paragraph, bulleted/numbered list, to-do, toggle, code, quote, callout, and divider blocks.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description:
              "Notion page ID in UUID format (with or without hyphens). " +
              "Example: '1234abcd-12ab-12ab-12ab-1234abcd5678' or '1234abcd12ab12ab12ab1234abcd5678'",
          },
        },
        required: ["page_id"],
      },
    },
    {
      name: "append_to_page",
      description:
        "Append text content to the end of an existing Notion page. " +
        "Each non-empty line in the content becomes a separate paragraph block.",
      inputSchema: {
        type: "object",
        properties: {
          page_id: {
            type: "string",
            description: "Notion page ID in UUID format (with or without hyphens)",
          },
          content: {
            type: "string",
            description:
              "Text to append. Each line becomes one paragraph block. " +
              "Empty lines are ignored.",
          },
        },
        required: ["page_id", "content"],
      },
    },
    {
      name: "list_children",
      description:
        "List all direct child blocks of a Notion page or block. " +
        "Returns block type, id, and a preview of each block's content.",
      inputSchema: {
        type: "object",
        properties: {
          block_id: {
            type: "string",
            description:
              "Notion page ID or block ID in UUID format (with or without hyphens)",
          },
        },
        required: ["block_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text: string;

    switch (name) {
      case "search_notion": {
        const { query, limit } = args as { query: string; limit?: number };
        if (!query) throw new Error('"query" is required.');
        text = await handleSearchNotion(query, limit ?? 10);
        break;
      }
      case "get_page": {
        const { page_id } = args as { page_id: string };
        if (!page_id) throw new Error('"page_id" is required.');
        text = await handleGetPage(page_id);
        break;
      }
      case "append_to_page": {
        const { page_id, content } = args as {
          page_id: string;
          content: string;
        };
        if (!page_id) throw new Error('"page_id" is required.');
        if (!content) throw new Error('"content" is required.');
        text = await handleAppendToPage(page_id, content);
        break;
      }
      case "list_children": {
        const { block_id } = args as { block_id: string };
        if (!block_id) throw new Error('"block_id" is required.');
        text = await handleListChildren(block_id);
        break;
      }
      default:
        throw new Error(`Unknown tool: "${name}"`);
    }

    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = extractErrorMessage(err);
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
  process.stderr.write(
    `Fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
