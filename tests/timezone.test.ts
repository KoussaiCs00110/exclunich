import { describe, expect, it } from "vitest";
import {
  findSessionConflicts,
  formatInZone,
  isValidTimezone,
  localDateKey,
  localDateTimeToISO,
  overlaps,
  sameLocalDay,
  toLocalDateTimeInput,
  zonedWeekDates,
} from "../src/lib/timezone";

describe("Africa/Algiers and IANA timezone handling", () => {
  it("converts Algerian wall-clock times to UTC", () => {
    expect(localDateTimeToISO("2026-11-20", "08:30")).toBe(
      "2026-11-20T07:30:00.000Z",
    );
    expect(toLocalDateTimeInput("2026-11-20T07:30:00Z")).toBe(
      "2026-11-20T08:30",
    );
  });
  it("uses the local day at midnight boundaries", () => {
    expect(localDateKey("2026-11-20T23:30:00Z")).toBe("2026-11-21");
    expect(sameLocalDay("2026-11-20T23:30:00Z", "2026-11-21T05:00:00Z")).toBe(
      true,
    );
  });
  it("formats compact timetable dates and times", () => {
    expect(formatInZone("2026-11-20T07:30:00Z", "EEE, dd MMM · HH:mm")).toBe(
      "Fri, 20 Nov · 08:30",
    );
  });
  it("includes all seven days through Sunday in the local week", () => {
    expect(zonedWeekDates("2026-11-22T12:00:00Z")).toEqual([
      "2026-11-16",
      "2026-11-17",
      "2026-11-18",
      "2026-11-19",
      "2026-11-20",
      "2026-11-21",
      "2026-11-22",
    ]);
  });
  it("chooses the next week when the local Monday starts before UTC Monday", () => {
    expect(zonedWeekDates("2026-11-22T23:30:00Z")[0]).toBe("2026-11-23");
  });
  it("handles ISO week/year boundaries", () => {
    expect(formatInZone("2027-01-01T12:00:00Z", "RRRR-'W'II")).toBe("2026-W53");
  });
  it("handles other configured zones and daylight saving offsets", () => {
    expect(localDateTimeToISO("2026-07-01", "08:00", "Europe/Paris")).toBe(
      "2026-07-01T06:00:00.000Z",
    );
    expect(localDateTimeToISO("2026-01-01", "08:00", "Europe/Paris")).toBe(
      "2026-01-01T07:00:00.000Z",
    );
  });
  it("rejects malformed dates, invalid calendar dates, and DST gaps", () => {
    expect(() => localDateTimeToISO("2026-02-30", "08:00")).toThrow();
    expect(() => localDateTimeToISO("2026-11-20", "25:00")).toThrow();
    expect(() =>
      localDateTimeToISO("2026-03-29", "02:30", "Europe/Paris"),
    ).toThrow();
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });
});

describe("timetable conflict detection", () => {
  const a = {
    id: "a",
    starts_at: "2026-11-20T08:00:00Z",
    ends_at: "2026-11-20T09:00:00Z",
  };
  it("does not flag adjacent sessions", () =>
    expect(
      overlaps(a, { starts_at: a.ends_at, ends_at: "2026-11-20T10:00:00Z" }),
    ).toBe(false));
  it("detects a partial overlap", () =>
    expect(
      overlaps(a, {
        starts_at: "2026-11-20T08:30:00Z",
        ends_at: "2026-11-20T09:30:00Z",
      }),
    ).toBe(true));
  it("detects nested sessions and excludes cancelled ones", () => {
    const nested = {
      id: "b",
      starts_at: "2026-11-20T08:15:00Z",
      ends_at: "2026-11-20T08:45:00Z",
    };
    expect(findSessionConflicts([a, nested])).toHaveLength(1);
    expect(
      findSessionConflicts([a, { ...nested, cancelled: true }]),
    ).toHaveLength(0);
  });
});
