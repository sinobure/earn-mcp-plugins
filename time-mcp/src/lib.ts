// Japanese holiday data (2024-2028, hardcoded for offline use).
// Source: Cabinet Office of Japan https://www8.cao.go.jp/chosei/shukujitsu/gaiyou.html
// Includes substitute holidays (振替休日) and 国民の休日. Cross-checked against the
// statutory rules in src/lib.test.ts. To extend: add the new year here, widen
// SUPPORTED_YEARS and re-run the tests.
export const JAPANESE_HOLIDAYS: Record<string, string> = {
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
  "2025-05-06": "みどりの日 振替休日",
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
  "2026-05-06": "憲法記念日 振替休日",
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

export const SUPPORTED_YEARS = { min: 2024, max: 2028 } as const;

const DURATION_RE = /^(\d{1,12})([smhdw])$/;
const DATETIME_RE =
  /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

interface Fields {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
  s: number;
  ms: number;
}

export interface ParsedDatetime extends Fields {
  /** UTC offset in minutes if the input carried one (Z = 0); null for naive input. */
  offsetMin: number | null;
}

function isRealDate(y: number, mo: number, d: number): boolean {
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

export function validateTimezone(tz: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    throw new Error(
      `Unknown timezone: "${tz}". Use an IANA timezone name such as "Asia/Tokyo" or "America/New_York".`
    );
  }
}

/** Strictly parses an ISO 8601 date or datetime; rejects impossible dates such as 2024-02-30. */
export function parseDatetime(input: string, label = "datetime"): ParsedDatetime {
  const fail = (): never => {
    throw new Error(
      `Invalid ${label}: "${input}". Expected a real calendar date/time in ISO 8601 (e.g. "2024-01-01", "2024-01-01T09:00:00" or "2024-01-01T00:00:00Z").`
    );
  };
  const m = DATETIME_RE.exec(input);
  if (!m) return fail();
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const h = m[4] === undefined ? 0 : Number(m[4]);
  const mi = m[5] === undefined ? 0 : Number(m[5]);
  const s = m[6] === undefined ? 0 : Number(m[6]);
  const ms = m[7] === undefined ? 0 : Math.floor(Number(`0.${m[7]}`) * 1000);
  if (!isRealDate(y, mo, d) || h > 23 || mi > 59 || s > 59) return fail();
  let offsetMin: number | null = null;
  const z = m[8];
  if (z !== undefined) {
    if (z === "Z") offsetMin = 0;
    else {
      const digits = z.slice(1).replace(":", "");
      const oh = Number(digits.slice(0, 2));
      const om = digits.length > 2 ? Number(digits.slice(2)) : 0;
      if (oh > 23 || om > 59) return fail();
      offsetMin = (z[0] === "-" ? -1 : 1) * (oh * 60 + om);
    }
  }
  return { y, mo, d, h, mi, s, ms, offsetMin };
}

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmtFor(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      calendar: "iso8601",
      numberingSystem: "latn",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function wallParts(epochMs: number, tz: string): Fields {
  const p: Record<string, number> = {};
  for (const { type, value } of fmtFor(tz).formatToParts(new Date(epochMs))) {
    if (type !== "literal") p[type] = Number(value);
  }
  return { y: p.year, mo: p.month, d: p.day, h: p.hour, mi: p.minute, s: p.second, ms: 0 };
}

/** UTC offset (ms) of `tz` at the instant `epochMs`. */
function offsetAtMs(epochMs: number, tz: string): number {
  const f = wallParts(epochMs, tz);
  const wall = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s);
  return wall - Math.floor(epochMs / 1000) * 1000;
}

/**
 * Converts wall-clock fields in `tz` to a UTC epoch (ms).
 * Policy (matches JS Temporal "compatible"):
 *  - ambiguous time (clock set back, e.g. 2024-11-03T01:30 New_York): the EARLIER instant (first occurrence, DST side)
 *  - non-existent time (clock set forward, e.g. 2024-03-10T02:30 New_York): interpreted with the offset
 *    in force BEFORE the transition, i.e. shifted forward (02:30 EST -> 03:30 EDT).
 */
export function wallToEpoch(f: Fields, tz: string): number {
  const wall = Date.UTC(f.y, f.mo - 1, f.d, f.h, f.mi, f.s) + f.ms;
  // Offsets in force a day before / after bracket any single transition.
  const before = offsetAtMs(wall - 86_400_000, tz);
  const after = offsetAtMs(wall + 86_400_000, tz);
  const valid = [...new Set([before, after])]
    .map((o) => wall - o)
    .filter((t) => offsetAtMs(t, tz) === wall - t);
  if (valid.length > 0) return Math.min(...valid);
  return wall - before; // gap: use the pre-transition offset
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

function formatOffset(offsetMs: number): string {
  const min = Math.round(offsetMs / 60000);
  if (min === 0) return "Z";
  const a = Math.abs(min);
  return `${min < 0 ? "-" : "+"}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** ISO 8601 string of an instant as seen in `tz` (e.g. 2024-01-01T09:00:00+09:00). */
export function formatInTz(epochMs: number, tz: string): string {
  const f = wallParts(epochMs, tz);
  return `${pad(f.y, 4)}-${pad(f.mo)}-${pad(f.d)}T${pad(f.h)}:${pad(f.mi)}:${pad(f.s)}${formatOffset(offsetAtMs(epochMs, tz))}`;
}

export function handleGetCurrentTime(timezone: string = "Asia/Tokyo", now: Date = new Date()): string {
  validateTimezone(timezone);
  return JSON.stringify({
    datetime: formatInTz(now.getTime(), timezone),
    timezone,
    utc: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
  });
}

export function handleConvertTimezone(datetime: string, from_tz: string, to_tz: string): string {
  const p = parseDatetime(datetime);
  validateTimezone(from_tz);
  validateTimezone(to_tz);
  const epoch =
    p.offsetMin !== null
      ? Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) + p.ms - p.offsetMin * 60000
      : wallToEpoch(p, from_tz);
  const date = new Date(epoch);
  if (isNaN(date.getTime())) throw new Error(`Cannot convert datetime: "${datetime}".`);
  return JSON.stringify({
    input: datetime,
    from_timezone: from_tz,
    to_timezone: to_tz,
    result: formatInTz(epoch, to_tz),
    utc: date.toISOString(),
  });
}

export function handleAddDuration(datetime: string, duration: string): string {
  const p = parseDatetime(datetime);
  const match = DURATION_RE.exec(duration);
  if (!match) {
    throw new Error(
      `Invalid duration: "${duration}". Use a non-negative integer plus unit, e.g. "30s", "15m", "3h", "1d", "2w" (s=seconds, m=minutes, h=hours, d=days of exactly 24h, w=weeks).`
    );
  }
  const unitMs: Record<string, number> = {
    s: 1_000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
    w: 7 * 86_400_000,
  };
  // Naive input (no offset) is treated as UTC.
  const base = Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) + p.ms - (p.offsetMin ?? 0) * 60000;
  const result = new Date(base + Number(match[1]) * unitMs[match[2]]);
  if (isNaN(result.getTime())) throw new Error(`Result is out of the representable date range.`);
  return JSON.stringify({
    input: datetime,
    duration,
    result: result.toISOString(),
    unix: Math.floor(result.getTime() / 1000),
  });
}

function checkHolidayYear(year: number): void {
  if (!Number.isInteger(year) || year < SUPPORTED_YEARS.min || year > SUPPORTED_YEARS.max) {
    throw new Error(
      `Year out of range: ${year}. Holiday data covers ${SUPPORTED_YEARS.min}-${SUPPORTED_YEARS.max} only; results outside this range would be unreliable.`
    );
  }
}

export function handleIsJapaneseHoliday(date: string): string {
  const m = DATE_RE.exec(date);
  if (!m || !isRealDate(Number(m[1]), Number(m[2]), Number(m[3]))) {
    throw new Error(`Invalid date: "${date}". Expected a real calendar date in YYYY-MM-DD format (e.g. "2026-05-03").`);
  }
  checkHolidayYear(Number(m[1]));
  const name = JAPANESE_HOLIDAYS[date];
  return JSON.stringify({ date, is_holiday: name !== undefined, holiday_name: name ?? null });
}

export function handleListJapaneseHolidays(year: number): string {
  checkHolidayYear(year);
  const prefix = `${year}-`;
  const holidays = Object.entries(JAPANESE_HOLIDAYS)
    .filter(([date]) => date.startsWith(prefix))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, name]) => ({ date, name }));
  return JSON.stringify({ year, count: holidays.length, holidays });
}
