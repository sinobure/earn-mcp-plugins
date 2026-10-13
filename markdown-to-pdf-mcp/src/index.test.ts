import { describe, it, expect, beforeAll, afterAll } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  convertMarkdown,
  resolveTheme,
  isSafeUrl,
  resolveOutputPath,
  resolveInputPath,
  handleSaveAsHtmlFile,
  handleConvertFile,
  handleMarkdownToHtml,
  THEMES,
} from "./lib.js";

let root: string;
let outside: string;

beforeAll(async () => {
  root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "md2pdf-root-")));
  outside = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "md2pdf-out-")));
  await fs.writeFile(path.join(outside, "secret.md"), "# secret");
  // "junction" avoids the admin/developer-mode requirement on Windows; ignored elsewhere.
  await fs.symlink(outside, path.join(root, "link"), "junction");
  await fs.writeFile(path.join(root, "doc.md"), "# こんにちは\n\n本文");
});
afterAll(async () => {
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(outside, { recursive: true, force: true });
});

describe("convertMarkdown", () => {
  const html = convertMarkdown(
    "# 見出し\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```js\nconst x = 1 < 2;\n```\n\n![alt](pic.png)",
    "T",
    "default"
  );
  it("renders Japanese, table, code, image", () => {
    expect(html).toContain("<h1>見出し</h1>");
    expect(html).toContain("<table>");
    expect(html).toContain("1 &lt; 2");
    expect(html).toContain('<img src="pic.png"');
  });
  it("has A4 print CSS and a CSP", () => {
    expect(html).toContain("size: A4");
    expect(html).toContain("@media print");
    expect(html).toContain("Content-Security-Policy");
  });
  it("does not forbid page breaks inside long tables/pre", () => {
    expect(THEMES.default).not.toMatch(/p, blockquote, pre, table/);
    expect(THEMES.default).toContain("tr, img, figure");
  });
  it("technical theme prints on white", () => {
    expect(THEMES.technical).toMatch(/@media print[\s\S]*background: #fff/);
  });
});

describe("XSS sanitization", () => {
  const out = convertMarkdown(
    [
      "<script>alert(1)</script>",
      "<img src=x onerror=alert(2)>",
      "[x](javascript:alert(3))",
      "![z](javascript:alert(5))",
      "[ok](https://example.com)",
      'text <b onclick="a()">b</b>',
    ].join("\n\n"),
    "</title><script>t</script>",
    "default"
  );
  it("escapes raw HTML", () => {
    expect(out).not.toMatch(/<script>alert/);
    expect(out).not.toMatch(/<img src=x/);
    expect(out).not.toMatch(/<b onclick/);
    expect(out).toContain("&lt;script&gt;alert(1)");
  });
  it("drops dangerous URLs but keeps safe ones", () => {
    expect(out).not.toMatch(/href="javascript/i);
    expect(out).not.toMatch(/src="javascript/i);
    expect(out).toContain('href="https://example.com"');
  });
  it("escapes the title", () => {
    expect(out).toContain("<title>&lt;/title&gt;&lt;script&gt;t&lt;/script&gt;</title>");
  });
  it("isSafeUrl", () => {
    expect(isSafeUrl("javascript:1")).toBe(false);
    expect(isSafeUrl("java\tscript:1")).toBe(false);
    expect(isSafeUrl("data:text/html,x")).toBe(false);
    expect(isSafeUrl("data:image/png;base64,AAAA", true)).toBe(true);
    expect(isSafeUrl("./a.png")).toBe(true);
    expect(isSafeUrl("#x")).toBe(true);
    expect(isSafeUrl("mailto:a@b.c")).toBe(true);
  });
});

describe("path policy", () => {
  it("accepts a file inside the root", async () => {
    expect(await resolveOutputPath(path.join(root, "sub", "a.html"), [root])).toBe(
      path.join(root, "sub", "a.html")
    );
  });
  it("rejects absolute paths outside the root", async () => {
    await expect(resolveOutputPath("/etc/cron.d/x.html", [root])).rejects.toThrow(/outside the allowed/);
  });
  it("rejects .. escapes", async () => {
    await expect(resolveOutputPath(path.join(root, "..", "x.html"), [root])).rejects.toThrow(/outside/);
  });
  it("accepts file names containing '..' that stay inside", async () => {
    await expect(resolveOutputPath(path.join(root, "a..b.html"), [root])).resolves.toBeTruthy();
  });
  it("rejects symlink escape (write and read)", async () => {
    await expect(resolveOutputPath(path.join(root, "link", "x.html"), [root])).rejects.toThrow(/outside/);
    await expect(resolveInputPath(path.join(root, "link", "secret.md"), [root])).rejects.toThrow(/outside/);
  });
  it("rejects wrong extensions", async () => {
    await expect(resolveOutputPath(path.join(root, "a.txt"), [root])).rejects.toThrow(/\.html/);
    await expect(resolveInputPath(path.join(root, "a.txt"), [root])).rejects.toThrow(/\.md/);
  });
  it("does not treat a sibling with the same prefix as inside", async () => {
    await expect(resolveOutputPath(root + "-evil/x.html", [root])).rejects.toThrow(/outside/);
  });
});

describe("handlers", () => {
  it("saves a file inside root", async () => {
    const p = path.join(root, "out", "r.html");
    const msg = await handleSaveAsHtmlFile("# hi", p, undefined, "elegant", [root]);
    expect(msg).toContain("not a PDF");
    expect(await fs.readFile(p, "utf-8")).toContain("<h1>hi</h1>");
  });
  it("refuses to write outside root", async () => {
    await expect(
      handleSaveAsHtmlFile("# hi", path.join(outside, "a.html"), undefined, "default", [root])
    ).rejects.toThrow();
  });
  it("converts a file with default output", async () => {
    await handleConvertFile(path.join(root, "doc.md"), undefined, undefined, "default", [root]);
    expect(await fs.readFile(path.join(root, "doc.html"), "utf-8")).toContain("こんにちは");
  });
  it("reports a missing input clearly", async () => {
    await expect(
      handleConvertFile(path.join(root, "none.md"), undefined, undefined, "default", [root])
    ).rejects.toThrow(/not found/);
  });
  it("rejects empty markdown and bad theme", () => {
    expect(() => handleMarkdownToHtml("  ", undefined, "default")).toThrow(/non-empty/);
    expect(() => resolveTheme("bogus")).toThrow(/Invalid theme/);
    expect(resolveTheme(undefined)).toBe("default");
  });
});
