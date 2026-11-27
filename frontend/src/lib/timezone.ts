import { toPersianDigits } from "./jalali";

export const TEHRAN_TIMEZONE = "Asia/Tehran";

export interface TimezoneOption {
  iana: string;
  cityFa: string;
  countryFa: string;
}

export const CURATED_TIMEZONES: readonly TimezoneOption[] = [
  { iana: "Europe/Berlin", cityFa: "برلین", countryFa: "آلمان" },
  { iana: "Europe/London", cityFa: "لندن", countryFa: "بریتانیا" },
  { iana: "Europe/Amsterdam", cityFa: "آمستردام", countryFa: "هلند" },
  { iana: "Europe/Stockholm", cityFa: "استکهلم", countryFa: "سوئد" },
  { iana: "Europe/Paris", cityFa: "پاریس", countryFa: "فرانسه" },
  { iana: "America/Toronto", cityFa: "تورنتو", countryFa: "کانادا" },
  { iana: "America/New_York", cityFa: "نیویورک", countryFa: "آمریکا" },
  { iana: "America/Los_Angeles", cityFa: "لس‌آنجلس", countryFa: "آمریکا" },
  { iana: "Asia/Dubai", cityFa: "دبی", countryFa: "امارات" },
  { iana: "Australia/Sydney", cityFa: "سیدنی", countryFa: "استرالیا" },
  { iana: "Asia/Tehran", cityFa: "تهران", countryFa: "ایران" },
] as const;

export function detectBrowserTimezone(fallback = "Europe/Berlin"): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!resolved || resolved.length === 0) return fallback;
    return resolved;
  } catch {
    return fallback;
  }
}

export function getTimezoneOffsetLabel(
  timeZone: string,
  refDate: Date = new Date(),
): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "shortOffset",
    }).formatToParts(refDate);
    const raw = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT";
    if (raw === "GMT" || raw === "UTC") return "UTC+0";
    return raw.replace("GMT", "UTC");
  } catch {
    return "UTC";
  }
}

export function formatTime24InZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

export function formatGregorianDateKeyInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export interface DualSlotFormatted {
  localTime24h: string;
  tehranTimeFa: string;
  dateLabelEn: string;
}

export function formatDualSlot(isoUtc: string, clientTz: string): DualSlotFormatted {
  const date = new Date(isoUtc);
  const localTime24h = formatTime24InZone(date, clientTz);
  const tehranRaw24h = formatTime24InZone(date, TEHRAN_TIMEZONE);
  const tehranTimeFa = toPersianDigits(tehranRaw24h);
  const dateLabelEn = new Intl.DateTimeFormat("en-US", {
    timeZone: clientTz,
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

  return {
    localTime24h,
    tehranTimeFa,
    dateLabelEn,
  };
}
