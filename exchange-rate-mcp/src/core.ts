export interface RateTable {
  rates: Record<string, number>;
  /** Unix seconds of the provider's last update (0 if unknown). */
  updatedAt: number;
}

interface CacheEntry extends RateTable {
  fetchedAt: number;
}

export const API_BASE = "https://open.er-api.com/v6/latest";
export const CACHE_TTL_MS = 5 * 60 * 1000;
export const CACHE_MAX_ENTRIES = 50;
export const FETCH_TIMEOUT_MS = 10_000;

const ISO_4217 = /^[A-Z]{3}$/;
const rateCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<RateTable>>();

export function clearCache(): void {
  rateCache.clear();
  inflight.clear();
}

export function validateCurrencyCode(code: string, label: string): string {
  const upper = String(code).trim().toUpperCase();
  if (!ISO_4217.test(upper)) {
    throw new Error(
      `Invalid ${label} currency code: "${code}". Use a 3-letter ISO 4217 code (e.g. USD, JPY, EUR).`
    );
  }
  return upper;
}

function getCached(base: string): RateTable | null {
  const entry = rateCache.get(base);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    rateCache.delete(base);
    return null;
  }
  return entry;
}

function setCache(base: string, table: RateTable): void {
  if (rateCache.size >= CACHE_MAX_ENTRIES) {
    const oldest = rateCache.keys().next().value;
    if (oldest !== undefined) rateCache.delete(oldest);
  }
  rateCache.set(base, { ...table, fetchedAt: Date.now() });
}

async function requestRates(base: string): Promise<RateTable> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/${base}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new Error(
      timedOut
        ? `Exchange rate API did not respond within ${FETCH_TIMEOUT_MS / 1000}s. Try again later.`
        : `Could not reach the exchange rate API: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (response.status === 429) {
    throw new Error(
      "Exchange rate API rate limit reached (free plan: about 1,500 requests/month). Retry later; results for recently used currencies are cached for 5 minutes."
    );
  }
  if (!response.ok) {
    throw new Error(`Exchange rate API returned HTTP ${response.status} for base currency "${base}".`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    throw new Error("Exchange rate API returned a response that is not valid JSON.");
  }
  const d = data as {
    result?: string;
    "error-type"?: string;
    rates?: Record<string, number>;
    time_last_update_unix?: number;
  } | null;

  if (!d || d.result !== "success") {
    if (d?.["error-type"] === "unsupported-code") {
      throw new Error(`Base currency "${base}" is not supported. Use list_currencies to see supported currencies.`);
    }
    throw new Error(
      `Exchange rate API error for base currency "${base}"${d?.["error-type"] ? ` (${d["error-type"]})` : ""}. The currency code may not be supported; use list_currencies to see supported currencies.`
    );
  }
  if (!d.rates || typeof d.rates !== "object") {
    throw new Error("Exchange rate API response did not contain any rates.");
  }
  return { rates: d.rates, updatedAt: typeof d.time_last_update_unix === "number" ? d.time_last_update_unix : 0 };
}

export async function fetchRates(base: string): Promise<RateTable> {
  const cached = getCached(base);
  if (cached) return cached;
  const pending = inflight.get(base);
  if (pending) return pending;
  const p = requestRates(base)
    .then((t) => {
      setCache(base, t);
      return t;
    })
    .finally(() => inflight.delete(base));
  inflight.set(base, p);
  return p;
}

async function lookup(from: string, to: string) {
  const fromUpper = validateCurrencyCode(from, "source");
  const toUpper = validateCurrencyCode(to, "target");
  const table = await fetchRates(fromUpper);
  const rate = table.rates[toUpper];
  if (typeof rate !== "number") {
    throw new Error(`Currency "${toUpper}" is not available. Use list_currencies to see supported currencies.`);
  }
  return { fromUpper, toUpper, rate, updatedAt: table.updatedAt };
}

function iso(updatedAt: number): string | null {
  return updatedAt > 0 ? new Date(updatedAt * 1000).toISOString() : null;
}

function updatedLine(updatedAt: number): string {
  return updatedAt > 0
    ? `Data updated: ${iso(updatedAt)} (provider updates about once a day; reference values only)`
    : "Data update time unknown (reference values only)";
}

export function fractionDigits(currency: string): { min: number; max: number } {
  try {
    const o = new Intl.NumberFormat("en-US", { style: "currency", currency }).resolvedOptions();
    const min = o.minimumFractionDigits ?? 2;
    return { min, max: Math.max(min, 4) };
  } catch {
    return { min: 2, max: 4 };
  }
}

export async function getExchangeRate(from: string, to: string) {
  const r = await lookup(from, to);
  return {
    text: `1 ${r.fromUpper} = ${r.rate} ${r.toUpper}\n${updatedLine(r.updatedAt)}`,
    data: { from: r.fromUpper, to: r.toUpper, rate: r.rate, updatedAt: iso(r.updatedAt) },
  };
}

export async function convertCurrency(amount: number, from: string, to: string) {
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid amount: ${JSON.stringify(amount)}. Must be a non-negative finite number.`);
  }
  const r = await lookup(from, to);
  const result = amount * r.rate;
  const d = fractionDigits(r.toUpper);
  const formatted = result.toLocaleString("en-US", { minimumFractionDigits: d.min, maximumFractionDigits: d.max });
  return {
    text: `${amount} ${r.fromUpper} = ${formatted} ${r.toUpper} (rate: 1 ${r.fromUpper} = ${r.rate} ${r.toUpper})\n${updatedLine(r.updatedAt)}`,
    data: { amount, from: r.fromUpper, to: r.toUpper, rate: r.rate, result, updatedAt: iso(r.updatedAt) },
  };
}

let displayNames: Intl.DisplayNames | null | undefined;
function currencyName(code: string): string {
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "currency" });
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(code) ?? code;
  } catch {
    return code;
  }
}

export async function listCurrencies(base = "USD") {
  const table = await fetchRates(validateCurrencyCode(base, "base"));
  const codes = Object.keys(table.rates).sort();
  const lines = codes.map((c) => `  ${c}: ${currencyName(c)}`);
  return {
    text: `Supported currencies (${codes.length} total):\n${lines.join("\n")}\n${updatedLine(table.updatedAt)}`,
    data: { count: codes.length, currencies: codes.map((c) => ({ code: c, name: currencyName(c) })), updatedAt: iso(table.updatedAt) },
  };
}
