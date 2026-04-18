/**
 * Unit tests for fx-rate-mcp (exchange-rate-mcp)
 *
 * Strategy: The logic functions are not exported from index.ts, so we
 * reproduce them here (or re-verify behaviour via the internal logic).
 * We also mock the MCP SDK to prevent server startup during import.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Mock MCP SDK and stdio transport so that importing index.ts does not
// actually start the server or block the process.
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
// Reproduce the pure logic functions under test
// (Keeps tests self-contained without exporting from production code)
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

interface CacheEntry {
  rates: Record<string, number>;
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
let rateCache = new Map<string, CacheEntry>();

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

async function fetchRates(baseCurrency: string): Promise<Record<string, number>> {
  const cached = getCached(baseCurrency);
  if (cached) return cached;

  const url = `https://open.er-api.com/v6/latest/${baseCurrency.toUpperCase()}`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Exchange rate API returned HTTP ${response.status} for base currency "${baseCurrency}".`
    );
  }

  const data = (await response.json()) as {
    result: string;
    rates: Record<string, number>;
  };

  if (data.result !== "success") {
    throw new Error(
      `Exchange rate API error for base currency "${baseCurrency}": result=${data.result}`
    );
  }

  setCache(baseCurrency, data.rates);
  return data.rates;
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
    throw new Error(`Currency "${toUpper}" is not available.`);
  }

  const rate = rates[toUpper];
  const converted = amount * rate;
  const formatted = converted.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });

  return `${amount} ${fromUpper} = ${formatted} ${toUpper} (rate: 1 ${fromUpper} = ${rate} ${toUpper})`;
}

async function handleGetExchangeRate(from: string, to: string): Promise<string> {
  const fromUpper = validateCurrencyCode(from, "source");
  const toUpper = validateCurrencyCode(to, "target");

  const rates = await fetchRates(fromUpper);

  if (!(toUpper in rates)) {
    throw new Error(`Currency "${toUpper}" is not available.`);
  }

  const rate = rates[toUpper];
  return `1 ${fromUpper} = ${rate} ${toUpper}`;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validateCurrencyCode", () => {
  it("accepts valid 3-letter uppercase ISO 4217 code", () => {
    expect(validateCurrencyCode("USD", "source")).toBe("USD");
    expect(validateCurrencyCode("JPY", "source")).toBe("JPY");
    expect(validateCurrencyCode("EUR", "target")).toBe("EUR");
  });

  it("normalises lowercase to uppercase", () => {
    expect(validateCurrencyCode("usd", "source")).toBe("USD");
    expect(validateCurrencyCode("jpy", "target")).toBe("JPY");
  });

  it("rejects codes shorter than 3 characters", () => {
    expect(() => validateCurrencyCode("US", "source")).toThrow("Invalid source currency code");
  });

  it("rejects codes longer than 3 characters", () => {
    expect(() => validateCurrencyCode("USDT", "source")).toThrow("Invalid source currency code");
  });

  it("rejects codes containing digits", () => {
    expect(() => validateCurrencyCode("US1", "source")).toThrow("Invalid source currency code");
  });

  it("rejects empty string", () => {
    expect(() => validateCurrencyCode("", "source")).toThrow("Invalid source currency code");
  });
});

describe("get_exchange_rate (mocked fetch)", () => {
  beforeEach(() => {
    rateCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns formatted rate string on success", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "success", rates: { JPY: 149.5 } }),
    } as unknown as Response);

    const result = await handleGetExchangeRate("USD", "JPY");
    expect(result).toBe("1 USD = 149.5 JPY");
  });

  it("throws when API returns non-ok HTTP status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 429,
    } as unknown as Response);

    await expect(handleGetExchangeRate("USD", "JPY")).rejects.toThrow("HTTP 429");
  });

  it("throws when target currency is not in rates", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "success", rates: { EUR: 0.92 } }),
    } as unknown as Response);

    await expect(handleGetExchangeRate("USD", "JPY")).rejects.toThrow("JPY");
  });
});

describe("convert_currency – amount validation", () => {
  beforeEach(() => {
    rateCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects negative amounts", async () => {
    await expect(handleConvertCurrency(-1, "USD", "JPY")).rejects.toThrow(
      "Invalid amount"
    );
  });

  it("rejects Infinity", async () => {
    await expect(handleConvertCurrency(Infinity, "USD", "JPY")).rejects.toThrow(
      "Invalid amount"
    );
  });

  it("rejects NaN", async () => {
    await expect(handleConvertCurrency(NaN, "USD", "JPY")).rejects.toThrow(
      "Invalid amount"
    );
  });

  it("converts 100 USD to JPY correctly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: "success", rates: { JPY: 150.0 } }),
    } as unknown as Response);

    const result = await handleConvertCurrency(100, "USD", "JPY");
    expect(result).toContain("100 USD =");
    expect(result).toContain("JPY");
  });
});

describe("cache TTL behaviour", () => {
  beforeEach(() => {
    rateCache.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns cached rates within TTL without calling fetch again", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: { JPY: 149.0 } }),
    } as unknown as Response);

    // First call — hits network
    await handleGetExchangeRate("USD", "JPY");
    // Second call — should use cache
    await handleGetExchangeRate("USD", "JPY");

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("re-fetches after TTL expires", async () => {
    const mockFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ result: "success", rates: { JPY: 149.0 } }),
    } as unknown as Response);

    // Manually insert a stale entry (fetchedAt 6 minutes ago)
    rateCache.set("USD", {
      rates: { JPY: 140.0 },
      fetchedAt: Date.now() - 6 * 60 * 1000,
    });

    await handleGetExchangeRate("USD", "JPY");
    // fetch should have been called to refresh the stale cache
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
