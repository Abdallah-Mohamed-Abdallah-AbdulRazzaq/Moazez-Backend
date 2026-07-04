import { Injectable } from '@nestjs/common';

const DEFAULT_TIMEZONE = 'Africa/Cairo';
const HH_MM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface ParentSmartPickupWindowState {
  requestWindowOpen: boolean;
  serverNowLocal: string;
}

@Injectable()
export class ParentSmartPickupClock {
  now(): Date {
    return new Date();
  }
}

export function calculateParentSmartPickupWindow(params: {
  startLocal: string | null;
  endLocal: string | null;
  timezone: string;
  now: Date;
}): ParentSmartPickupWindowState {
  const timezone = supportedTimezoneOrDefault(params.timezone);
  const localParts = getLocalDateTimeParts(params.now, timezone);
  const nowMinutes = localParts.hour * 60 + localParts.minute;
  const startMinutes = parseLocalTime(params.startLocal);
  const endMinutes = parseLocalTime(params.endLocal);

  if (startMinutes === null || endMinutes === null) {
    return {
      requestWindowOpen: false,
      serverNowLocal: formatLocalDateTime(localParts),
    };
  }

  const requestWindowOpen =
    startMinutes <= endMinutes
      ? nowMinutes >= startMinutes && nowMinutes <= endMinutes
      : nowMinutes >= startMinutes || nowMinutes <= endMinutes;

  return {
    requestWindowOpen,
    serverNowLocal: formatLocalDateTime(localParts),
  };
}

export function supportedTimezoneOrDefault(timezone: string): string {
  const normalized = timezone.trim();
  if (!normalized) return DEFAULT_TIMEZONE;

  try {
    new Intl.DateTimeFormat('en-US', { timeZone: normalized }).format();
    return normalized;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

function parseLocalTime(value: string | null): number | null {
  if (!value) return null;
  const match = value.match(HH_MM_PATTERN);
  if (!match) return null;

  return Number(match[1]) * 60 + Number(match[2]);
}

function getLocalDateTimeParts(
  date: Date,
  timezone: string,
): {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value]),
  );

  return {
    year: requirePart(parts.year, 'year'),
    month: requirePart(parts.month, 'month'),
    day: requirePart(parts.day, 'day'),
    hour: Number(requirePart(parts.hour, 'hour')),
    minute: Number(requirePart(parts.minute, 'minute')),
    second: Number(requirePart(parts.second, 'second')),
  };
}

function formatLocalDateTime(parts: {
  year: string;
  month: string;
  day: string;
  hour: number;
  minute: number;
  second: number;
}): string {
  return `${parts.year}-${parts.month}-${parts.day}T${pad(parts.hour)}:${pad(
    parts.minute,
  )}:${pad(parts.second)}`;
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function requirePart(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`Unable to format local ${name} for Smart Pickup window.`);
  }

  return value;
}
