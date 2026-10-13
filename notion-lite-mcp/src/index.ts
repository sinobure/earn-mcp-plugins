#!/usr/bin/env node

import { Client } from "@notionhq/client";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const token = process.env["NOTION_API_KEY"]?.trim();

if (!token) {
  // Do not exit: the server stays up so the client can show a clear message
  // when a tool is called (stderr is also visible in client logs).
  process.stderr.write(
    "Warning: NOTION_API_KEY is not set. Tools will return setup instructions.\n"
  );
}

const server = createServer(token ? new Client({ auth: token }) : null);

server.connect(new StdioServerTransport()).catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
