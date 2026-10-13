import { Marked } from "marked";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export type Theme = "default" | "technical" | "elegant";

// ---------------------------------------------------------------------------
// CSS themes (all hardcoded — no runtime CSS dependency)
// ---------------------------------------------------------------------------

const BASE_PRINT_CSS = `
  *, *::before, *::after { box-sizing: border-box; }

  @page {
    size: A4;
    margin: 20mm 15mm 20mm 15mm;
  }

  body {
    font-size: 10.5pt;
    line-height: 1.7;
    color: #1a1a1a;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  h1, h2, h3, h4, h5, h6 {
    page-break-after: avoid;
    break-after: avoid;
    page-break-inside: avoid;
    margin-top: 1.4em;
    margin-bottom: 0.4em;
  }

  p, blockquote, li { orphans: 3; widows: 3; }
  /* Long blocks (pre, table, lists) may split across pages; only rows are kept whole. */
  tr, img, figure { page-break-inside: avoid; break-inside: avoid; }
  thead { display: table-header-group; }
  pre { white-space: pre-wrap; word-break: break-word; }

  a { color: inherit; text-decoration: underline; }

  img { max-width: 100%; height: auto; page-break-inside: avoid; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin: 1em 0;
    font-size: 0.95em;
  }
  th, td {
    border: 1px solid #ccc;
    padding: 6px 10px;
    text-align: left;
  }
  th { background: #f0f0f0; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }

  blockquote {
    border-left: 4px solid #ccc;
    margin: 1em 0;
    padding: 0.5em 1em;
    color: #555;
    background: #f9f9f9;
  }

  hr {
    border: none;
    border-top: 1px solid #ddd;
    margin: 2em 0;
  }

  @media print {
    /* @page already provides the margins: remove on-screen max-width/padding */
    html, body { background: #fff !important; color: #1a1a1a !important; }
    body { max-width: none !important; margin: 0 !important; padding: 0 !important; }
    a[href^="http"]::after { content: " (" attr(href) ")"; font-size: 0.85em; word-break: break-all; }
  }
`;

export const THEMES: Record<Theme, string> = {
  default: `
    ${BASE_PRINT_CSS}
    body {
      font-family: "Helvetica Neue", Arial, "Hiragino Kaku Gothic ProN",
                   "Hiragino Sans", Meiryo, sans-serif;
      max-width: 860px;
      margin: 0 auto;
      padding: 20px 24px;
    }
    h1 { font-size: 2em; border-bottom: 2px solid #333; padding-bottom: 0.2em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 0.2em; }
    h3 { font-size: 1.2em; }
    code {
      background: #f4f4f4;
      padding: 0.15em 0.35em;
      border-radius: 3px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 0.88em;
    }
    pre {
      background: #f4f4f4;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 1em;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
  `,

  technical: `
    ${BASE_PRINT_CSS}
    body {
      font-family: Consolas, "Courier New", "Hiragino Kaku Gothic ProN",
                   "Hiragino Sans", Meiryo, monospace;
      max-width: 900px;
      margin: 0 auto;
      padding: 20px 24px;
      background: #1e1e1e;
      color: #d4d4d4;
    }
    h1 { font-size: 1.9em; color: #4ec9b0; border-bottom: 2px solid #4ec9b0; padding-bottom: 0.2em; }
    h2 { font-size: 1.45em; color: #9cdcfe; border-bottom: 1px solid #3c3c3c; padding-bottom: 0.2em; }
    h3 { font-size: 1.15em; color: #ce9178; }
    h4, h5, h6 { color: #dcdcaa; }
    a { color: #4ec9b0; }
    blockquote {
      border-left: 4px solid #4ec9b0;
      background: #2d2d2d;
      color: #aaa;
    }
    code {
      background: #2d2d2d;
      color: #ce9178;
      padding: 0.15em 0.35em;
      border-radius: 3px;
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.88em;
    }
    pre {
      background: #2d2d2d;
      border: 1px solid #3c3c3c;
      border-radius: 4px;
      padding: 1em;
      overflow-x: auto;
    }
    pre code { background: none; color: #d4d4d4; padding: 0; }
    th { background: #2d2d2d; color: #9cdcfe; }
    tr:nth-child(even) td { background: #252525; }
    th, td { border-color: #3c3c3c; }
    hr { border-top-color: #3c3c3c; }
    @media print {
      body { background: #fff !important; color: #1a1a1a !important; }
      h1, h2, h3, h4, h5, h6 { color: #111 !important; border-color: #888 !important; }
      a { color: #0b5cad !important; }
      blockquote { background: #f4f4f4 !important; color: #333 !important; border-left-color: #888 !important; }
      code, pre, pre code { background: #f4f4f4 !important; color: #1a1a1a !important; }
      pre { border-color: #ccc !important; }
      th { background: #eee !important; color: #111 !important; }
      tr:nth-child(even) td { background: #fafafa !important; }
      th, td { border-color: #ccc !important; }
    }
  `,

  elegant: `
    ${BASE_PRINT_CSS}
    body {
      font-family: "Georgia", "Times New Roman",
                   "Yu Mincho", "YuMincho", "Hiragino Mincho ProN", serif;
      max-width: 720px;
      margin: 0 auto;
      padding: 24px 32px;
      line-height: 1.9;
    }
    h1 {
      font-size: 2.1em;
      font-weight: 700;
      letter-spacing: 0.05em;
      border-bottom: 3px double #333;
      padding-bottom: 0.3em;
      text-align: center;
    }
    h2 {
      font-size: 1.55em;
      border-bottom: 1px solid #888;
      padding-bottom: 0.2em;
      font-style: italic;
    }
    h3 { font-size: 1.2em; font-weight: 700; }
    p { text-align: justify; }
    blockquote {
      border-left: 4px solid #888;
      background: #f7f5f2;
      font-style: italic;
      color: #444;
    }
    code {
      background: #f7f5f2;
      padding: 0.15em 0.35em;
      border-radius: 3px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
      font-size: 0.87em;
    }
    pre {
      background: #f7f5f2;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 1em;
      overflow-x: auto;
    }
    pre code { background: none; padding: 0; }
  `,
};


// ---------------------------------------------------------------------------
// Markdown -> HTML (raw HTML is escaped, dangerous URL schemes are dropped)
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Allow http(s), mailto, fragments and relative URLs. Reject javascript:, data:, vbscript: etc. */
export function isSafeUrl(href: string, allowDataImage = false): boolean {
  // Browsers ignore control chars / whitespace inside the scheme ("java\tscript:")
  const cleaned = href.replace(/[\u0000-\u0020\u007f-\u009f]+/g, "");
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned);
  if (!m) return true; // relative, "#frag", "//host/x"
  const scheme = m[1].toLowerCase();
  if (scheme === "http" || scheme === "https" || scheme === "mailto") return true;
  if (allowDataImage && /^data:image\/(png|jpe?g|gif|webp);base64,/i.test(cleaned)) return true;
  return false;
}

const md = new Marked({ gfm: true, breaks: false });
md.use({
  renderer: {
    // Raw HTML (block and inline) is shown as text, never interpreted.
    html(token) {
      return escapeHtml(token.text);
    },
    link(token) {
      const inner = this.parser.parseInline(token.tokens);
      if (!isSafeUrl(token.href)) return inner;
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<a href="${escapeHtml(token.href)}"${title} rel="noopener noreferrer">${inner}</a>`;
    },
    image(token) {
      if (!isSafeUrl(token.href, true)) return escapeHtml(token.text);
      const title = token.title ? ` title="${escapeHtml(token.title)}"` : "";
      return `<img src="${escapeHtml(token.href)}" alt="${escapeHtml(token.text)}"${title}>`;
    },
  },
});

const CSP =
  "default-src 'none'; img-src http: https: data: file:; style-src 'unsafe-inline'";

export function buildHtml(bodyHtml: string, title: string, theme: Theme): string {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${CSP}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  <style>
${THEMES[theme]}
  </style>
</head>
<body>
${bodyHtml}
</body>
</html>`;
}

export function convertMarkdown(markdown: string, title: string, theme: Theme): string {
  return buildHtml(md.parse(markdown, { async: false }) as string, title, theme);
}

export function resolveTheme(raw: unknown): Theme {
  if (raw === undefined || raw === null || raw === "") return "default";
  if (raw === "default" || raw === "technical" || raw === "elegant") return raw;
  throw new Error(
    `Invalid theme: ${JSON.stringify(raw)}. Use one of: default, technical, elegant.`
  );
}

// ---------------------------------------------------------------------------
// Path policy: only inside allowed directories (default: cwd), symlinks resolved
// ---------------------------------------------------------------------------

/** Allowed roots: MD2PDF_ALLOWED_DIRS (path-delimiter separated) or the current directory. */
export function getAllowedRoots(env: NodeJS.ProcessEnv = process.env): string[] {
  const raw = env.MD2PDF_ALLOWED_DIRS?.trim();
  const list = raw ? raw.split(path.delimiter).filter(Boolean) : [process.cwd()];
  return list.map((p) => path.resolve(p));
}

async function realpathOfNearestAncestor(abs: string): Promise<string> {
  let cur = abs;
  const rest: string[] = [];
  for (;;) {
    try {
      const real = await fs.realpath(cur);
      return path.join(real, ...rest.reverse());
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw e;
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** Resolve `p` (.. and symlinks included) and ensure it lies inside an allowed root. */
export async function resolveInsideRoots(
  p: string,
  kind: "input" | "output",
  roots: string[] = getAllowedRoots()
): Promise<string> {
  if (typeof p !== "string" || p.trim() === "" || p.includes("\0")) {
    throw new Error(`Invalid ${kind} path.`);
  }
  const real = await realpathOfNearestAncestor(path.resolve(p));
  for (const r of roots) {
    const realRoot = await realpathOfNearestAncestor(r);
    const rel = path.relative(realRoot, real);
    if (rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel))) return real;
  }
  throw new Error(
    `The ${kind} path is outside the allowed directories (${roots.join(", ")}). ` +
      `Use a path under the working directory, or set MD2PDF_ALLOWED_DIRS in the MCP server env.`
  );
}

export async function resolveOutputPath(p: string, roots?: string[]): Promise<string> {
  const ext = path.extname(String(p ?? "")).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") {
    throw new Error(`Output file must have .html or .htm extension, got: "${ext || "(none)"}".`);
  }
  const real = await resolveInsideRoots(p, "output", roots);
  // The resolved target (after symlinks) must keep the extension too.
  const rext = path.extname(real).toLowerCase();
  if (rext !== ".html" && rext !== ".htm") {
    throw new Error(`Output path resolves through a symlink to a non-HTML file: "${real}".`);
  }
  return real;
}

export async function resolveInputPath(p: string, roots?: string[]): Promise<string> {
  const ext = path.extname(String(p ?? "")).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown") {
    throw new Error(`Input file must have .md or .markdown extension, got: "${ext || "(none)"}".`);
  }
  const real = await resolveInsideRoots(p, "input", roots);
  const rext = path.extname(real).toLowerCase();
  if (rext !== ".md" && rext !== ".markdown") {
    throw new Error(`Input path resolves through a symlink to a non-Markdown file: "${real}".`);
  }
  return real;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function requireMarkdown(markdown: unknown): string {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error('"markdown" must be a non-empty string.');
  }
  return markdown;
}

export function handleMarkdownToHtml(markdown: unknown, title: string | undefined, theme: Theme): string {
  return convertMarkdown(requireMarkdown(markdown), title?.trim() || "Document", theme);
}

export async function handleSaveAsHtmlFile(
  markdown: unknown,
  outputPath: string,
  title: string | undefined,
  theme: Theme,
  roots?: string[]
): Promise<string> {
  const md_ = requireMarkdown(markdown);
  if (!outputPath) throw new Error('"output_path" is required.');
  const out = await resolveOutputPath(outputPath, roots);
  const resolvedTitle = title?.trim() || path.basename(out, path.extname(out));
  const html = convertMarkdown(md_, resolvedTitle, theme);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, html, "utf-8");
  return `HTML file saved: ${out}\nTheme: ${theme}\nTitle: ${resolvedTitle}\nSize: ${Buffer.byteLength(html)} bytes\n\nThis is HTML, not a PDF. Open it in Chrome/Edge and press Ctrl+P (Cmd+P) > "Save as PDF".`;
}

export async function handleConvertFile(
  inputPath: string,
  outputPath: string | undefined,
  title: string | undefined,
  theme: Theme,
  roots?: string[]
): Promise<string> {
  if (!inputPath) throw new Error('"input_path" is required.');
  const input = await resolveInputPath(inputPath, roots);
  let markdown: string;
  try {
    markdown = await fs.readFile(input, "utf-8");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    throw new Error(
      code === "ENOENT" ? `Input file not found: ${inputPath}` : `Cannot read input file (${code ?? "error"}): ${inputPath}`
    );
  }
  const requested =
    outputPath?.trim() ||
    path.join(path.dirname(input), path.basename(input, path.extname(input)) + ".html");
  const out = await resolveOutputPath(requested, roots);
  const html = convertMarkdown(markdown, title?.trim() || path.basename(input, path.extname(input)), theme);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, html, "utf-8");
  return `Converted.\nInput:  ${input}\nOutput: ${out}\nTheme:  ${theme}\nSize:   ${Buffer.byteLength(html)} bytes\n\nThis is HTML, not a PDF. Open it in Chrome/Edge and press Ctrl+P (Cmd+P) > "Save as PDF".`;
}
