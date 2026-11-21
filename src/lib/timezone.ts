export const DEFAULT_TIMEZONE = "Africa/Algiers";

type DateValue = Date | string | number;

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

function parts(value: DateValue, timezone: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid date.");
  const values = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    values.find((part) => part.type === type)!.value;
  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
  };
}

function isoWeek(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const weekYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  return {
    year: weekYear,
    week: Math.ceil(
      ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
    ),
  };
}

/** Familiar date-fns-style display tokens, always formatted in the supplied zone. */
export function formatInZone(
  value: DateValue,
  pattern = "EEE, dd MMM · HH:mm",
  timezone = DEFAULT_TIMEZONE,
  locale = "en-GB",
): string {
  const date = new Date(value);
  const p = parts(value, timezone);
  const week = isoWeek(Number(p.year), Number(p.month), Number(p.day));
  const named = (options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: timezone, ...options }).format(
      date,
    );
  const tokens: Record<string, string> = {
    yyyy: p.year,
    yy: p.year.slice(-2),
    MM: p.month,
    M: String(Number(p.month)),
    dd: p.day,
    d: String(Number(p.day)),
    HH: p.hour,
    H: String(Number(p.hour)),
    mm: p.minute,
    ss: p.second,
    EEE: named({ weekday: "short" }),
    EEEE: named({ weekday: "long" }),
    MMM: named({ month: "short" }),
    MMMM: named({ month: "long" }),
    RRRR: String(week.year),
    II: String(week.week).padStart(2, "0"),
  };
  return pattern.replace(
    /'[^']*'|RRRR|yyyy|MMMM|EEEE|MMM|EEE|yy|MM|dd|HH|mm|ss|II|M|d|H/g,
    (token) => (token.startsWith("'") ? token.slice(1, -1) : tokens[token]),
  );
}

export function localDateKey(
  value: DateValue = new Date(),
  timezone = DEFAULT_TIMEZONE,
): string {
  return formatInZone(value, "yyyy-MM-dd", timezone);
}

export function toLocalDateTimeInput(
  value: DateValue,
  timezone = DEFAULT_TIMEZONE,
): string {
  return formatInZone(value, "yyyy-MM-dd'T'HH:mm", timezone);
}

/** Convert local wall-clock input to UTC without depending on the host timezone. */
export function localDateTimeToISO(
  date: string,
  time: string,
  timezone = DEFAULT_TIMEZONE,
): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)
  ) {
    throw new Error("Enter a valid local date and time.");
  }
  const input = `${date}T${time.length === 5 ? `${time}:00` : time}`;
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second] = (time.length === 5 ? `${time}:00` : time)
    .split(":")
    .map(Number);
  const desired = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const p = parts(guess, timezone);
    const represented = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour),
      Number(p.minute),
      Number(p.second),
    );
    const difference = desired - represented;
    if (!difference) break;
    guess += difference;
  }
  if (formatInZone(guess, "yyyy-MM-dd'T'HH:mm:ss", timezone) !== input) {
    throw new Error(
      "This date or local time does not exist in the selected timezone.",
    );
  }
  return new Date(guess).toISOString();
}

export function zonedWeekDates(
  anchor: DateValue = new Date(),
  timezone = DEFAULT_TIMEZONE,
  showSunday = false,
): string[] {
  const key = localDateKey(anchor, timezone);
  const monday = new Date(`${key}T12:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return Array.from({ length: showSunday ? 7 : 6 }, (_, index) => {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + index);
    return day.toISOString().slice(0, 10);
  });
}

export function sameLocalDay(
  a: DateValue,
  b: DateValue,
  timezone = DEFAULT_TIMEZONE,
): boolean {
  return localDateKey(a, timezone) === localDateKey(b, timezone);
}

export function overlaps(
  a: { starts_at: string; ends_at: string },
  b: { starts_at: string; ends_at: string },
): boolean {
  return (
    Date.parse(a.starts_at) < Date.parse(b.ends_at) &&
    Date.parse(b.starts_at) < Date.parse(a.ends_at)
  );
}

export function findSessionConflicts<
  T extends {
    id: string;
    starts_at: string;
    ends_at: string;
    cancelled?: boolean;
  },
>(occurrences: T[]): [T, T][] {
  const active = occurrences
    .filter((occurrence) => !occurrence.cancelled)
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
  const conflicts: [T, T][] = [];
  for (let i = 0; i < active.length; i += 1) {
    for (
      let j = i + 1;
      j < active.length &&
      Date.parse(active[j].starts_at) < Date.parse(active[i].ends_at);
      j += 1
    ) {
      if (overlaps(active[i], active[j]))
        conflicts.push([active[i], active[j]]);
    }
  }
  return conflicts;
}
