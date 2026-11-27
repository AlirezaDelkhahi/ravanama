const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

export function toWesternDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

export function formatJalaliDate(
  date: Date,
  timeZone = "Asia/Tehran",
  options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  },
): string {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    timeZone,
    ...options,
  }).format(date);
}

export function formatJalaliMonthYear(date: Date, timeZone = "Asia/Tehran"): string {
  return formatJalaliDate(date, timeZone, {
    year: "numeric",
    month: "long",
  });
}

export function formatTomanAmount(amount: number): string {
  const formatted = new Intl.NumberFormat("fa-IR").format(amount);
  return `${formatted} تومان`;
}
