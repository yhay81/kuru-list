import { accentNames, responseStatuses, type AccentName, type ResponseStatus } from "./domain";

const sessionIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/;
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const timezonePattern = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/;

type ObjectPayload = Record<string, unknown>;

const cleanText = (value: unknown, maximum: number) =>
  typeof value === "string" ? value.trim().slice(0, maximum) : "";

export function validSessionId(value: unknown): value is string {
  return typeof value === "string" && sessionIdPattern.test(value);
}

function validDate(value: string) {
  const match = datePattern.exec(value);
  if (!match) {
    return false;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export type ValidEventInput = {
  accent: AccentName;
  capacity: number;
  details: string;
  eventDate: string;
  sessionId: string;
  startTime: string;
  timezone: string;
  title: string;
  venue: string;
};

export function validateEventInput(payload: ObjectPayload): ValidEventInput | null {
  const title = cleanText(payload.title, 80);
  const eventDate = cleanText(payload.eventDate, 10);
  const startTime = cleanText(payload.startTime, 5);
  const timezone = cleanText(payload.timezone, 64);
  const venue = cleanText(payload.venue, 100);
  const details = cleanText(payload.details, 600);
  const capacity = Number(payload.capacity);
  const accent = cleanText(payload.accent, 12);
  if (
    title.length < 2 ||
    !validDate(eventDate) ||
    !timePattern.test(startTime) ||
    !timezonePattern.test(timezone) ||
    !Number.isInteger(capacity) ||
    capacity < 0 ||
    capacity > 500 ||
    !accentNames.includes(accent as AccentName) ||
    !validSessionId(payload.sessionId) ||
    cleanText(payload.website, 200)
  ) {
    return null;
  }
  const eventTimestamp = Date.parse(`${eventDate}T23:59:59Z`);
  const today = Date.now() - 86_400_000;
  const furthest = Date.now() + 370 * 86_400_000;
  if (eventTimestamp < today || eventTimestamp > furthest) {
    return null;
  }
  return {
    accent: accent as AccentName,
    capacity,
    details,
    eventDate,
    sessionId: payload.sessionId,
    startTime,
    timezone,
    title,
    venue,
  };
}

export type ValidResponseInput = {
  displayName: string;
  note: string;
  sessionId: string;
  status: ResponseStatus;
};

export function validateResponseInput(payload: ObjectPayload): ValidResponseInput | null {
  const displayName = cleanText(payload.displayName, 40);
  const note = cleanText(payload.note, 120);
  const status = cleanText(payload.status, 8);
  if (
    !displayName ||
    !responseStatuses.includes(status as ResponseStatus) ||
    !validSessionId(payload.sessionId) ||
    cleanText(payload.website, 200)
  ) {
    return null;
  }
  return {
    displayName,
    note,
    sessionId: payload.sessionId,
    status: status as ResponseStatus,
  };
}

export function validateStatusAction(payload: ObjectPayload) {
  return payload.action === "open" || payload.action === "close" ? payload.action : null;
}

export function eventExpiry(eventDate: string) {
  return Math.floor(Date.parse(`${eventDate}T23:59:59Z`) / 1000) + 35 * 86_400;
}
