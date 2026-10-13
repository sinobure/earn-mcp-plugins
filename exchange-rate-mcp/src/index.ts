#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { convertCurrency, getExchangeRate, listCurrencies } from "./core.js";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string };

const server = new McpServer({ name: "fx-rate-mcp", version: pkg.version });

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
const code = (label: string) =>
  z.string().trim().length(3).describe(`${label} currency code, 3-letter ISO 4217 (case-insensitive), e.g. USD, JPY, EUR`);

type Result = { text: string; data: Record<string, unknown> };

async function run(fn: () => Promise<Result>) {
  try {
    const r = await fn();
    return { content: [{ type: "text" as const, text: r.text }], structuredContent: r.data };
  } catch (err) {
    return {
      content: [{ type: "text" as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
      isError: true,
    };
  }
}

server.registerTool(
  "get_exchange_rate",
  {
    title: "Get exchange rate",
    description:
      "Get the current exchange rate for 1 unit of `from` expressed in `to` (open.er-api.com; no API key). Data refreshes about once a day at the provider and is cached locally for 5 minutes; the response includes the provider's update time. Reference values only, not for trading.",
    inputSchema: { from: code("Source"), to: code("Target") },
    annotations,
  },
  ({ from, to }) => run(() => getExchangeRate(from, to))
);

server.registerTool(
  "convert_currency",
  {
    title: "Convert currency",
    description:
      "Convert a non-negative amount from one currency to another using the latest cached daily rate (open.er-api.com). Output uses the target currency's standard decimal places and includes the rate and data update time. Reference values only, not for trading.",
    inputSchema: {
      amount: z.number().finite().min(0).describe("Amount to convert in the source currency (non-negative number)"),
      from: code("Source"),
      to: code("Target"),
    },
    annotations,
  },
  ({ amount, from, to }) => run(() => convertCurrency(amount, from, to))
);

server.registerTool(
  "list_currencies",
  {
    title: "List currencies",
    description:
      "List every currency code the rate provider supports (about 160) with its English name. Use it to check which codes are valid for get_exchange_rate and convert_currency.",
    inputSchema: {},
    annotations,
  },
  () => run(() => listCurrencies())
);

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
