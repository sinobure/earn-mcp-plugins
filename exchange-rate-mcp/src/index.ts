#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ExchangeRateResponse {
  result: string;
  base_code: string;
  rates: Record<string, number>;
  time_last_update_unix: number;
}

interface CacheEntry {
  rates: Record<string, number>;
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "https://open.er-api.com/v6/latest";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Commonly supported currencies exposed via list_currencies */
const SUPPORTED_CURRENCIES: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  JPY: "Japanese Yen",
  GBP: "British Pound",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  CHF: "Swiss Franc",
  CNY: "Chinese Yuan",
  HKD: "Hong Kong Dollar",
  KRW: "South Korean Won",
  SGD: "Singapore Dollar",
  NOK: "Norwegian Krone",
  SEK: "Swedish Krona",
  DKK: "Danish Krone",
  NZD: "New Zealand Dollar",
};

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const rateCache = new Map<string, CacheEntry>();

function getCached(baseCurrency: string): Record<string, number> | null {
  const entry = rateCache.get(baseCurrency);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    rateCache.delete(baseCurrency);
    return null;
  }
  return entry.rates;
}

function setCache(baseCurrency: string, rates: Record<string, number>): void {
  rateCache.set(baseCurrency, { rates, fetchedAt: Date.now() });
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

async function fetchRates(baseCurrency: string): Promise<Record<string, number>> {
  const cached = getCached(baseCurrency);
  if (cached) return cached;

  const url = `${API_BASE}/${baseCurrency.toUpperCase()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Exchange rate API returned HTTP ${response.status} for base currency "${baseCurrency}".`
    );
  }

  const data = (await response.json()) as ExchangeRateResponse;

  if (data.result !== "success") {
    throw new Error(
      `Exchange rate API error for base currency "${baseCurrency}": result=${data.result}`
    );
  }

  setCache(baseCurrency, data.rates);
  return data.rates;
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

const ISO_4217 = /^[A-Z]{3}$/;

function validateCurrencyCode(code: string, label: string): string {
  const upper = code.toUpperCase();
  if (!ISO_4217.test(upper)) {
    throw new Error(
      `Invalid ${label} currency code: "${code}". Use a 3-letter ISO 4217 code (e.g. USD, JPY, EUR).`
    );
  }
  return upper;
}

async function handleGetExchangeRate(
  from: string,
  to: string
): Promise<string> {
  const fromUpper = validateCurrencyCode(from, "source");
  const toUpper = validateCurrencyCode(to, "target");

  const rates = await fetchRates(fromUpper);

  if (!(toUpper in rates)) {
    throw new Error(
      `Currency "${toUpper}" is not available. Use list_currencies to see supported currencies.`
    );
  }

  const rate = rates[toUpper];
  return `1 ${fromUpper} = ${rate} ${toUpper}`;
}

async function handleConvertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<string> {
  if (typeof amount !== "number" || !isFinite(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${amount}. Must be a non-negative finite number.`);
  }

  const fromUpper = validateCurrencyCode(from, "source");
  const toUpper = validateCurrencyCode(to, "target");

  const rates = await fetchRates(fromUpper);

  if (!(toUpper in rates)) {
    throw new Error(
      `Currency "${toUpper}" is not available. Use list_currencies to see supported currencies.`
    );
  }

  const rate = rates[toUpper];
  const converted = amount * rate;
  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  return `${amount} ${fromUpper} = ${formatted} ${toUpper} (rate: 1 ${fromUpper} = ${rate} ${toUpper})`;
}

function handleListCurrencies(): string {
  const lines = Object.entries(SUPPORTED_CURRENCIES).map(
    ([code, name]) => `  ${code}: ${name}`
  );
  return `Supported currencies (${lines.length} total):\n${lines.join("\n")}`;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "fx-rate-mcp",
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
      name: "get_exchange_rate",
      description:
        "Get the current exchange rate between two currencies. Results are cached for 5 minutes.",
      inputSchema: {
        type: "object",
        properties: {
          from: {
            type: "string",
            description: "Source currency code (e.g. USD, JPY, EUR)",
          },
          to: {
            type: "string",
            description: "Target currency code (e.g. USD, JPY, EUR)",
          },
        },
        required: ["from", "to"],
      },
    },
    {
      name: "convert_currency",
      description: "Convert an amount from one currency to another.",
      inputSchema: {
        type: "object",
        properties: {
          amount: {
            type: "number",
            description: "Amount to convert",
          },
          from: {
            type: "string",
            description: "Source currency code (e.g. USD, JPY, EUR)",
          },
          to: {
            type: "string",
            description: "Target currency code (e.g. USD, JPY, EUR)",
          },
        },
        required: ["amount", "from", "to"],
      },
    },
    {
      name: "list_currencies",
      description: "List commonly supported currency codes and their full names.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text: string;

    switch (name) {
      case "get_exchange_rate": {
        const { from, to } = args as { from: string; to: string };
        if (!from || !to) throw new Error('Both "from" and "to" are required.');
        text = await handleGetExchangeRate(from, to);
        break;
      }
      case "convert_currency": {
        const { amount, from, to } = args as {
          amount: number;
          from: string;
          to: string;
        };
        if (amount === undefined || !from || !to) {
          throw new Error('"amount", "from", and "to" are all required.');
        }
        text = await handleConvertCurrency(amount, from, to);
        break;
      }
      case "list_currencies": {
        text = handleListCurrencies();
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
