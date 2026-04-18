#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { marked } from "marked";
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Theme = "default" | "technical" | "elegant";

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
    page-break-inside: avoid;
    margin-top: 1.4em;
    margin-bottom: 0.4em;
  }

  p, blockquote, pre, table, ul, ol {
    page-break-inside: avoid;
    orphans: 3;
    widows: 3;
  }

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
`;

const THEMES: Record<Theme, string> = {
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
    @page { background: #1e1e1e; }
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
// Markdown -> HTML conversion
// ---------------------------------------------------------------------------

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
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

function convertMarkdown(markdown: string, title: string, theme: Theme): string {
  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = marked.parse(markdown) as string;
  return buildHtml(bodyHtml, title, theme);
}

// ---------------------------------------------------------------------------
// Path validation
// ---------------------------------------------------------------------------

function validateOutputPath(filePath: string): void {
  // Block path traversal
  if (filePath.includes("..")) {
    throw new Error(
      `Path traversal ("..") is not permitted in output path: "${filePath}"`
    );
  }
  const ext = path.extname(filePath).toLowerCase();
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
  const ext = path.extname(filePath).toLowerCase();
  if (ext !== ".md" && ext !== ".markdown") {
    throw new Error(
      `Input file must have .md or .markdown extension, got: "${ext || "(none)"}"`
    );
  }
}

function resolveTheme(raw: unknown): Theme {
  const valid: Theme[] = ["default", "technical", "elegant"];
  if (typeof raw === "string" && valid.includes(raw as Theme)) {
    return raw as Theme;
  }
  return "default";
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

function handleMarkdownToHtml(
  markdown: string,
  title: string | undefined,
  theme: Theme
): string {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error('"markdown" must be a non-empty string.');
  }
  const resolvedTitle = title?.trim() || "Document";
  return convertMarkdown(markdown, resolvedTitle, theme);
}

async function handleSaveAsHtmlFile(
  markdown: string,
  outputPath: string,
  title: string | undefined,
  theme: Theme
): Promise<string> {
  if (typeof markdown !== "string" || markdown.trim() === "") {
    throw new Error('"markdown" must be a non-empty string.');
  }
  if (!outputPath) throw new Error('"output_path" is required.');

  validateOutputPath(outputPath);

  const resolvedTitle = title?.trim() || path.basename(outputPath, path.extname(outputPath));
  const html = convertMarkdown(markdown, resolvedTitle, theme);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, html, "utf-8");

  return `HTML file saved successfully: ${outputPath}\nTheme: ${theme}\nTitle: ${resolvedTitle}\nSize: ${html.length.toLocaleString()} bytes\n\nOpen in a browser and press Ctrl+P (or Cmd+P on Mac) to print as PDF.`;
}

async function handleConvertFile(
  inputPath: string,
  outputPath: string | undefined,
  theme: Theme
): Promise<string> {
  if (!inputPath) throw new Error('"input_path" is required.');

  validateInputPath(inputPath);

  const markdown = await fs.readFile(inputPath, "utf-8");

  const resolvedOutput =
    outputPath?.trim() ||
    path.join(
      path.dirname(inputPath),
      path.basename(inputPath, path.extname(inputPath)) + ".html"
    );

  if (resolvedOutput.includes("..")) {
    throw new Error(`Path traversal ("..") is not permitted in output path.`);
  }

  const ext = path.extname(resolvedOutput).toLowerCase();
  if (ext !== ".html" && ext !== ".htm") {
    throw new Error(
      `Output file must have .html or .htm extension, got: "${ext || "(none)"}"`
    );
  }

  const title = path.basename(inputPath, path.extname(inputPath));
  const html = convertMarkdown(markdown, title, theme);

  await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
  await fs.writeFile(resolvedOutput, html, "utf-8");

  return `Converted successfully.\nInput:  ${inputPath}\nOutput: ${resolvedOutput}\nTheme:  ${theme}\nSize:   ${html.length.toLocaleString()} bytes\n\nOpen in a browser and press Ctrl+P (or Cmd+P on Mac) to print as PDF.`;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "md2pdf-mcp",
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
      name: "markdown_to_html",
      description:
        "Convert a Markdown string to a print-optimized, self-contained HTML document. Open the result in a browser and press Ctrl+P to print as PDF. Three themes available: default, technical, elegant.",
      inputSchema: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description: "Markdown content to convert",
          },
          title: {
            type: "string",
            description: "HTML document title (optional, defaults to 'Document')",
          },
          theme: {
            type: "string",
            enum: ["default", "technical", "elegant"],
            description:
              "Visual theme: 'default' (clean white), 'technical' (dark code blocks), 'elegant' (serif, wide margins). Defaults to 'default'.",
          },
        },
        required: ["markdown"],
      },
    },
    {
      name: "save_as_html_file",
      description:
        "Convert Markdown to print-optimized HTML and save it to a file. The output path must end with .html or .htm.",
      inputSchema: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description: "Markdown content to convert",
          },
          output_path: {
            type: "string",
            description: "Absolute path to save the HTML file (must end with .html or .htm)",
          },
          title: {
            type: "string",
            description: "HTML document title (optional)",
          },
          theme: {
            type: "string",
            enum: ["default", "technical", "elegant"],
            description: "Visual theme (optional, defaults to 'default')",
          },
        },
        required: ["markdown", "output_path"],
      },
    },
    {
      name: "convert_file",
      description:
        "Read a .md or .markdown file from disk and convert it to a print-optimized HTML file. If output_path is omitted, saves alongside the input file with .html extension.",
      inputSchema: {
        type: "object",
        properties: {
          input_path: {
            type: "string",
            description: "Absolute path to the input .md or .markdown file",
          },
          output_path: {
            type: "string",
            description:
              "Absolute path to save the output HTML file (optional, defaults to same directory as input with .html extension)",
          },
          theme: {
            type: "string",
            enum: ["default", "technical", "elegant"],
            description: "Visual theme (optional, defaults to 'default')",
          },
        },
        required: ["input_path"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text: string;

    switch (name) {
      case "markdown_to_html": {
        const { markdown, title, theme } = args as {
          markdown: string;
          title?: string;
          theme?: string;
        };
        text = handleMarkdownToHtml(markdown, title, resolveTheme(theme));
        break;
      }
      case "save_as_html_file": {
        const { markdown, output_path, title, theme } = args as {
          markdown: string;
          output_path: string;
          title?: string;
          theme?: string;
        };
        if (!output_path) throw new Error('"output_path" is required.');
        text = await handleSaveAsHtmlFile(
          markdown,
          output_path,
          title,
          resolveTheme(theme)
        );
        break;
      }
      case "convert_file": {
        const { input_path, output_path, theme } = args as {
          input_path: string;
          output_path?: string;
          theme?: string;
        };
        if (!input_path) throw new Error('"input_path" is required.');
        text = await handleConvertFile(input_path, output_path, resolveTheme(theme));
        break;
      }
      default:
        throw new Error(`Unknown tool: "${name}"`);
    }

    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
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
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
