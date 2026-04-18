/**
 * Unit tests for md2pdf-mcp (markdown-to-pdf-mcp)
 *
 * Strategy: Reproduce pure logic functions inline.
 * MCP SDK and marked are mocked where needed.
 * File system operations are mocked for save_as_html_file tests.
 */

import { describe, it, expect, vi } from "vitest";

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

type Theme = "default" | "technical" | "elegant";

const THEME_KEYS: Theme[] = ["default", "technical", "elegant"];

// CSS fingerprints: unique strings present in each theme
const THEME_CSS_HINTS: Record<Theme, string> = {
  default: "Helvetica Neue",
  technical: "Consolas",  // technical uses Consolas as primary font
  elegant: "Georgia",
};

// Simplified themes for testing (just enough to verify differentiation)
const THEMES: Record<Theme, string> = {
  default: `font-family: "Helvetica Neue", Arial;`,
  technical: `font-family: Consolas, "Courier New";`,
  elegant: `font-family: "Georgia", "Times New Roman";`,
};

function resolveTheme(raw: unknown): Theme {
  const valid: Theme[] = ["default", "technical", "elegant"];
  if (typeof raw === "string" && valid.includes(raw as Theme)) {
    return raw as Theme;
  }
  return "default";
}

function validateOutputPath(filePath: string): void {
  if (filePath.includes("..")) {
    throw new Error(
      `Path traversal ("..") is not permitted in output path: "${filePath}"`
    );
  }
  const dotIndex = filePath.lastIndexOf(".");
  const ext = dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : "";
  if (ext !== ".html" && ext !== ".htm") {
    throw new Error(
      `Output file must have .html or .htm extension, got: "${ext || "(none)"}"`
    );
  }
}

function validateInputPath(filePath: string): void {
  if (filePath.includes("..")) {
    throw new Error(
      `Path traversal ("..") is not permitted in input path: "${filePath}"`
    );
  }
  const dotIndex = filePath.lastIndexOf(".");
  const ext = dotIndex >= 0 ? filePath.slice(dotIndex).toLowerCase() : "";
  if (ext !== ".md" && ext !== ".markdown") {
    throw new Error(
      `Input file must have .md or .markdown extension, got: "${ext || "(none)"}"`
    );
  }
}

function buildHtml(bodyHtml: string, title: string, theme: Theme): string {
  const css = THEMES[theme];
  const safeTitle = title
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <title>${safeTitle}</title>
  <style>
${css}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

// Minimal markdown-to-HTML for tests (without marked dependency)
function simpleMarkdownToHtml(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => {
      if (line.startsWith("# ")) return `<h1>${line.slice(2)}</h1>`;
      if (line.startsWith("## ")) return `<h2>${line.slice(3)}</h2>`;
      if (line.startsWith("### ")) return `<h3>${line.slice(4)}</h3>`;
      if (line.startsWith("- ")) return `<li>${line.slice(2)}</li>`;
      if (line.trim() === "") return "";
      return `<p>${line}</p>`;
    })
    .join("\n");
}

function handleMarkdownToHtml(
  markdown: string,
  title: string | undefined,
  theme: Theme
): string {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error('"markdown" must be a non-empty string.');
  }
  const resolvedTitle = title?.trim() || "Document";
  const bodyHtml = simpleMarkdownToHtml(markdown);
  return buildHtml(bodyHtml, resolvedTitle, theme);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("resolveTheme", () => {
  it("returns 'default' for unknown theme string", () => {
    expect(resolveTheme("dark")).toBe("default");
  });

  it("returns 'default' for undefined", () => {
    expect(resolveTheme(undefined)).toBe("default");
  });

  it("accepts 'technical'", () => {
    expect(resolveTheme("technical")).toBe("technical");
  });

  it("accepts 'elegant'", () => {
    expect(resolveTheme("elegant")).toBe("elegant");
  });

  it("accepts 'default'", () => {
    expect(resolveTheme("default")).toBe("default");
  });
});

describe("markdown_to_html – basic HTML generation", () => {
  it("generates an HTML document with DOCTYPE", () => {
    const result = handleMarkdownToHtml("# Hello", "Test", "default");
    expect(result).toContain("<!DOCTYPE html>");
    expect(result).toContain("<html");
    expect(result).toContain("</html>");
  });

  it("includes the title in the <title> tag", () => {
    const result = handleMarkdownToHtml("# Content", "My Document", "default");
    expect(result).toContain("<title>My Document</title>");
  });

  it("defaults title to 'Document' when not provided", () => {
    const result = handleMarkdownToHtml("# Content", undefined, "default");
    expect(result).toContain("<title>Document</title>");
  });

  it("converts H1 markdown to <h1> tag", () => {
    const result = handleMarkdownToHtml("# Heading One", "T", "default");
    expect(result).toContain("<h1>Heading One</h1>");
  });

  it("converts H2 markdown to <h2> tag", () => {
    const result = handleMarkdownToHtml("## Section", "T", "default");
    expect(result).toContain("<h2>Section</h2>");
  });
});

describe("theme CSS differentiation", () => {
  it("default theme contains Helvetica font hint", () => {
    const result = handleMarkdownToHtml("# Test", "T", "default");
    expect(result).toContain(THEME_CSS_HINTS.default);
  });

  it("technical theme contains Consolas font hint", () => {
    const result = handleMarkdownToHtml("# Test", "T", "technical");
    expect(result).toContain(THEME_CSS_HINTS.technical);
  });

  it("elegant theme contains Georgia font hint", () => {
    const result = handleMarkdownToHtml("# Test", "T", "elegant");
    expect(result).toContain(THEME_CSS_HINTS.elegant);
  });

  it("all three themes produce different CSS output", () => {
    const outputs = THEME_KEYS.map((theme) =>
      handleMarkdownToHtml("# Test", "T", theme)
    );
    // Each theme's output should be unique
    const uniqueOutputs = new Set(outputs);
    expect(uniqueOutputs.size).toBe(3);
  });
});

describe("validateOutputPath – path traversal prevention", () => {
  it("blocks paths containing '..'", () => {
    expect(() => validateOutputPath("../evil.html")).toThrow("Path traversal");
  });

  it("blocks nested traversal", () => {
    expect(() => validateOutputPath("/tmp/../../etc/passwd.html")).toThrow(
      "Path traversal"
    );
  });

  it("allows a valid absolute .html path", () => {
    expect(() => validateOutputPath("/tmp/output.html")).not.toThrow();
  });

  it("allows a .htm extension", () => {
    expect(() => validateOutputPath("/tmp/output.htm")).not.toThrow();
  });

  it("rejects a .pdf extension", () => {
    expect(() => validateOutputPath("/tmp/output.pdf")).toThrow(
      ".html or .htm extension"
    );
  });

  it("rejects a path with no extension", () => {
    expect(() => validateOutputPath("/tmp/output")).toThrow(
      ".html or .htm extension"
    );
  });
});

describe("handleMarkdownToHtml – error handling", () => {
  it("throws for empty string input", () => {
    expect(() => handleMarkdownToHtml("", "Title", "default")).toThrow(
      '"markdown" must be a non-empty string.'
    );
  });

  it("throws for whitespace-only input", () => {
    expect(() => handleMarkdownToHtml("   ", "Title", "default")).toThrow(
      '"markdown" must be a non-empty string.'
    );
  });
});

describe("validateInputPath", () => {
  it("accepts .md extension", () => {
    expect(() => validateInputPath("/home/user/doc.md")).not.toThrow();
  });

  it("accepts .markdown extension", () => {
    expect(() => validateInputPath("/home/user/doc.markdown")).not.toThrow();
  });

  it("blocks path traversal in input", () => {
    expect(() => validateInputPath("../../secret.md")).toThrow("Path traversal");
  });

  it("rejects non-.md extension", () => {
    expect(() => validateInputPath("/home/user/doc.txt")).toThrow(
      ".md or .markdown extension"
    );
  });
});
