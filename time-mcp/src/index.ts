#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  SUPPORTED_YEARS,
  handleAddDuration,
  handleConvertTimezone,
  handleGetCurrentTime,
  handleIsJapaneseHoliday,
  handleListJapaneseHolidays,
} from "./lib.js";

const VERSION = "1.0.0";

function str(args: Record<string, unknown>, key: string, required = true): string | undefined {
  const v = args[key];
  if (v === undefined || v === null) {
    if (required) throw new Error(`"${key}" is required.`);
    return undefined;
  }
  if (typeof v !== "string" || v.trim() === "") {
    throw new Error(`"${key}" must be a non-empty string (got ${typeof v}).`);
  }
  return v;
}

// ---------------------------------------------------------------------------
// Server setup
// ---------------------------------------------------------------------------

const server = new Server(
  {
    name: "kw-time-mcp",
    version: VERSION,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

const ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "get_current_time",
      description:
        "Returns the current date and time in the given IANA timezone (default Asia/Tokyo) as ISO 8601 with UTC offset, plus UTC and unix seconds.",
      annotations: { title: "Get current time", ...ANNOTATIONS, idempotentHint: false },
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
        additionalProperties: false,
      },
    },
    {
      name: "convert_timezone",
      description:
        "Converts a datetime to another IANA timezone, with correct daylight-saving handling. Input with an offset or Z is used as-is (from_tz ignored). Input without an offset is local time in from_tz; for a time that does not exist (clock springs forward) it is shifted forward, and for an ambiguous time (clock falls back) the first (earlier) occurrence is used.",
      annotations: { title: "Convert timezone", ...ANNOTATIONS },
      inputSchema: {
        type: "object",
        properties: {
          datetime: {
            type: "string",
            description:
              'ISO 8601 datetime (e.g. "2024-01-01T09:00:00" or "2024-01-01T00:00:00Z"). Impossible dates such as 2024-02-30 are rejected.',
          },
          from_tz: { type: "string", description: 'Source IANA timezone (e.g. "Asia/Tokyo").' },
          to_tz: { type: "string", description: 'Target IANA timezone (e.g. "America/New_York").' },
        },
        required: ["datetime", "from_tz", "to_tz"],
        additionalProperties: false,
      },
    },
    {
      name: "add_duration",
      description:
        'Adds a fixed duration to a datetime and returns the result in UTC. Format: non-negative integer + unit s/m/h/d/w (e.g. "3h", "1d", "2w"); "d" is exactly 24 hours (not a calendar day across DST) and "w" is 7 such days. A datetime without an offset is treated as UTC.',
      annotations: { title: "Add duration", ...ANNOTATIONS },
      inputSchema: {
        type: "object",
        properties: {
          datetime: {
            type: "string",
            description: 'ISO 8601 datetime (e.g. "2024-01-01T00:00:00Z"). No offset means UTC.',
          },
          duration: {
            type: "string",
            pattern: "^\\d{1,12}[smhdw]$",
            description: 'Duration such as "30s", "15m", "3h", "1d", "2w".',
          },
        },
        required: ["datetime", "duration"],
        additionalProperties: false,
      },
    },
    {
      name: "is_japanese_holiday",
      description: `Checks whether a date (YYYY-MM-DD) is a Japanese national holiday, including substitute holidays (振替休日) and 国民の休日. Returns the holiday name. Supports ${SUPPORTED_YEARS.min}-${SUPPORTED_YEARS.max}; other years return an error rather than a guess.`,
      annotations: { title: "Is Japanese holiday", ...ANNOTATIONS },
      inputSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: 'Date in YYYY-MM-DD format (e.g. "2026-05-03").' },
        },
        required: ["date"],
        additionalProperties: false,
      },
    },
    {
      name: "list_japanese_holidays",
      description: `Lists all Japanese national holidays (incl. substitute holidays and 国民の休日) for a year. Supported years: ${SUPPORTED_YEARS.min}-${SUPPORTED_YEARS.max}.`,
      annotations: { title: "List Japanese holidays", ...ANNOTATIONS },
      inputSchema: {
        type: "object",
        properties: {
          year: {
            type: "integer",
            minimum: SUPPORTED_YEARS.min,
            maximum: SUPPORTED_YEARS.max,
            description: `Year (${SUPPORTED_YEARS.min}-${SUPPORTED_YEARS.max}).`,
          },
        },
        required: ["year"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name } = request.params;
  const raw = request.params.arguments ?? {};

  try {
    if (typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error("Tool arguments must be a JSON object.");
    }
    const args = raw as Record<string, unknown>;
    let text: string;

    switch (name) {
      case "get_current_time":
        text = handleGetCurrentTime(str(args, "timezone", false));
        break;
      case "convert_timezone":
        text = handleConvertTimezone(str(args, "datetime")!, str(args, "from_tz")!, str(args, "to_tz")!);
        break;
      case "add_duration":
        text = handleAddDuration(str(args, "datetime")!, str(args, "duration")!);
        break;
      case "is_japanese_holiday":
        text = handleIsJapaneseHoliday(str(args, "date")!);
        break;
      case "list_japanese_holidays": {
        const year = args["year"];
        if (year === undefined || year === null) throw new Error('"year" is required.');
        if (typeof year !== "number") {
          throw new Error(`"year" must be an integer number (got ${typeof year}).`);
        }
        text = handleListJapaneseHolidays(year);
        break;
      }
      default:
        throw new Error(`Unknown tool: "${name}"`);
    }

    return { content: [{ type: "text", text }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

async function main(): Promise<void> {
  await server.connect(new StdioServerTransport());
  // No console output: stdout is reserved for MCP protocol messages.
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
