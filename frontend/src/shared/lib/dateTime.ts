export const ASTANA_TIME_ZONE = "Asia/Almaty";

const ASTANA_UTC_OFFSET_HOURS = 5;

type DateValue = string | Date | null | undefined;

type AstanaDateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
};

export function formatAstanaDateTime(value: DateValue) {
  const date = parseDateValue(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ASTANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAstanaDate(value: DateValue) {
  const date = parseDateValue(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ASTANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatAstanaTime(value: DateValue) {
  const date = parseDateValue(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: ASTANA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatAstanaDateKey(value: DateValue) {
  const parts = getAstanaDateParts(value);
  if (!parts) return "";

  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}`;
}

export function formatAstanaDateTimeLocal(value: DateValue) {
  const parts = getAstanaDateParts(value);
  if (!parts) return "";

  return `${parts.year}-${padDatePart(parts.month)}-${padDatePart(parts.day)}T${padDatePart(
    parts.hour,
  )}:${padDatePart(parts.minute)}`;
}

export function formatAstanaDateTimeForDocument(value: DateValue) {
  const date = formatAstanaDate(value);
  const time = formatAstanaTime(value);
  return date && time ? `${date} в ${time}` : "";
}

export function getAstanaTodayDateKey() {
  return formatAstanaDateKey(new Date());
}

export function parseAstanaDateTimeLocal(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute] = match;
  return createAstanaDateTime({
    year: Number(year),
    month: Number(month),
    day: Number(day),
    hour: Number(hour),
    minute: Number(minute),
    second: 0,
    millisecond: 0,
  });
}

export function getAstanaDateParts(value: DateValue): AstanaDateParts | null {
  const date = parseDateValue(value);
  if (!date) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ASTANA_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const lookup = new Map(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(lookup.get("year")),
    month: Number(lookup.get("month")),
    day: Number(lookup.get("day")),
    hour: Number(lookup.get("hour")),
    minute: Number(lookup.get("minute")),
    second: Number(lookup.get("second")),
    millisecond: date.getMilliseconds(),
  };
}

export function startOfAstanaDay(value: DateValue) {
  const parts = getAstanaDateParts(value);
  if (!parts) return null;

  return createAstanaDateTime({ ...parts, hour: 0, minute: 0, second: 0, millisecond: 0 });
}

export function endOfAstanaDay(value: DateValue) {
  const parts = getAstanaDateParts(value);
  if (!parts) return null;

  return createAstanaDateTime({
    ...parts,
    hour: 23,
    minute: 59,
    second: 59,
    millisecond: 999,
  });
}

export function setAstanaTime(value: DateValue, hour: number, minute: number) {
  const parts = getAstanaDateParts(value);
  if (!parts) return null;

  return createAstanaDateTime({ ...parts, hour, minute, second: 0, millisecond: 0 });
}

export function addAstanaDays(value: DateValue, days: number) {
  const parts = getAstanaDateParts(value);
  if (!parts) return null;

  return createAstanaDateTime({ ...parts, day: parts.day + days });
}

export function addAstanaMonths(value: DateValue, months: number) {
  const parts = getAstanaDateParts(value);
  if (!parts) return null;

  return createAstanaDateTime({ ...parts, month: parts.month + months });
}

function createAstanaDateTime(parts: AstanaDateParts) {
  return new Date(
    Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour - ASTANA_UTC_OFFSET_HOURS,
      parts.minute,
      parts.second,
      parts.millisecond,
    ),
  );
}

function parseDateValue(value: DateValue) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return date;
}

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}
