import { describe, it, expect, vi } from "vitest";
import { APIResponseError } from "@notionhq/client";
import {
  callTool,
  chunkText,
  validateAndNormalizeId,
  blockToText,
  createServer,
  TOOLS,
  MISSING_TOKEN_MESSAGE,
  parseLine,
  contentToBlocks,
  withRetry,
  type NotionLike,
} from "./server.js";

const ID = "12345678-1234-1234-1234-123456789012";
const rt = (s: string) => [{ plain_text: s }];
const blk = (id: string, type: string, text: string, extra: object = {}) => ({
  id,
  type,
  has_children: false,
  [type]: { rich_text: rt(text) },
  ...extra,
});

function fake() {
  return {
    search: vi.fn(),
    pages: { retrieve: vi.fn() },
    databases: { query: vi.fn() },
    blocks: { children: { list: vi.fn(), append: vi.fn().mockResolvedValue({}) } },
  } as unknown as NotionLike & {
    search: ReturnType<typeof vi.fn>;
    pages: { retrieve: ReturnType<typeof vi.fn> };
    databases: { query: ReturnType<typeof vi.fn> };
    blocks: { children: { list: ReturnType<typeof vi.fn>; append: ReturnType<typeof vi.fn> } };
  };
}
const text = (r: { content: { text: string }[] }) => r.content[0]!.text;

describe("validation", () => {
  it("normalizes ids", () => {
    expect(validateAndNormalizeId("12345678123412341234123456789012", "x")).toBe(ID);
    expect(() => validateAndNormalizeId("bad", "page_id")).toThrow(/Invalid page_id/);
    expect(() => validateAndNormalizeId(undefined, "page_id")).toThrow(/required/);
  });
  it("missing arguments object gives a clean error", async () => {
    const r = await callTool(fake(), "get_page", undefined);
    expect(r.isError).toBe(true);
    expect(text(r)).toContain('"page_id" is required');
    expect(text(r)).not.toContain("destructure");
  });
  it("rejects bad limit and unknown tool", async () => {
    expect(text(await callTool(fake(), "search_notion", { query: "a", limit: 500 }))).toContain("between 1 and 100");
    const r = await callTool(fake(), "nope", {});
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Unknown tool");
  });
});

describe("missing token", () => {
  it("returns setup instructions from a tool call", async () => {
    const r = await callTool(null, "search_notion", { query: "a" });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe(`Error: ${MISSING_TOKEN_MESSAGE}`);
  });
  it("createServer(null) has no side effects", () => {
    expect(createServer(null)).toBeDefined();
  });
});

describe("get_page", () => {
  it("numbers lists, distinguishes toggle/quote, recurses into children", async () => {
    const n = fake();
    n.pages.retrieve.mockResolvedValue({ properties: { Name: { type: "title", title: rt("Doc") } } });
    n.blocks.children.list.mockImplementation(async ({ block_id }: { block_id: string }) => {
      if (block_id === "tog") return { results: [blk("c1", "paragraph", "inner")], has_more: false };
      return {
        results: [
          blk("a", "numbered_list_item", "one"),
          blk("b", "numbered_list_item", "two"),
          blk("tog", "toggle", "T", { has_children: true }),
          blk("q", "quote", "Q"),
          blk("p", "paragraph", "para"),
          blk("c", "numbered_list_item", "restart"),
        ],
        has_more: false,
      };
    });
    const out = text(await callTool(n, "get_page", { page_id: ID }));
    expect(out).toContain("1. one\n2. two");
    expect(out).toContain("▸ T\n  inner");
    expect(out).toContain("> Q");
    expect(out).toMatch(/1\. restart/);
  });
  it("respects max_depth", async () => {
    const n = fake();
    n.pages.retrieve.mockResolvedValue({ properties: {} });
    n.blocks.children.list.mockResolvedValue({
      results: [blk("tog", "toggle", "T", { has_children: true })],
      has_more: false,
    });
    const out = text(await callTool(n, "get_page", { page_id: ID, max_depth: 0 }));
    expect(out).toContain("max_depth reached");
    expect(n.blocks.children.list).toHaveBeenCalledTimes(1);
  });
  it("truncates with max_chars", async () => {
    const n = fake();
    n.pages.retrieve.mockResolvedValue({ properties: {} });
    n.blocks.children.list.mockResolvedValue({ results: [blk("a", "paragraph", "x".repeat(5000))], has_more: false });
    const out = text(await callTool(n, "get_page", { page_id: ID, max_chars: 1000 }));
    expect(out).toContain("[truncated at 1000 characters");
  });
  it("paginates blocks", async () => {
    const n = fake();
    n.pages.retrieve.mockResolvedValue({ properties: {} });
    n.blocks.children.list
      .mockResolvedValueOnce({ results: [blk("a", "paragraph", "first")], has_more: true, next_cursor: "c2" })
      .mockResolvedValueOnce({ results: [blk("b", "paragraph", "second")], has_more: false });
    const out = text(await callTool(n, "get_page", { page_id: ID }));
    expect(out).toContain("first\nsecond");
  });
});

describe("append_to_page", () => {
  it("splits long lines into <=2000 char rich_text", async () => {
    expect(chunkText("x".repeat(4500)).map((c) => c.length)).toEqual([2000, 2000, 500]);
    const emoji = chunkText("😀".repeat(1500));
    expect(emoji.every((c) => c.length <= 2000)).toBe(true);
    expect(emoji.join("")).toBe("😀".repeat(1500));
    const n = fake();
    await callTool(n, "append_to_page", { page_id: ID, content: "y".repeat(2500) });
    const kids = n.blocks.children.append.mock.calls[0]![0].children;
    expect(kids).toHaveLength(2);
    expect(kids[0].paragraph.rich_text[0].text.content).toHaveLength(2000);
  });
  it("batches 100 blocks per request", async () => {
    const n = fake();
    const content = Array.from({ length: 250 }, (_, i) => `line ${i}`).join("\n");
    const r = await callTool(n, "append_to_page", { page_id: ID, content });
    expect(r.isError).toBeUndefined();
    expect(n.blocks.children.append.mock.calls.map((c) => c[0].children.length)).toEqual([100, 100, 50]);
  });
  it("reports partial progress on mid-batch failure", async () => {
    const n = fake();
    n.blocks.children.append.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("boom"));
    const content = Array.from({ length: 150 }, (_, i) => `l${i}`).join("\n");
    const r = await callTool(n, "append_to_page", { page_id: ID, content });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("Partially appended: 100 of 150");
  });
  it("rejects empty content", async () => {
    expect((await callTool(fake(), "append_to_page", { page_id: ID, content: " \n " })).isError).toBe(true);
  });
});

describe("search_notion / query_database", () => {
  it("passes cursor and filter, prints next_cursor", async () => {
    const n = fake();
    n.search.mockResolvedValue({
      results: [{ object: "page", id: ID, url: "u", last_edited_time: "2026-01-02T00:00:00Z", properties: { t: { type: "title", title: rt("Hello") } } }],
      has_more: true,
      next_cursor: "NEXT",
    });
    const out = text(await callTool(n, "search_notion", { query: "h", cursor: "C", type: "page" }));
    expect(n.search.mock.calls[0]![0]).toMatchObject({ start_cursor: "C", filter: { property: "object", value: "page" } });
    expect(out).toContain("[page] Hello");
    expect(out).toContain("next_cursor: NEXT");
  });
  it("queries database rows", async () => {
    const n = fake();
    n.databases.query.mockResolvedValue({
      results: [{ id: ID, url: "u", properties: { Name: { type: "title", title: rt("Row") }, Tags: { type: "multi_select", multi_select: [{ name: "a" }, { name: "b" }] }, Done: { type: "checkbox", checkbox: true } } }],
      has_more: false,
    });
    const out = text(await callTool(n, "query_database", { database_id: ID }));
    expect(out).toContain("[row] Row");
    expect(out).toContain("Tags: a, b");
    expect(out).toContain("Done: true");
  });
});

describe("filter / sorts / markdown", () => {
  it("passes filter and sorts (JSON strings) to the API", async () => {
    const n = fake();
    n.databases.query.mockResolvedValue({ results: [], has_more: false });
    await callTool(n, "query_database", {
      database_id: ID,
      filter: '{"property":"Status","select":{"equals":"Done"}}',
      sorts: '[{"property":"Name","direction":"ascending"}]',
    });
    expect(n.databases.query.mock.calls[0]![0]).toMatchObject({
      filter: { property: "Status", select: { equals: "Done" } },
      sorts: [{ property: "Name", direction: "ascending" }],
    });
  });
  it("rejects invalid JSON filter with a clear error", async () => {
    const r = await callTool(fake(), "query_database", { database_id: ID, filter: "{bad" });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("valid JSON");
  });
  it("parses markdown prefixes", () => {
    expect(parseLine("## Title")).toEqual({ type: "heading_2", text: "Title" });
    expect(parseLine("- item")).toEqual({ type: "bulleted_list_item", text: "item" });
    expect(parseLine("3. step")).toEqual({ type: "numbered_list_item", text: "step" });
    expect(parseLine("- [x] done")).toEqual({ type: "to_do", text: "done", checked: true });
    expect(parseLine("plain")).toEqual({ type: "paragraph", text: "plain" });
  });
  it("appends mixed block types", async () => {
    const n = fake();
    await callTool(n, "append_to_page", { page_id: ID, content: "# H\n- a\ntext" });
    const kids = n.blocks.children.append.mock.calls[0]![0].children;
    expect(kids.map((k: { type: string }) => k.type)).toEqual(["heading_1", "bulleted_list_item", "paragraph"]);
  });
});

describe("create_page / code / retry / properties", () => {
  it("creates a page with content", async () => {
    const n = fake();
    (n as unknown as { pages: { create: unknown } }).pages.create = vi.fn().mockResolvedValue({ id: ID, url: "https://n/x" });
    const out = text(await callTool(n, "create_page", { parent_page_id: ID, title: "T", content: "# H\ntext" }));
    const call = (n.pages as unknown as { create: { mock: { calls: [any][] } } }).create.mock.calls[0]![0];
    expect(call.parent).toEqual({ page_id: ID });
    expect(call.children).toHaveLength(2);
    expect(out).toContain("https://n/x");
  });
  it("converts quote, divider and fenced code", () => {
    const { children } = contentToBlocks("> q\n---\n```ts\nconst a = 1;\nb()\n```");
    expect((children as { type: string }[]).map((c) => c.type)).toEqual(["quote", "divider", "code"]);
    expect((children[2] as any).code.rich_text[0].text.content).toBe("const a = 1;\nb()");
    expect((children[2] as any).code.language).toBe("ts");
  });
  it("retries a 429 then succeeds, but gives up on other errors", async () => {
    const e429 = Object.assign(Object.create(APIResponseError.prototype), { status: 429, code: "rate_limited", message: "slow" });
    const fn = vi.fn().mockRejectedValueOnce(e429).mockResolvedValue("ok");
    expect(await withRetry(fn, [1, 1])).toBe("ok");
    const bad = vi.fn().mockRejectedValue(new Error("boom"));
    await expect(withRetry(bad, [1, 1])).rejects.toThrow("boom");
    expect(bad).toHaveBeenCalledTimes(1);
  });
  it("shows page properties in get_page", async () => {
    const n = fake();
    n.pages.retrieve.mockResolvedValue({ id: ID, properties: { Name: { type: "title", title: rt("Row") }, Status: { type: "select", select: { name: "Done" } } } });
    n.blocks.children.list.mockResolvedValue({ results: [], has_more: false });
    expect(text(await callTool(n, "get_page", { page_id: ID }))).toContain("Status: Done");
  });
});

describe("errors", () => {
  it("adds Notion code and an action hint", async () => {
    const err = Object.create(APIResponseError.prototype);
    Object.assign(err, { status: 404, code: "object_not_found", message: "Could not find page" });
    const n = fake();
    n.pages.retrieve.mockRejectedValue(err);
    const r = await callTool(n, "get_page", { page_id: ID });
    expect(r.isError).toBe(true);
    expect(text(r)).toContain("404, object_not_found");
    expect(text(r)).toContain("Connections");
  });
});

describe("tool definitions", () => {
  it("has annotations; append_to_page and create_page are writes", () => {
    for (const t of TOOLS) {
      expect(t.annotations).toBeDefined();
      expect(t.annotations.readOnlyHint).toBe(!["append_to_page", "create_page"].includes(t.name));
    }
  });
  it("blockToText handles table rows", () => {
    expect(blockToText({ id: "r", type: "table_row", table_row: { cells: [rt("a"), rt("b")] } } as never)).toBe("| a | b |");
  });
});
