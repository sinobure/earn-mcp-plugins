#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// ---------------------------------------------------------------------------
// Japanese holiday data (2024-2028, hardcoded for offline / privacy)
// Source: Cabinet Office of Japan https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
// Includes substitute holidays (振替休日) where applicable.
// ---------------------------------------------------------------------------

const JAPANESE_HOLIDAYS: Record<string, string> = {
  // 2024
  "2024-01-01": "元日",
  "2024-01-08": "成人の日",
  "2024-02-11": "建国記念の日",
  "2024-02-12": "建国記念の日 振替休日",
  "2024-02-23": "天皇誕生日",
  "2024-03-20": "春分の日",
  "2024-04-29": "昭和の日",
  "2024-05-03": "憲法記念日",
  "2024-05-04": "みどりの日",
  "2024-05-05": "こどもの日",
  "2024-05-06": "こどもの日 振替休日",
  "2024-07-15": "海の日",
  "2024-08-11": "山の日",
  "2024-08-12": "山の日 振替休日",
  "2024-09-16": "敬老の日",
  "2024-09-22": "秋分の日",
  "2024-09-23": "秋分の日 振替休日",
  "2024-10-14": "スポーツの日",
  "2024-11-03": "文化の日",
  "2024-11-04": "文化の日 振替休日",
  "2024-11-23": "勤労感謝の日",

  // 2025
  "2025-01-01": "元日",
  "2025-01-13": "成人の日",
  "2025-02-11": "建国記念の日",
  "2025-02-23": "天皇誕生日",
  "2025-02-24": "天皇誕生日 振替休日",
  "2025-03-20": "春分の日",
  "2025-04-29": "昭和の日",
  "2025-05-03": "憲法記念日",
  "2025-05-04": "みどりの日",
  "2025-05-05": "こどもの日",
  "2025-05-06": "こどもの日 振替休日",
  "2025-07-21": "海の日",
  "2025-08-11": "山の日",
  "2025-09-15": "敬老の日",
  "2025-09-23": "秋分の日",
  "2025-10-13": "スポーツの日",
  "2025-11-03": "文化の日",
  "2025-11-23": "勤労感謝の日",
  "2025-11-24": "勤労感謝の日 振替休日",

  // 2026
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

  // 2027
  "2027-01-01": "元日",
  "2027-01-11": "成人の日",
  "2027-02-11": "建国記念の日",
  "2027-02-23": "天皇誕生日",
  "2027-03-21": "春分の日",
  "2027-03-22": "春分の日 振替休日",
  "2027-04-29": "昭和の日",
  "2027-05-03": "憲法記念日",
  "2027-05-04": "みどりの日",
  "2027-05-05": "こどもの日",
  "2027-07-19": "海の日",
  "2027-08-11": "山の日",
  "2027-09-20": "敬老の日",
  "2027-09-23": "秋分の日",
  "2027-10-11": "スポーツの日",
  "2027-11-03": "文化の日",
  "2027-11-23": "勤労感謝の日",

  // 2028
  "2028-01-01": "元日",
  "2028-01-10": "成人の日",
  "2028-02-11": "建国記念の日",
  "2028-02-23": "天皇誕生日",
  "2028-03-20": "春分の日",
  "2028-04-29": "昭和の日",
  "2028-05-03": "憲法記念日",
  "2028-05-04": "みどりの日",
  "2028-05-05": "こどもの日",
  "2028-07-17": "海の日",
  "2028-08-11": "山の日",
  "2028-09-18": "敬老の日",
  "2028-09-22": "秋分の日",
  "2028-10-09": "スポーツの日",
  "2028-11-03": "文化の日",
  "2028-11-23": "勤労感謝の日",
};

// ---------------------------------------------------------------------------
// Timezone offset normalization
// ---------------------------------------------------------------------------

/**
 * Normalises a raw offset string returned by Intl (e.g. "+9", "-5:30", "")
 * into the ±HH:MM format expected by ISO 8601, or returns "Z" for UTC.
 */
function normalizeOffset(raw: string): string {
  if (raw === "" || raw === "+0" || raw === "-0") return "Z";

  // Already well-formed (e.g. "+05:30")
  if (/^[+-]\d{2}:\d{2}$/.test(raw)) return raw;

  const sign = raw[0] === "-" ? "-" : "+";
  const body = raw.replace(/^[+-]/, "");
  const [hStr, mStr = "0"] = body.split(":");
  const hh = hStr.padStart(2, "0");
  const mm = mStr.padEnd(2, "0").slice(0, 2);
  return `${sign}${hh}:${mm}`;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const DURATION_RE = /^(\d+)([smhdw])$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T[\d:]+(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const YEAR_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateTimezone(tz: string): void {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error(
      `Unknown timezone: "${tz}". Use an IANA timezone name such as "Asia/Tokyo" or "America/New_York".`
    );
  }
}

function validateDatetime(dt: string, label: string): void {
  if (!ISO_DATE_RE.test(dt)) {
    throw new Error(
      `Invalid ${label}: "${dt}". Expected ISO 8601 format (e.g. "2024-01-01T00:00:00Z" or "2024-01-01").`
    );
  }
  const ms = Date.parse(dt);
  if (isNaN(ms)) {
    throw new Error(`Cannot parse ${label}: "${dt}".`);
  }
}

function validateYearDate(date: string): void {
  if (!YEAR_DATE_RE.test(date)) {
    throw new Error(
      `Invalid date: "${date}". Expected YYYY-MM-DD format (e.g. "2026-05-03").`
    );
  }
}

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

/**
 * Returns the current time in the given IANA timezone as ISO 8601.
 */
function handleGetCurrentTime(timezone: string = "Asia/Tokyo"): string {
  validateTimezone(timezone);

  const now = new Date();

  // Build a locale string from parts to reconstruct an ISO-like string
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

  // Offset string
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

/**
 * Converts a datetime string from one timezone to another.
 */
function handleConvertTimezone(
  datetime: string,
  from_tz: string,
  to_tz: string
): string {
  validateDatetime(datetime, "datetime");
  validateTimezone(from_tz);
  validateTimezone(to_tz);

  // Parse input — if no timezone designator, treat as `from_tz` local time
  let date: Date;
  const hasOffset = /Z|[+-]\d{2}:?\d{2}$/.test(datetime);

  if (hasOffset) {
    date = new Date(datetime);
  } else {
    // Interpret the naive datetime as belonging to from_tz
    // We do this by asking Intl what the UTC offset is for from_tz at that moment
    const naive = datetime.includes("T") ? datetime : datetime + "T00:00:00";
    // First pass: parse as UTC to get a reference epoch
    const utcGuess = new Date(naive + "Z");
    // Compute offset of from_tz at that epoch
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
    const lp = Object.fromEntries(localParts.map(({ type, value }) => [type, value]));
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

  // Format in target timezone
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

/**
 * Adds a duration string (e.g. "3h", "1d", "2w") to a datetime.
 */
function handleAddDuration(datetime: string, duration: string): string {
  validateDatetime(datetime, "datetime");

  const match = DURATION_RE.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration: "${duration}". Use format like "30s", "15m", "3h", "1d", "2w" (s=seconds, m=minutes, h=hours, d=days, w=weeks).`
    );
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

/**
 * Checks whether a date (YYYY-MM-DD) is a Japanese public holiday.
 */
function handleIsJapaneseHoliday(date: string): string {
  validateYearDate(date);

  const name = JAPANESE_HOLIDAYS[date];
  const isHoliday = name !== undefined;

  return JSON.stringify({
    date,
    is_holiday: isHoliday,
    holiday_name: name ?? null,
  });
}

/**
 * Lists all Japanese public holidays in a given year.
 */
function handleListJapaneseHolidays(year: number): string {
  if (!Number.isInteger(year) || year < 2024 || year > 2028) {
    throw new Error(
      `Year out of range: ${year}. Supported range is 2024–2028.`
    );
  }

  const prefix = `${year}-`;
  const holidays = Object.entries(JAPANESE_HOLIDAYS)
    .filter(([date]) => date.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, name]) => ({ date, name }));

  return JSON.stringify({
    year,
    count: holidays.length,
    holidays,
  });
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "kw-time-mcp",
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
      name: "get_current_time",
      description:
        "Returns the current date and time in the specified IANA timezone. Defaults to Asia/Tokyo (JST).",
      inputSchema: {
        type: "object",
        properties: {
          timezone: {
            type: "string",
            description:
              'IANA timezone name (e.g. "Asia/Tokyo", "America/New_York", "Europe/London"). Defaults to "Asia/Tokyo".',
          },
        },
        required: [],
      },
    },
    {
      name: "convert_timezone",
      description:
        "Converts a datetime string from one IANA timezone to another. If no UTC offset is present in the input, it is interpreted as a naive local time in from_tz.",
      inputSchema: {
        type: "object",
        properties: {
          datetime: {
            type: "string",
            description:
              'ISO 8601 datetime string (e.g. "2024-01-01T09:00:00" or "2024-01-01T00:00:00Z").',
          },
          from_tz: {
            type: "string",
            description: 'Source IANA timezone (e.g. "Asia/Tokyo").',
          },
          to_tz: {
            type: "string",
            description: 'Target IANA timezone (e.g. "America/New_York").',
          },
        },
        required: ["datetime", "from_tz", "to_tz"],
      },
    },
    {
      name: "add_duration",
      description:
        'Adds a duration to a datetime string. Duration format: a positive integer followed by a unit: s (seconds), m (minutes), h (hours), d (days), w (weeks). Example: "3h", "1d", "2w".',
      inputSchema: {
        type: "object",
        properties: {
          datetime: {
            type: "string",
            description:
              'ISO 8601 datetime string (e.g. "2024-01-01T00:00:00Z").',
          },
          duration: {
            type: "string",
            description:
              'Duration string matching /^\\d+[smhdw]$/ (e.g. "30s", "15m", "3h", "1d", "2w").',
          },
        },
        required: ["datetime", "duration"],
      },
    },
    {
      name: "is_japanese_holiday",
      description:
        "Checks whether a given date is a Japanese national public holiday. Returns the holiday name if it is one.",
      inputSchema: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description: 'Date in YYYY-MM-DD format (e.g. "2026-05-03").',
          },
        },
        required: ["date"],
      },
    },
    {
      name: "list_japanese_holidays",
      description:
        "Lists all Japanese national public holidays for a given year. Supported years: 2024–2028.",
      inputSchema: {
        type: "object",
        properties: {
          year: {
            type: "number",
            description: "Year (2024–2028).",
          },
        },
        required: ["year"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let text: string;

    switch (name) {
      case "get_current_time": {
        const { timezone } = (args ?? {}) as { timezone?: string };
        text = handleGetCurrentTime(timezone);
        break;
      }
      case "convert_timezone": {
        const { datetime, from_tz, to_tz } = args as {
          datetime: string;
          from_tz: string;
          to_tz: string;
        };
        if (!datetime || !from_tz || !to_tz) {
          throw new Error('"datetime", "from_tz", and "to_tz" are all required.');
        }
        text = handleConvertTimezone(datetime, from_tz, to_tz);
        break;
      }
      case "add_duration": {
        const { datetime, duration } = args as {
          datetime: string;
          duration: string;
        };
        if (!datetime || !duration) {
          throw new Error('"datetime" and "duration" are both required.');
        }
        text = handleAddDuration(datetime, duration);
        break;
      }
      case "is_japanese_holiday": {
        const { date } = args as { date: string };
        if (!date) throw new Error('"date" is required.');
        text = handleIsJapaneseHoliday(date);
        break;
      }
      case "list_japanese_holidays": {
        const { year } = args as { year: number };
        if (year === undefined) throw new Error('"year" is required.');
        text = handleListJapaneseHolidays(year);
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
  process.stderr.write(
    `Fatal: ${err instanceof Error ? err.message : String(err)}\n`
  );
  process.exit(1);
});
