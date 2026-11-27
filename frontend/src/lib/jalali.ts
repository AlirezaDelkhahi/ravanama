export const JALALI_MONTHS = [
  "فروردین",
  "اردیبهشت",
  "خرداد",
  "تیر",
  "مرداد",
  "شهریور",
  "مهر",
  "آبان",
  "آذر",
  "دی",
  "بهمن",
  "اسفند",
] as const;

export const JALALI_WEEKDAYS_SHORT = ["ش", "ی", "د", "س", "چ", "پ", "ج"] as const;

export const JALALI_WEEKDAYS_FULL = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنج‌شنبه",
  "جمعه",
] as const;

const PERSIAN_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"] as const;

export interface JalaliDate {
  jy: number;
  jm: number;
  jd: number;
}

export interface GregorianDate {
  gy: number;
  gm: number;
  gd: number;
}

export type CurrencyCode = "IRT" | "USD" | "EUR";

export function toPersianDigits(input: string | number): string {
  return String(input).replace(/\d/g, (digit) => PERSIAN_DIGITS[Number(digit)] ?? digit);
}

export function toWesternDigits(input: string): string {
  return input
    .replace(/[۰-۹]/g, (ch) => String(ch.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (ch) => String(ch.charCodeAt(0) - 0x0660));
}

export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days =
    355666 +
    365 * gy +
    Math.floor((gy2 + 3) / 4) -
    Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) +
    gd +
    (gdm[gm - 1] ?? 0);
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30);
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30);
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy: number, jm: number, jd: number): GregorianDate {
  const y = jy + 1595;
  let days =
    -355668 +
    365 * y +
    Math.floor(y / 33) * 8 +
    Math.floor(((y % 33) + 3) / 4) +
    jd +
    (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days++;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const isGregorianLeap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const salA = [0, 31, isGregorianLeap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > (salA[gm] ?? 0)) {
    gd -= salA[gm] ?? 0;
    gm++;
  }
  return { gy, gm, gd };
}

export function isJalaliLeapYear(jy: number): boolean {
  const g = jalaliToGregorian(jy, 12, 30);
  const back = gregorianToJalali(g.gy, g.gm, g.gd);
  return back.jy === jy && back.jm === 12 && back.jd === 30;
}

export function getJalaliMonthLength(jy: number, jm: number): number {
  if (jm >= 1 && jm <= 6) return 31;
  if (jm >= 7 && jm <= 11) return 30;
  return isJalaliLeapYear(jy) ? 30 : 29;
}

/**
 * Saturday-first weekday index:
 * 0 = شنبه, 1 = یکشنبه, 2 = دوشنبه, 3 = سه‌شنبه, 4 = چهارشنبه, 5 = پنج‌شنبه, 6 = جمعه
 */
export function weekdaySat0(gy: number, gm: number, gd: number): number {
  const jsDay = new Date(Date.UTC(gy, gm - 1, gd)).getUTCDay(); // 0=Sun..6=Sat
  return (jsDay + 1) % 7;
}

export function getJalaliMonthFirstWeekdaySat0(jy: number, jm: number): number {
  const g = jalaliToGregorian(jy, jm, 1);
  return weekdaySat0(g.gy, g.gm, g.gd);
}

export function formatJalaliKey(jy: number, jm: number, jd: number): string {
  return `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
}

export function parseJalaliKey(key: string): JalaliDate | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!match) return null;
  return {
    jy: Number(match[1]),
    jm: Number(match[2]),
    jd: Number(match[3]),
  };
}

export function formatJalaliNumeric(jy: number, jm: number, jd: number): string {
  return toPersianDigits(
    `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`,
  );
}

export function formatJalaliLong(jy: number, jm: number, jd: number): string {
  const g = jalaliToGregorian(jy, jm, jd);
  const wd = JALALI_WEEKDAYS_FULL[weekdaySat0(g.gy, g.gm, g.gd)] ?? "";
  const monthName = JALALI_MONTHS[jm - 1] ?? "";
  return `${wd} ${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

export function formatJalaliMonthYear(jy: number, jm: number): string {
  const monthName = JALALI_MONTHS[jm - 1] ?? "";
  return `${monthName} ${toPersianDigits(jy)}`;
}

export function formatToman(amountInt: number): string {
  const safeInt = Math.trunc(amountInt);
  const formatted = new Intl.NumberFormat("fa-IR").format(safeInt);
  return `${formatted} تومان`;
}

export function formatCurrency(amountInt: number, currency: CurrencyCode): string {
  const safeInt = Math.trunc(amountInt);
  if (currency === "IRT") {
    return formatToman(safeInt);
  }
  const symbol = currency === "EUR" ? "€" : "$";
  const sign = safeInt < 0 ? "-" : "";
  const absInt = Math.abs(safeInt);
  const whole = Math.trunc(absInt / 100);
  const cents = absInt % 100;
  return cents === 0
    ? `${sign}${symbol}${whole}`
    : `${sign}${symbol}${whole}.${String(cents).padStart(2, "0")}`;
}

export function getTehranDateParts(date: Date): GregorianDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = Number(parts.find((p) => p.type === "year")?.value ?? 2026);
  const month = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const day = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  return { gy: year, gm: month, gd: day };
}

export function dateToTehranJalali(date: Date): JalaliDate {
  const { gy, gm, gd } = getTehranDateParts(date);
  return gregorianToJalali(gy, gm, gd);
}
