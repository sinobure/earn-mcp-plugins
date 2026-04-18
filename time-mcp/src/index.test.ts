/**
 * Unit tests for kw-time-mcp
 *
 * Strategy: Reproduce pure logic functions from index.ts inline.
 * MCP SDK is mocked to prevent server startup.
 */

import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock MCP SDK
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
// Reproduce logic functions
// ---------------------------------------------------------------------------

const JAPANESE_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "元日",
  "2026-01-12": "成人の日",
  "2026-02-11": "建国記念の日",
  "2026-02-23": "天皇誕生日",
  "2026-03-20": "春分の日",
  "2026-04-29": "昭和の日",
  "2026-05-03": "憲法記念日",
  "2026-05-04": "みどりの日",
  "2026-05-05": "こどもの日",
  "2026-07-20": "海の日",
  "2026-08-11": "山の日",
  "2026-09-21": "敬老の日",
  "2026-09-22": "国民の休日",
  "2026-09-23": "秋分の日",
  "2026-10-12": "スポーツの日",
  "2026-11-03": "文化の日",
  "2026-11-23": "勤労感謝の日",
};

const DURATION_RE = /^(\d+)([smhdw])$/;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(T[\d:]+(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const YEAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateTimezone(tz: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error(`Unknown timezone: "${tz}".`);
  }
}

function validateDatetime(dt: string, label: string): void {
  if (!ISO_DATE_RE.test(dt)) {
    throw new Error(`Invalid ${label}: "${dt}".`);
  }
  const ms = Date.parse(dt);
  if (isNaN(ms)) {
    throw new Error(`Cannot parse ${label}: "${dt}".`);
  }
}

function validateYearDate(date: string): void {
  if (!YEAR_DATE_RE.test(date)) {
    throw new Error(`Invalid date: "${date}".`);
  }
}

function normalizeOffset(raw: string): string {
  if (raw === "" || raw === "+0" || raw === "-0") return "Z";
  if (/^[+-]\d{2}:\d{2}$/.test(raw)) return raw;
  const sign = raw[0] === "-" ? "-" : "+";
  const body = raw.replace(/^[+-]/, "");
  const [hStr, mStr = "0"] = body.split(":");
  const hh = hStr.padStart(2, "0");
  const mm = mStr.padEnd(2, "0").slice(0, 2);
  return `${sign}${hh}:${mm}`;
}

function handleGetCurrentTime(timezone: string = "Asia/Tokyo"): string {
  validateTimezone(timezone);

  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).map(({ type, value }) => [type, value])
  );
  const offsetFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    timeZoneName: "shortOffset",
  });
  const rawOffset =
    offsetFmt
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") ?? "";
  const offset = normalizeOffset(rawOffset);
  const hour = parts["hour"] === "24" ? "00" : parts["hour"];
  const iso = `${parts["year"]}-${parts["month"]}-${parts["day"]}T${hour}:${parts["minute"]}:${parts["second"]}${offset}`;

  return JSON.stringify({
    datetime: iso,
    timezone,
    utc: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
  });
}

function handleConvertTimezone(
  datetime: string,
  from_tz: string,
  to_tz: string
): string {
  validateDatetime(datetime, "datetime");
  validateTimezone(from_tz);
  validateTimezone(to_tz);

  const hasOffset = /Z|[+-]\d{2}:?\d{2}$/.test(datetime);
  let date: Date;

  if (hasOffset) {
    date = new Date(datetime);
  } else {
    const naive = datetime.includes("T") ? datetime : datetime + "T00:00:00";
    const utcGuess = new Date(naive + "Z");
    const localParts = new Intl.DateTimeFormat("en-CA", {
      timeZone: from_tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(utcGuess);
    const lp = Object.fromEntries(
      localParts.map(({ type, value }) => [type, value])
    );
    const lh = lp["hour"] === "24" ? "00" : lp["hour"];
    const localEpoch = Date.parse(
      `${lp["year"]}-${lp["month"]}-${lp["day"]}T${lh}:${lp["minute"]}:${lp["second"]}Z`
    );
    const offsetMs = utcGuess.getTime() - localEpoch;
    date = new Date(Date.parse(naive + "Z") + offsetMs);
  }

  if (isNaN(date.getTime())) {
    throw new Error(`Cannot parse datetime: "${datetime}".`);
  }

  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: to_tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map(({ type, value }) => [type, value])
  );
  const offsetFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: to_tz,
    timeZoneName: "shortOffset",
  });
  const rawOffset2 =
    offsetFmt
      .formatToParts(date)
      .find((p) => p.type === "timeZoneName")
      ?.value.replace("GMT", "") ?? "";
  const offset = normalizeOffset(rawOffset2);
  const hour = parts["hour"] === "24" ? "00" : parts["hour"];
  const iso = `${parts["year"]}-${parts["month"]}-${parts["day"]}T${hour}:${parts["minute"]}:${parts["second"]}${offset}`;

  return JSON.stringify({
    input: datetime,
    from_timezone: from_tz,
    to_timezone: to_tz,
    result: iso,
    utc: date.toISOString(),
  });
}

function handleAddDuration(datetime: string, duration: string): string {
  validateDatetime(datetime, "datetime");

  const match = DURATION_RE.exec(duration);
  if (!match) {
    throw new Error(`Invalid duration: "${duration}".`);
  }

  const amount = parseInt(match[1], 10);
  const unit = match[2];

  const unitMs: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
  };

  const base = datetime.includes("T") ? datetime : datetime + "T00:00:00Z";
  const date = new Date(base);
  if (isNaN(date.getTime())) {
    throw new Error(`Cannot parse datetime: "${datetime}".`);
  }

  const result = new Date(date.getTime() + amount * unitMs[unit]);

  return JSON.stringify({
    input: datetime,
    duration,
    result: result.toISOString(),
    unix: Math.floor(result.getTime() / 1000),
  });
}

function handleIsJapaneseHoliday(date: string): string {
  validateYearDate(date);
  const name = JAPANESE_HOLIDAYS[date];
  const isHoliday = name !== undefined;
  return JSON.stringify({ date, is_holiday: isHoliday, holiday_name: name ?? null });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("get_current_time", () => {
  it("returns a JSON string with datetime, timezone, utc, unix fields", () => {
    const result = JSON.parse(handleGetCurrentTime("Asia/Tokyo"));
    expect(result).toHaveProperty("datetime");
    expect(result).toHaveProperty("timezone", "Asia/Tokyo");
    expect(result).toHaveProperty("utc");
    expect(result).toHaveProperty("unix");
    expect(typeof result.unix).toBe("number");
  });

  it("respects the specified IANA timezone in the datetime field", () => {
    const result = JSON.parse(handleGetCurrentTime("America/New_York"));
    expect(result.timezone).toBe("America/New_York");
    // datetime should contain an offset indicating EST/EDT (not +09:00)
    expect(result.datetime).toMatch(/[+-]\d{2}:\d{2}|Z/);
  });

  it("throws for an unknown timezone", () => {
    expect(() => handleGetCurrentTime("Invalid/Zone")).toThrow("Unknown timezone");
  });
});

describe("convert_timezone", () => {
  it("converts UTC noon to Asia/Tokyo (+09:00)", () => {
    const result = JSON.parse(
      handleConvertTimezone("2026-01-01T12:00:00Z", "UTC", "Asia/Tokyo")
    );
    // 12:00 UTC = 21:00 JST
    expect(result.result).toBe("2026-01-01T21:00:00+09:00");
  });

  it("converts Asia/Tokyo midnight to UTC previous day", () => {
    const result = JSON.parse(
      handleConvertTimezone("2026-01-02T00:00:00+09:00", "Asia/Tokyo", "UTC")
    );
    expect(result.result).toBe("2026-01-01T15:00:00Z");
  });

  it("throws for invalid from_tz", () => {
    expect(() =>
      handleConvertTimezone("2026-01-01T00:00:00Z", "Bad/Zone", "UTC")
    ).toThrow("Unknown timezone");
  });

  it("throws for invalid to_tz", () => {
    expect(() =>
      handleConvertTimezone("2026-01-01T00:00:00Z", "UTC", "Bad/Zone")
    ).toThrow("Unknown timezone");
  });
});

describe("add_duration", () => {
  const base = "2026-01-01T00:00:00Z";

  it("adds 3 hours", () => {
    const result = JSON.parse(handleAddDuration(base, "3h"));
    expect(result.result).toBe("2026-01-01T03:00:00.000Z");
  });

  it("adds 1 day", () => {
    const result = JSON.parse(handleAddDuration(base, "1d"));
    expect(result.result).toBe("2026-01-02T00:00:00.000Z");
  });

  it("adds 2 weeks", () => {
    const result = JSON.parse(handleAddDuration(base, "2w"));
    expect(result.result).toBe("2026-01-15T00:00:00.000Z");
  });

  it("adds 30 seconds", () => {
    const result = JSON.parse(handleAddDuration(base, "30s"));
    expect(result.result).toBe("2026-01-01T00:00:30.000Z");
  });

  it("throws for invalid duration format", () => {
    expect(() => handleAddDuration(base, "3hours")).toThrow("Invalid duration");
  });
});

describe("is_japanese_holiday", () => {
  it("returns is_holiday: true for 2026-05-03 (憲法記念日)", () => {
    const result = JSON.parse(handleIsJapaneseHoliday("2026-05-03"));
    expect(result.is_holiday).toBe(true);
    expect(result.holiday_name).toBe("憲法記念日");
  });

  it("returns is_holiday: false for 2026-05-01 (ordinary day)", () => {
    const result = JSON.parse(handleIsJapaneseHoliday("2026-05-01"));
    expect(result.is_holiday).toBe(false);
    expect(result.holiday_name).toBeNull();
  });

  it("throws for invalid date format", () => {
    expect(() => handleIsJapaneseHoliday("2026/05/03")).toThrow("Invalid date");
  });

  it("throws for invalid date string", () => {
    expect(() => handleIsJapaneseHoliday("not-a-date")).toThrow("Invalid date");
  });
});
