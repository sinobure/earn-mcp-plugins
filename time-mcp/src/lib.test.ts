import { describe, it, expect } from "vitest";
import {
  JAPANESE_HOLIDAYS,
  handleAddDuration,
  handleConvertTimezone,
  handleGetCurrentTime,
  handleIsJapaneseHoliday,
  handleListJapaneseHolidays,
} from "./lib.js";

const conv = (dt: string, from: string, to = "UTC") =>
  JSON.parse(handleConvertTimezone(dt, from, to));

// ---- independent re-derivation of the holidays from the statutory rules ----
function expectedHolidays(year: number): Record<string, string> {
  const iso = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const dow = (m: number, d: number) => new Date(Date.UTC(year, m - 1, d)).getUTCDay();
  const nthMonday = (m: number, n: number) => {
    const first = 1 + ((8 - dow(m, 1)) % 7);
    return first + 7 * (n - 1);
  };
  const eq = (c: number) => Math.floor(c + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  const base: Record<string, string> = {
    [iso(1, 1)]: "元日",
    [iso(1, nthMonday(1, 2))]: "成人の日",
    [iso(2, 11)]: "建国記念の日",
    [iso(2, 23)]: "天皇誕生日",
    [iso(3, eq(20.8431))]: "春分の日",
    [iso(4, 29)]: "昭和の日",
    [iso(5, 3)]: "憲法記念日",
    [iso(5, 4)]: "みどりの日",
    [iso(5, 5)]: "こどもの日",
    [iso(7, nthMonday(7, 3))]: "海の日",
    [iso(8, 11)]: "山の日",
    [iso(9, nthMonday(9, 3))]: "敬老の日",
    [iso(9, eq(23.2488))]: "秋分の日",
    [iso(10, nthMonday(10, 2))]: "スポーツの日",
    [iso(11, 3)]: "文化の日",
    [iso(11, 23)]: "勤労感謝の日",
  };
  const out: Record<string, string> = { ...base };
  const day = (s: string) => new Date(s + "T00:00:00Z");
  const next = (s: string) => new Date(day(s).getTime() + 86400000).toISOString().slice(0, 10);
  // 振替休日: a holiday on Sunday -> next day that is not a holiday
  for (const [d, n] of Object.entries(base).sort()) {
    if (day(d).getUTCDay() !== 0) continue;
    let c = next(d);
    while (base[c]) c = next(c);
    out[c] = `${n} 振替休日`;
  }
  // 国民の休日: a normal day sandwiched between two holidays (not Sunday)
  for (let t = Date.UTC(year, 0, 2); t < Date.UTC(year, 11, 31); t += 86400000) {
    const d = new Date(t).toISOString().slice(0, 10);
    const prev = new Date(t - 86400000).toISOString().slice(0, 10);
    if (!out[d] && base[prev] && base[next(d)] && new Date(t).getUTCDay() !== 0) out[d] = "国民の休日";
  }
  return out;
}

describe("Japanese holidays table matches statutory rules 2024-2028", () => {
  for (let y = 2024; y <= 2028; y++) {
    it(`${y}`, () => {
      const actual = Object.fromEntries(
        Object.entries(JAPANESE_HOLIDAYS).filter(([d]) => d.startsWith(`${y}-`))
      );
      expect(actual).toEqual(expectedHolidays(y));
    });
  }
  it("2026 has 18 holidays incl. 5/6 substitute and 9/22 国民の休日", () => {
    const r = JSON.parse(handleListJapaneseHolidays(2026));
    expect(r.count).toBe(18);
    expect(JSON.parse(handleIsJapaneseHoliday("2026-05-06")).holiday_name).toBe("憲法記念日 振替休日");
    expect(JSON.parse(handleIsJapaneseHoliday("2026-09-22")).holiday_name).toBe("国民の休日");
  });
});

describe("holiday tools input handling", () => {
  it("ordinary day is false", () => {
    expect(JSON.parse(handleIsJapaneseHoliday("2026-05-01")).is_holiday).toBe(false);
  });
  it("rejects impossible dates and bad formats", () => {
    expect(() => handleIsJapaneseHoliday("2024-02-30")).toThrow(/Invalid date/);
    expect(() => handleIsJapaneseHoliday("2024-2-3")).toThrow(/Invalid date/);
  });
  it("errors outside supported years instead of returning false", () => {
    expect(() => handleIsJapaneseHoliday("2029-01-01")).toThrow(/out of range/);
    expect(() => handleListJapaneseHolidays(2023)).toThrow(/out of range/);
    expect(() => handleListJapaneseHolidays(2026.5)).toThrow(/out of range/);
  });
});

describe("convert_timezone", () => {
  it("UTC to JST", () => {
    expect(conv("2024-01-01T00:00:00Z", "UTC", "Asia/Tokyo").result).toBe("2024-01-01T09:00:00+09:00");
  });
  it("half-hour and negative half-hour offsets", () => {
    expect(conv("2024-07-01T12:00:00", "Europe/London", "Asia/Kolkata").result).toBe("2024-07-01T16:30:00+05:30");
    expect(conv("2024-06-01T00:00:00Z", "UTC", "America/St_Johns").result).toBe("2024-05-31T21:30:00-02:30");
  });
  it("explicit offset ignores from_tz", () => {
    expect(conv("2024-01-01T09:00:00+09:00", "America/New_York").utc).toBe("2024-01-01T00:00:00.000Z");
    expect(conv("2024-01-01T09:00:00+0900", "America/New_York").utc).toBe("2024-01-01T00:00:00.000Z");
  });
  it("spring-forward day: hours after the transition (New York 2024-03-10)", () => {
    expect(conv("2024-03-10T01:59:00", "America/New_York").utc).toBe("2024-03-10T06:59:00.000Z");
    expect(conv("2024-03-10T03:00:00", "America/New_York").utc).toBe("2024-03-10T07:00:00.000Z");
    expect(conv("2024-03-10T04:00:00", "America/New_York").utc).toBe("2024-03-10T08:00:00.000Z");
    expect(conv("2024-03-10T06:00:00", "America/New_York").utc).toBe("2024-03-10T10:00:00.000Z");
    expect(conv("2025-03-09T03:30:00", "America/Los_Angeles").utc).toBe("2025-03-09T10:30:00.000Z");
  });
  it("non-existent time is shifted forward (New York and London)", () => {
    expect(conv("2024-03-10T02:30:00", "America/New_York").utc).toBe("2024-03-10T07:30:00.000Z");
    expect(conv("2024-03-31T01:30:00", "Europe/London").utc).toBe("2024-03-31T01:30:00.000Z");
  });
  it("fall-back day: ambiguous time takes the first occurrence, later times are EST", () => {
    expect(conv("2024-11-03T00:30:00", "America/New_York").utc).toBe("2024-11-03T04:30:00.000Z");
    expect(conv("2024-11-03T01:30:00", "America/New_York").utc).toBe("2024-11-03T05:30:00.000Z");
    expect(conv("2024-11-03T02:30:00", "America/New_York").utc).toBe("2024-11-03T07:30:00.000Z");
    expect(conv("2024-11-03T03:00:00", "America/New_York").utc).toBe("2024-11-03T08:00:00.000Z");
    expect(conv("2024-10-27T01:30:00", "Europe/London").utc).toBe("2024-10-27T00:30:00.000Z");
    expect(conv("2024-10-27T12:00:00", "Europe/London").utc).toBe("2024-10-27T12:00:00.000Z");
  });
  it("southern hemisphere transitions", () => {
    expect(conv("2024-10-06T12:00:00", "Australia/Sydney").utc).toBe("2024-10-06T01:00:00.000Z");
    expect(conv("2024-04-07T12:00:00", "Australia/Sydney").utc).toBe("2024-04-07T02:00:00.000Z");
  });
  it("output offset reflects DST at the target", () => {
    expect(conv("2024-03-10T06:59:00Z", "UTC", "America/New_York").result).toBe("2024-03-10T01:59:00-05:00");
    expect(conv("2024-03-10T07:00:00Z", "UTC", "America/New_York").result).toBe("2024-03-10T03:00:00-04:00");
  });
  it("rejects impossible input", () => {
    expect(() => handleConvertTimezone("2024-02-30", "UTC", "Asia/Tokyo")).toThrow(/Invalid datetime/);
    expect(() => handleConvertTimezone("2024-13-01T00:00:00Z", "UTC", "Asia/Tokyo")).toThrow();
    expect(() => handleConvertTimezone("2024-01-01T25:00:00", "UTC", "Asia/Tokyo")).toThrow();
    expect(() => handleConvertTimezone("2023-02-29T00:00:00Z", "UTC", "Asia/Tokyo")).toThrow();
    expect(() => handleConvertTimezone("2024-02-29T00:00:00Z", "UTC", "Asia/Tokyo")).not.toThrow();
    expect(() => handleConvertTimezone("2024-01-01T00:00:00", "Bad/Zone", "UTC")).toThrow(/Unknown timezone/);
  });
});

describe("get_current_time", () => {
  it("formats a fixed instant with offset", () => {
    const r = JSON.parse(handleGetCurrentTime("Asia/Kolkata", new Date("2026-10-13T08:16:54Z")));
    expect(r.datetime).toBe("2026-10-13T13:46:54+05:30");
    expect(r.unix).toBe(1791879414);
  });
  it("defaults to Asia/Tokyo", () => {
    expect(JSON.parse(handleGetCurrentTime(undefined, new Date("2024-01-01T00:00:00Z"))).datetime).toBe("2024-01-01T09:00:00+09:00");
  });
  it("UTC uses Z", () => {
    expect(JSON.parse(handleGetCurrentTime("UTC", new Date("2024-01-01T00:00:00Z"))).datetime).toBe("2024-01-01T00:00:00Z");
  });
  it("rejects unknown timezone", () => {
    expect(() => handleGetCurrentTime("Mars/Base")).toThrow(/Unknown timezone/);
  });
});

describe("add_duration", () => {
  it("units", () => {
    expect(JSON.parse(handleAddDuration("2024-01-01T00:00:00Z", "3h")).result).toBe("2024-01-01T03:00:00.000Z");
    expect(JSON.parse(handleAddDuration("2024-01-01T00:00:00Z", "2w")).result).toBe("2024-01-15T00:00:00.000Z");
    expect(JSON.parse(handleAddDuration("2024-02-28T00:00:00Z", "2d")).result).toBe("2024-03-01T00:00:00.000Z");
  });
  it("naive input is UTC; offset respected", () => {
    expect(JSON.parse(handleAddDuration("2024-01-01", "1h")).result).toBe("2024-01-01T01:00:00.000Z");
    expect(JSON.parse(handleAddDuration("2024-01-01T00:00:00+09:00", "1d")).result).toBe("2024-01-01T15:00:00.000Z");
  });
  it("rejects bad duration and date", () => {
    expect(() => handleAddDuration("2024-01-01T00:00:00Z", "-3h")).toThrow(/Invalid duration/);
    expect(() => handleAddDuration("2024-01-01T00:00:00Z", "1mo")).toThrow(/Invalid duration/);
    expect(() => handleAddDuration("2024-02-30T00:00:00Z", "1h")).toThrow(/Invalid datetime/);
    expect(() => handleAddDuration("9999-12-31T00:00:00Z", "999999999999w")).toThrow(/out of the representable/);
  });
});
