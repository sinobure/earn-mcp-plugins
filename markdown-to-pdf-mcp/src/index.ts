#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  handleConvertFile,
  handleMarkdownToHtml,
  handleSaveAsHtmlFile,
  resolveTheme,
  getAllowedRoots,
} from "./lib.js";

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
        "Convert a Markdown string to print-optimized (A4) HTML and return the HTML text. NOTE: this does NOT produce a PDF; open the HTML in a browser and use Ctrl+P > Save as PDF. Raw HTML in the Markdown is escaped. For large documents prefer save_as_html_file to avoid returning a huge string.",
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
        additionalProperties: false,
      },
    },
    {
      name: "save_as_html_file",
      description:
        "Convert Markdown to print-optimized (A4) HTML and save it to a file (not a PDF; print it from a browser). output_path must end with .html/.htm and lie inside the working directory or MD2PDF_ALLOWED_DIRS.",
      inputSchema: {
        type: "object",
        properties: {
          markdown: {
            type: "string",
            description: "Markdown content to convert",
          },
          output_path: {
            type: "string",
            description: "Path to save the HTML file (must end with .html or .htm, inside an allowed directory)",
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
        additionalProperties: false,
      },
    },
    {
      name: "convert_file",
      description:
        "Read a .md/.markdown file and convert it to a print-optimized (A4) HTML file (not a PDF; print it from a browser). Input and output must lie inside the working directory or MD2PDF_ALLOWED_DIRS. If output_path is omitted, saves next to the input with .html.",
      inputSchema: {
        type: "object",
        properties: {
          input_path: {
            type: "string",
            description: "Path to the input .md or .markdown file (inside an allowed directory)",
          },
          output_path: {
            type: "string",
            description:
              "Path to save the output HTML file (optional, defaults to same directory as input with .html extension)",
          },
          title: {
            type: "string",
            description: "HTML document title (optional, defaults to the input file name)",
          },
          theme: {
            type: "string",
            enum: ["default", "technical", "elegant"],
            description: "Visual theme (optional, defaults to 'default')",
          },
        },
        required: ["input_path"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args = {} } = request.params;

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
        const { input_path, output_path, title, theme } = args as {
          input_path: string;
          output_path?: string;
          title?: string;
          theme?: string;
        };
        if (!input_path) throw new Error('"input_path" is required.');
        text = await handleConvertFile(input_path, output_path, title, resolveTheme(theme));
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
