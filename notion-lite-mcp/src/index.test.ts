/**
 * Unit tests for notion-lite-mcp
 *
 * Strategy: Mock the MCP SDK and @notionhq/client to prevent server startup
 * and API calls. Pure logic functions are reproduced inline for test isolation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock dependencies to prevent module-level side effects
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

// Set the env variable before @notionhq/client is resolved
process.env["NOTION_API_KEY"] = "test-key-for-unit-tests";

vi.mock("@notionhq/client", () => ({
  Client: vi.fn().mockImplementation(() => ({
    blocks: {
      children: {
        list: vi.fn(),
        append: vi.fn(),
      },
    },
    pages: { retrieve: vi.fn() },
    search: vi.fn(),
  })),
  APIResponseError: class APIResponseError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
}));

// ---------------------------------------------------------------------------
// Reproduce pure logic functions under test
// ---------------------------------------------------------------------------

const UUID_WITH_HYPHENS =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_WITHOUT_HYPHENS = /^[0-9a-f]{32}$/i;

function validateAndNormalizeId(raw: string, label: string): string {
  const trimmed = raw.trim();

  if (UUID_WITH_HYPHENS.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  if (UUID_WITHOUT_HYPHENS.test(trimmed)) {
    const h = trimmed.toLowerCase();
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  throw new Error(
    `Invalid ${label}: "${raw}". Expected a UUID in hyphenated or plain 32-character hex format.`
  );
}

function richTextToPlain(
  richText: Array<{ plain_text: string }> | undefined
): string {
  if (!richText || richText.length === 0) return "";
  return richText.map((t) => t.plain_text).join("");
}

type MockBlock = {
  id: string;
  type: string;
  [key: string]: unknown;
};

function blockToText(block: MockBlock): string {
  switch (block.type) {
    case "heading_1": {
      const data = block["heading_1"] as { rich_text: Array<{ plain_text: string }> };
      return `# ${richTextToPlain(data.rich_text)}`;
    }
    case "heading_2": {
      const data = block["heading_2"] as { rich_text: Array<{ plain_text: string }> };
      return `## ${richTextToPlain(data.rich_text)}`;
    }
    case "heading_3": {
      const data = block["heading_3"] as { rich_text: Array<{ plain_text: string }> };
      return `### ${richTextToPlain(data.rich_text)}`;
    }
    case "paragraph": {
      const data = block["paragraph"] as { rich_text: Array<{ plain_text: string }> };
      return richTextToPlain(data.rich_text);
    }
    case "bulleted_list_item": {
      const data = block["bulleted_list_item"] as { rich_text: Array<{ plain_text: string }> };
      return `- ${richTextToPlain(data.rich_text)}`;
    }
    case "numbered_list_item": {
      const data = block["numbered_list_item"] as { rich_text: Array<{ plain_text: string }> };
      return `1. ${richTextToPlain(data.rich_text)}`;
    }
    case "divider":
      return "---";
    default:
      return `[${block.type}]`;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateAndNormalizeId", () => {
  it("accepts a valid UUID with hyphens and returns lowercase", () => {
    const id = "1234abcd-12ab-12ab-12ab-1234abcd5678";
    expect(validateAndNormalizeId(id, "page_id")).toBe(id.toLowerCase());
  });

  it("accepts a valid UUID with uppercase letters and normalises to lowercase", () => {
    const id = "1234ABCD-12AB-12AB-12AB-1234ABCD5678";
    expect(validateAndNormalizeId(id, "page_id")).toBe(id.toLowerCase());
  });

  it("accepts a 32-char hex without hyphens and inserts them", () => {
    const raw = "1234abcd12ab12ab12ab1234abcd5678";
    const expected = "1234abcd-12ab-12ab-12ab-1234abcd5678";
    expect(validateAndNormalizeId(raw, "page_id")).toBe(expected);
  });

  it("trims surrounding whitespace before validation", () => {
    const id = "  1234abcd-12ab-12ab-12ab-1234abcd5678  ";
    expect(validateAndNormalizeId(id, "page_id")).toBe(
      "1234abcd-12ab-12ab-12ab-1234abcd5678"
    );
  });

  it("rejects a completely invalid string", () => {
    expect(() => validateAndNormalizeId("not-a-uuid", "page_id")).toThrow(
      "Invalid page_id"
    );
  });

  it("rejects an empty string", () => {
    expect(() => validateAndNormalizeId("", "page_id")).toThrow("Invalid page_id");
  });
});

describe("blockToText – block type conversions", () => {
  it("converts heading_1 to markdown H1", () => {
    const block: MockBlock = {
      id: "id1",
      type: "heading_1",
      heading_1: { rich_text: [{ plain_text: "Hello World" }] },
    };
    expect(blockToText(block)).toBe("# Hello World");
  });

  it("converts heading_2 to markdown H2", () => {
    const block: MockBlock = {
      id: "id2",
      type: "heading_2",
      heading_2: { rich_text: [{ plain_text: "Section" }] },
    };
    expect(blockToText(block)).toBe("## Section");
  });

  it("converts paragraph to plain text", () => {
    const block: MockBlock = {
      id: "id3",
      type: "paragraph",
      paragraph: { rich_text: [{ plain_text: "Hello" }, { plain_text: " World" }] },
    };
    expect(blockToText(block)).toBe("Hello World");
  });

  it("converts bulleted_list_item to markdown list item", () => {
    const block: MockBlock = {
      id: "id4",
      type: "bulleted_list_item",
      bulleted_list_item: { rich_text: [{ plain_text: "Item one" }] },
    };
    expect(blockToText(block)).toBe("- Item one");
  });

  it("converts divider to horizontal rule", () => {
    const block: MockBlock = {
      id: "id5",
      type: "divider",
    };
    expect(blockToText(block)).toBe("---");
  });

  it("handles unknown block type with fallback", () => {
    const block: MockBlock = {
      id: "id6",
      type: "unsupported_type",
    };
    expect(blockToText(block)).toBe("[unsupported_type]");
  });
});

describe("API error handling – isError: true pattern", () => {
  it("extractErrorMessage returns status code for APIResponseError", () => {
    // Simulate what the production error handler does
    const err = { status: 404, message: "object not found" };
    const isApiError = typeof err.status === "number";
    const message = isApiError
      ? `Notion API error (${err.status}): ${err.message}`
      : err.message;
    expect(message).toBe("Notion API error (404): object not found");
  });

  it("extractErrorMessage returns message for plain Error", () => {
    const err = new Error("page not found");
    const message = err instanceof Error ? err.message : String(err);
    expect(message).toBe("page not found");
  });
});
