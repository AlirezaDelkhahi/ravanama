export const TEHRAN_TIMEZONE = "Asia/Tehran";

export function detectBrowserTimezone(fallback = TEHRAN_TIMEZONE): string {
  try {
    const resolved = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return resolved && resolved.length > 0 ? resolved : fallback;
  } catch {
    return fallback;
  }
}

export function formatTimeInZone(
  date: Date,
  timeZone: string,
  locale = "en-GB",
): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function formatTehranTime(date: Date): string {
  return formatTimeInZone(date, TEHRAN_TIMEZONE, "fa-IR");
}

export function formatDualTimezone(
  date: Date,
  clientTimeZone: string,
): { localTime: string; tehranTime: string; clientTimeZone: string } {
  return {
    localTime: formatTimeInZone(date, clientTimeZone, "en-GB"),
    tehranTime: formatTehranTime(date),
    clientTimeZone,
  };
}
