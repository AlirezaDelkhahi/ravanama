export interface IcsEventInput {
  uid: string;
  title: string;
  description: string;
  startIsoUtc: string;
  durationMinutes: number;
  location?: string;
}

function formatIcsUtcStamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${date.getUTCFullYear()}` +
    `${pad(date.getUTCMonth() + 1)}` +
    `${pad(date.getUTCDate())}T` +
    `${pad(date.getUTCHours())}` +
    `${pad(date.getUTCMinutes())}` +
    `${pad(date.getUTCSeconds())}Z`
  );
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

export function buildIcsCalendarFile(input: IcsEventInput): string {
  const start = new Date(input.startIsoUtc);
  const end = new Date(start.getTime() + input.durationMinutes * 60_000);
  const now = new Date();

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RavanNama//Online Therapy Booking//FA",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${input.uid}@ravannama.ir`,
    `DTSTAMP:${formatIcsUtcStamp(now)}`,
    `DTSTART:${formatIcsUtcStamp(start)}`,
    `DTEND:${formatIcsUtcStamp(end)}`,
    `SUMMARY:${escapeIcsText(input.title)}`,
    `DESCRIPTION:${escapeIcsText(input.description)}`,
    input.location ? `LOCATION:${escapeIcsText(input.location)}` : "LOCATION:جلسه آنلاین روان‌نما",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];

  return lines.join("\r\n");
}

export function downloadIcsFile(filename: string, input: IcsEventInput): void {
  const content = buildIcsCalendarFile(input);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
