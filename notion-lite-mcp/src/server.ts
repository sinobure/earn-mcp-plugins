import { Client, APIResponseError } from "@notionhq/client";
import type {
  BlockObjectResponse,
  PartialBlockObjectResponse,
  PageObjectResponse,
  DatabaseObjectResponse,
} from "@notionhq/client/build/src/api-endpoints.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

export const VERSION = "1.1.0";

/** Subset of the Notion client used here (allows test doubles). */
export type NotionLike = Pick<Client, "search" | "pages" | "blocks" | "databases">;

type AnyBlock = BlockObjectResponse | PartialBlockObjectResponse;

export const MAX_RICH_TEXT = 2000; // Notion limit per rich_text element
export const MAX_APPEND_BLOCKS = 100; // Notion limit per append request

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export class UserError extends Error {}

export const MISSING_TOKEN_MESSAGE =
  "NOTION_API_KEY is not set. Create an internal integration at " +
  "https://www.notion.so/my-integrations, copy its secret (starts with ntn_ or secret_), " +
  'and set it in the MCP server "env" as NOTION_API_KEY. Then share the target pages with ' +
  'the integration (page menu "..." > "Connections") and restart the client.';

export function extractErrorMessage(err: unknown): string {
  if (err instanceof APIResponseError) {
    const hints: Record<string, string> = {
      unauthorized:
        "The token is invalid. Check NOTION_API_KEY (internal integration secret, ntn_... or secret_...).",
      object_not_found:
        "Page/database not found, or it is not shared with the integration. " +
        'Open the page in Notion, then "..." > "Connections" and add your integration.',
      restricted_resource:
        "The integration lacks permission. Enable the needed capability (read/update content) on the integration page, and share the page with it.",
      rate_limited: "Rate limited by Notion. Wait a few seconds and retry.",
      validation_error:
        "Notion rejected the request. Check the ID type (page vs database) and the arguments.",
    };
    const hint = hints[err.code] ? ` ${hints[err.code]}` : "";
    return `Notion API error (${err.status}, ${err.code}): ${err.message}${hint}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const UUID_WITH_HYPHENS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_WITHOUT_HYPHENS = /^[0-9a-f]{32}$/i;

export function validateAndNormalizeId(raw: unknown, label: string): string {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new UserError(`"${label}" is required and must be a string.`);
  }
  const trimmed = raw.trim();
  if (UUID_WITH_HYPHENS.test(trimmed)) return trimmed.toLowerCase();
  if (UUID_WITHOUT_HYPHENS.test(trimmed)) {
    const h = trimmed.toLowerCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }
  throw new UserError(
    `Invalid ${label}: "${raw}". Expected a UUID (hyphenated or 32-char hex).`
  );
}

function reqString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.trim() === "") {
    throw new UserError(`"${key}" is required and must be a non-empty string.`);
  }
  return v;
}

function optString(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  if (v === undefined || v === null || v === "") return undefined;
  if (typeof v !== "string") throw new UserError(`"${key}" must be a string.`);
  return v;
}

function optInt(
  args: Record<string, unknown>,
  key: string,
  def: number,
  min: number,
  max: number
): number {
  const v = args[key];
  if (v === undefined || v === null) return def;
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) {
    throw new UserError(`"${key}" must be an integer between ${min} and ${max}.`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function richTextToPlain(rt: Array<{ plain_text: string }> | undefined): string {
  return rt && rt.length ? rt.map((t) => t.plain_text).join("") : "";
}

/** Single-block text (no children). `n` is the 1-based index for numbered items. */
export function blockToText(block: AnyBlock, n = 1): string {
  if (!("type" in block)) return `[block: ${block.id}]`;
  const b = block as BlockObjectResponse;
  switch (b.type) {
    case "heading_1": return `# ${richTextToPlain(b.heading_1.rich_text)}`;
    case "heading_2": return `## ${richTextToPlain(b.heading_2.rich_text)}`;
    case "heading_3": return `### ${richTextToPlain(b.heading_3.rich_text)}`;
    case "paragraph": return richTextToPlain(b.paragraph.rich_text);
    case "bulleted_list_item": return `- ${richTextToPlain(b.bulleted_list_item.rich_text)}`;
    case "numbered_list_item": return `${n}. ${richTextToPlain(b.numbered_list_item.rich_text)}`;
    case "to_do":
      return `${b.to_do.checked ? "[x]" : "[ ]"} ${richTextToPlain(b.to_do.rich_text)}`;
    case "toggle": return `▸ ${richTextToPlain(b.toggle.rich_text)}`;
    case "code":
      return `\`\`\`${b.code.language || ""}\n${richTextToPlain(b.code.rich_text)}\n\`\`\``;
    case "quote": return `> ${richTextToPlain(b.quote.rich_text)}`;
    case "callout": return `[!] ${richTextToPlain(b.callout.rich_text)}`;
    case "divider": return "---";
    case "table_of_contents": return "[Table of Contents]";
    case "image": return "[image]";
    case "video": return "[video]";
    case "file": return "[file]";
    case "pdf": return "[pdf]";
    case "bookmark": return `[bookmark: ${b.bookmark.url}]`;
    case "embed": return `[embed: ${b.embed.url}]`;
    case "equation": return `$$${b.equation.expression}$$`;
    case "table_row":
      return `| ${b.table_row.cells.map((c) => richTextToPlain(c)).join(" | ")} |`;
    case "child_page": return `[child page: ${b.child_page.title}] (id: ${b.id})`;
    case "child_database": return `[child database: ${b.child_database.title}] (id: ${b.id})`;
    default: return `[${b.type}]`;
  }
}

export async function fetchAllChildren(
  notion: NotionLike,
  blockId: string
): Promise<AnyBlock[]> {
  const results: AnyBlock[] = [];
  let cursor: string | undefined;
  do {
    const r = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    results.push(...r.results);
    cursor = r.has_more ? (r.next_cursor ?? undefined) : undefined;
  } while (cursor);
  return results;
}

/** Render blocks recursively. Child pages/databases are never descended into. */
export async function renderBlocks(
  notion: NotionLike,
  blocks: AnyBlock[],
  depth: number,
  maxDepth: number,
  out: string[]
): Promise<void> {
  const indent = "  ".repeat(depth);
  let counter = 0;
  for (const block of blocks) {
    const type = "type" in block ? (block as BlockObjectResponse).type : "";
    counter = type === "numbered_list_item" ? counter + 1 : 0;
    const text = blockToText(block, counter);
    if (text !== "") {
      out.push(
        text
          .split("\n")
          .map((l) => indent + l)
          .join("\n")
      );
    }
    const hasChildren = "has_children" in block && block.has_children;
    if (hasChildren && type !== "child_page" && type !== "child_database") {
      if (depth < maxDepth) {
        const kids = await fetchAllChildren(notion, block.id);
        await renderBlocks(notion, kids, depth + 1, maxDepth, out);
      } else {
        out.push(`${indent}  [… nested blocks omitted: max_depth reached]`);
      }
    }
  }
}

function pageTitle(page: PageObjectResponse): string {
  const t = Object.values(page.properties).find((p) => p.type === "title");
  return t?.type === "title" ? richTextToPlain(t.title) || "(untitled)" : "(untitled)";
}

function propertyToText(p: PageObjectResponse["properties"][string]): string {
  switch (p.type) {
    case "title": return richTextToPlain(p.title);
    case "rich_text": return richTextToPlain(p.rich_text);
    case "number": return p.number === null ? "" : String(p.number);
    case "select": return p.select?.name ?? "";
    case "status": return p.status?.name ?? "";
    case "multi_select": return p.multi_select.map((s) => s.name).join(", ");
    case "date": return p.date ? (p.date.end ? `${p.date.start} → ${p.date.end}` : p.date.start) : "";
    case "checkbox": return p.checkbox ? "true" : "false";
    case "url": return p.url ?? "";
    case "email": return p.email ?? "";
    case "phone_number": return p.phone_number ?? "";
    case "people": return p.people.map((u) => ("name" in u && u.name) || u.id).join(", ");
    default: return `[${p.type}]`;
  }
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return (
    text.slice(0, maxChars) +
    `\n\n[truncated at ${maxChars} characters. Use list_children on a sub-block, or raise max_chars (max 200000).]`
  );
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleSearchNotion(
  notion: NotionLike,
  args: Record<string, unknown>
): Promise<string> {
  const query = reqString(args, "query").trim();
  const limit = optInt(args, "limit", 10, 1, 100);
  const cursor = optString(args, "cursor");
  const type = optString(args, "type");
  if (type !== undefined && type !== "page" && type !== "database") {
    throw new UserError('"type" must be "page" or "database".');
  }

  const response = await notion.search({
    query,
    page_size: limit,
    ...(cursor ? { start_cursor: cursor } : {}),
    ...(type ? { filter: { property: "object" as const, value: type } } : {}),
  } as Parameters<NotionLike["search"]>[0]);

  if (response.results.length === 0) {
    return `No results found for query: "${query}". If you expect results, make sure the pages are shared with the integration.`;
  }

  const lines = [`Search results for "${query}" (${response.results.length} found):\n`];
  for (const item of response.results) {
    if (item.object === "page") {
      const page = item as PageObjectResponse;
      lines.push(
        `[page] ${pageTitle(page)}\n  id: ${page.id}\n  url: ${page.url}\n  last edited: ${page.last_edited_time.slice(0, 10)}`
      );
    } else if (item.object === "database") {
      const db = item as DatabaseObjectResponse;
      lines.push(
        `[database] ${richTextToPlain(db.title) || "(untitled)"}\n  id: ${db.id}\n  url: ${db.url}\n  last edited: ${db.last_edited_time.slice(0, 10)}`
      );
    }
  }
  if (response.has_more && response.next_cursor) {
    lines.push(`\nnext_cursor: ${response.next_cursor}\n(Pass it as "cursor" to get the next page of results.)`);
  }
  return lines.join("\n");
}

export async function handleGetPage(
  notion: NotionLike,
  args: Record<string, unknown>
): Promise<string> {
  const id = validateAndNormalizeId(args["page_id"], "page_id");
  const maxDepth = optInt(args, "max_depth", 3, 0, 10);
  const maxChars = optInt(args, "max_chars", 20000, 1000, 200000);

  const page = (await notion.pages.retrieve({ page_id: id })) as PageObjectResponse;
  const blocks = await fetchAllChildren(notion, id);
  const body: string[] = [];
  await renderBlocks(notion, blocks, 0, maxDepth, body);
  const lines = [`# ${pageTitle(page)}`, `(id: ${id})`, ""];
  lines.push(...(body.length ? body : ["(empty page)"]));
  return truncate(lines.join("\n"), maxChars);
}

/** Split text into chunks of at most `size` characters (by code point). */
export function chunkText(text: string, size = MAX_RICH_TEXT): string[] {
  // Split by UTF-16 length (never inside a surrogate pair) so every chunk stays within Notion's limit.
  const chunks: string[] = [];
  let current = "";
  for (const ch of text) {
    if (current.length + ch.length > size) {
      chunks.push(current);
      current = "";
    }
    current += ch;
  }
  if (current || chunks.length === 0) chunks.push(current);
  return chunks;
}

export async function handleAppendToPage(
  notion: NotionLike,
  args: Record<string, unknown>
): Promise<string> {
  const id = validateAndNormalizeId(args["page_id"], "page_id");
  const content = reqString(args, "content");

  const lines = content
    .split("\n")
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);
  if (lines.length === 0) throw new UserError('"content" contains no non-empty lines.');

  const children = lines.flatMap((line) =>
    chunkText(line).map((text) => ({
      object: "block" as const,
      type: "paragraph" as const,
      paragraph: { rich_text: [{ type: "text" as const, text: { content: text } }] },
    }))
  );

  let appended = 0;
  try {
    for (let i = 0; i < children.length; i += MAX_APPEND_BLOCKS) {
      await notion.blocks.children.append({
        block_id: id,
        children: children.slice(i, i + MAX_APPEND_BLOCKS),
      });
      appended = Math.min(i + MAX_APPEND_BLOCKS, children.length);
    }
  } catch (err) {
    if (appended > 0) {
      throw new UserError(
        `Partially appended: ${appended} of ${children.length} block(s) were added before an error. ${extractErrorMessage(err)}`
      );
    }
    throw err;
  }

  return (
    `Successfully appended ${children.length} paragraph block(s) to page ${id}.\n` +
    `Preview:\n${lines.slice(0, 3).map((l) => `  ${l.length > 100 ? l.slice(0, 97) + "..." : l}`).join("\n")}` +
    (lines.length > 3 ? `\n  ... (${lines.length - 3} more line(s))` : "")
  );
}

export async function handleListChildren(
  notion: NotionLike,
  args: Record<string, unknown>
): Promise<string> {
  const id = validateAndNormalizeId(args["block_id"], "block_id");
  const blocks = await fetchAllChildren(notion, id);
  if (blocks.length === 0) return `No child blocks found for block ${id}.`;

  const lines = [`Child blocks of ${id} (${blocks.length} total):\n`];
  let counter = 0;
  blocks.forEach((block, i) => {
    const type = "type" in block ? (block as BlockObjectResponse).type : "unknown";
    counter = type === "numbered_list_item" ? counter + 1 : 0;
    const preview = blockToText(block, counter).replace(/\n/g, " ");
    const short = preview.length > 80 ? preview.slice(0, 77) + "..." : preview;
    const kids = "has_children" in block && block.has_children ? " (has children)" : "";
    lines.push(`${i + 1}. [${type}] ${short}${kids}\n   id: ${block.id}`);
  });
  return lines.join("\n");
}

export async function handleQueryDatabase(
  notion: NotionLike,
  args: Record<string, unknown>
): Promise<string> {
  const id = validateAndNormalizeId(args["database_id"], "database_id");
  const limit = optInt(args, "limit", 20, 1, 100);
  const cursor = optString(args, "cursor");

  const res = await notion.databases.query({
    database_id: id,
    page_size: limit,
    ...(cursor ? { start_cursor: cursor } : {}),
  });
  if (res.results.length === 0) return `No rows found in database ${id}.`;

  const lines = [`Rows of database ${id} (${res.results.length} returned):\n`];
  for (const r of res.results) {
    if (!("properties" in r)) continue;
    const page = r as PageObjectResponse;
    lines.push(`[row] ${pageTitle(page)}\n  id: ${page.id}\n  url: ${page.url}`);
    for (const [name, prop] of Object.entries(page.properties)) {
      if (prop.type === "title") continue;
      const v = propertyToText(prop);
      if (v !== "") lines.push(`  ${name}: ${v}`);
    }
  }
  if (res.has_more && res.next_cursor) {
    lines.push(`\nnext_cursor: ${res.next_cursor}\n(Pass it as "cursor" to get the next rows.)`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const ID_NOTE = "UUID with or without hyphens (a Notion URL ends with the 32-char ID).";

export const TOOLS = [
  {
    name: "search_notion",
    description:
      "Search pages and databases shared with the integration by title keyword. Returns id, URL and last-edited date; paginate with cursor.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search keyword (title or partial match)" },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 10, description: "Max results per call" },
        type: { type: "string", enum: ["page", "database"], description: "Restrict results to pages or databases" },
        cursor: { type: "string", description: "next_cursor from a previous call" },
      },
      required: ["query"],
    },
    annotations: { title: "Search Notion", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "get_page",
    description:
      "Read a Notion page as plain text, including nested blocks (toggles, lists, tables) up to max_depth. Output is capped by max_chars.",
    inputSchema: {
      type: "object" as const,
      properties: {
        page_id: { type: "string", description: `Page ID. ${ID_NOTE}` },
        max_depth: { type: "integer", minimum: 0, maximum: 10, default: 3, description: "How many levels of nested blocks to expand (0 = top level only)" },
        max_chars: { type: "integer", minimum: 1000, maximum: 200000, default: 20000, description: "Truncate output beyond this many characters" },
      },
      required: ["page_id"],
    },
    annotations: { title: "Get Notion page", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "append_to_page",
    description:
      "Append text to the end of a page. Each non-empty line becomes a paragraph block (lines over 2000 characters are split; large input is sent in batches of 100 blocks). Writes to Notion and cannot be undone by this server.",
    inputSchema: {
      type: "object" as const,
      properties: {
        page_id: { type: "string", description: `Page ID. ${ID_NOTE}` },
        content: { type: "string", description: "Text to append; one paragraph per non-empty line" },
      },
      required: ["page_id", "content"],
    },
    annotations: {
      title: "Append to Notion page",
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "list_children",
    description:
      "List the direct child blocks of a page or block with type, preview and ID (useful to find block or child-page IDs).",
    inputSchema: {
      type: "object" as const,
      properties: {
        block_id: { type: "string", description: `Page or block ID. ${ID_NOTE}` },
      },
      required: ["block_id"],
    },
    annotations: { title: "List child blocks", readOnlyHint: true, openWorldHint: true },
  },
  {
    name: "query_database",
    description:
      "Read rows of a Notion database (no filter): title, URL and common property values. Paginate with cursor.",
    inputSchema: {
      type: "object" as const,
      properties: {
        database_id: { type: "string", description: `Database ID (from search_notion). ${ID_NOTE}` },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20, description: "Max rows per call" },
        cursor: { type: "string", description: "next_cursor from a previous call" },
      },
      required: ["database_id"],
    },
    annotations: { title: "Query Notion database", readOnlyHint: true, openWorldHint: true },
  },
];

// ---------------------------------------------------------------------------
// Dispatch + server factory (no side effects)
// ---------------------------------------------------------------------------

export async function callTool(
  notion: NotionLike | null,
  name: string,
  rawArgs: unknown
): Promise<{ content: { type: "text"; text: string }[]; isError?: boolean }> {
  try {
    if (!TOOLS.some((t) => t.name === name)) {
      throw new UserError(`Unknown tool: "${name}". Available: ${TOOLS.map((t) => t.name).join(", ")}.`);
    }
    if (!notion) throw new UserError(MISSING_TOKEN_MESSAGE);
    const args =
      rawArgs && typeof rawArgs === "object" && !Array.isArray(rawArgs)
        ? (rawArgs as Record<string, unknown>)
        : {};
    let text: string;
    switch (name) {
      case "search_notion": text = await handleSearchNotion(notion, args); break;
      case "get_page": text = await handleGetPage(notion, args); break;
      case "append_to_page": text = await handleAppendToPage(notion, args); break;
      case "list_children": text = await handleListChildren(notion, args); break;
      default: text = await handleQueryDatabase(notion, args);
    }
    return { content: [{ type: "text", text }] };
  } catch (err) {
    return { content: [{ type: "text", text: `Error: ${extractErrorMessage(err)}` }], isError: true };
  }
}

/** Build the MCP server. `notion` is null when no token is configured. */
export function createServer(notion: NotionLike | null): Server {
  const server = new Server(
    { name: "notion-lite-mcp", version: VERSION },
    { capabilities: { tools: {} } }
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async (request) =>
    callTool(notion, request.params.name, request.params.arguments)
  );
  return server;
}
