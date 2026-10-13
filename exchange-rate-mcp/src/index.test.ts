import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  CACHE_TTL_MS,
  clearCache,
  convertCurrency,
  fractionDigits,
  getExchangeRate,
  listCurrencies,
  validateCurrencyCode,
} from "./core.js";

const ok = (rates: Record<string, number>, extra: object = {}) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ result: "success", rates, time_last_update_unix: 1_700_000_000, ...extra }),
  }) as unknown as Response;
const status = (s: number) => ({ ok: false, status: s, json: async () => ({}) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  clearCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("validateCurrencyCode", () => {
  it("normalises and accepts valid codes", () => expect(validateCurrencyCode(" jpy ", "x")).toBe("JPY"));
  it.each(["US", "USDD", "U1D", ""])("rejects %j", (c) =>
    expect(() => validateCurrencyCode(c, "source")).toThrow(/Invalid source/)
  );
});

describe("getExchangeRate", () => {
  it("returns rate with update time and structured data", async () => {
    fetchMock.mockResolvedValue(ok({ JPY: 150.5 }));
    const r = await getExchangeRate("usd", "jpy");
    expect(r.text).toContain("1 USD = 150.5 JPY");
    expect(r.text).toContain("2023-11-14T22:13:20.000Z");
    expect(r.data).toMatchObject({ from: "USD", to: "JPY", rate: 150.5 });
    expect(fetchMock.mock.calls[0][0]).toBe("https://open.er-api.com/v6/latest/USD");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it("errors on unavailable target", async () => {
    fetchMock.mockResolvedValue(ok({ JPY: 1 }));
    await expect(getExchangeRate("USD", "ZZZ")).rejects.toThrow(/not available/);
  });
  it("gives a dedicated 429 message", async () => {
    fetchMock.mockResolvedValue(status(429));
    await expect(getExchangeRate("USD", "JPY")).rejects.toThrow(/rate limit.*1,500/);
  });
  it("reports other HTTP errors", async () => {
    fetchMock.mockResolvedValue(status(500));
    await expect(getExchangeRate("USD", "JPY")).rejects.toThrow(/HTTP 500/);
  });
  it("translates unsupported-code", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: "error", "error-type": "unsupported-code" }),
    });
    await expect(getExchangeRate("XXX", "JPY")).rejects.toThrow(/"XXX" is not supported/);
  });
  it("guards invalid JSON and missing rates", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("x");
      },
    });
    await expect(getExchangeRate("USD", "JPY")).rejects.toThrow(/not valid JSON/);
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ result: "success" }) });
    await expect(getExchangeRate("USD", "JPY")).rejects.toThrow(/did not contain any rates/);
  });
  it("maps timeout and network failures", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("t"), { name: "TimeoutError" }));
    await expect(getExchangeRate("USD", "JPY")).rejects.toThrow(/did not respond/);
    fetchMock.mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(getExchangeRate("USD", "JPY")).rejects.toThrow(/Could not reach.*ENOTFOUND/);
  });
});

describe("convertCurrency", () => {
  it.each([-1, Infinity, NaN, "5" as unknown as number])("rejects amount %j", async (a) => {
    await expect(convertCurrency(a, "USD", "JPY")).rejects.toThrow(/Invalid amount/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("uses target currency decimals (JPY 0, USD 2)", async () => {
    fetchMock.mockResolvedValue(ok({ JPY: 150.5, EUR: 0.9 }));
    expect((await convertCurrency(100, "USD", "JPY")).text).toContain("= 15,050 JPY");
    expect((await convertCurrency(100, "USD", "EUR")).text).toContain("= 90.00 EUR");
  });
  it("fractionDigits per currency", () => {
    expect(fractionDigits("JPY").min).toBe(0);
    expect(fractionDigits("KWD").min).toBe(3);
  });
});

describe("cache", () => {
  it("caches within TTL, refetches after, and dedupes concurrent calls", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(ok({ JPY: 1 }));
    await Promise.all([getExchangeRate("USD", "JPY"), getExchangeRate("USD", "JPY")]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await getExchangeRate("USD", "JPY");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(CACHE_TTL_MS + 1);
    await getExchangeRate("USD", "JPY");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("listCurrencies", () => {
  it("lists all rate keys sorted with names", async () => {
    fetchMock.mockResolvedValue(ok({ USD: 1, JPY: 150, EUR: 0.9 }));
    const r = await listCurrencies();
    expect(r.data.count).toBe(3);
    expect(r.text).toContain("Supported currencies (3 total)");
    expect(r.text).toMatch(/EUR: Euro\n\s+JPY: Japanese Yen\n\s+USD: US Dollar/);
  });
});
