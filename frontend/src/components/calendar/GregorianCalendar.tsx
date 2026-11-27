"use client";

import { useEffect, useMemo, useState } from "react";
import { SheetModal } from "@/components/ui/SheetModal";
import type { TimeSlotOption } from "@/lib/mock-data";
import {
  CURATED_TIMEZONES,
  formatDualSlot,
  formatGregorianDateKeyInZone,
  getTimezoneOffsetLabel,
} from "@/lib/timezone";

const GREGORIAN_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const GREGORIAN_WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

interface GregorianCalendarProps {
  allSlots: TimeSlotOption[];
  clientTimezone: string;
  onChangeTimezone: (tz: string) => void;
  selectedDateKeyEn: string | null; // "YYYY-MM-DD"
  onSelectDateKeyEn: (dateKey: string) => void;
  selectedSlotId: string | null;
  onSelectSlot: (slot: TimeSlotOption) => void;
  todayKeyEn?: string;
}

function parseDateParts(dateKey: string | null | undefined): {
  year: number;
  month: number;
} {
  if (dateKey) {
    const [y, m] = dateKey.split("-").map(Number);
    if (y && m >= 1 && m <= 12) {
      return { year: y, month: m };
    }
  }
  return { year: 2026, month: 11 };
}

export function GregorianCalendar({
  allSlots,
  clientTimezone,
  onChangeTimezone,
  selectedDateKeyEn,
  onSelectDateKeyEn,
  selectedSlotId,
  onSelectSlot,
  todayKeyEn = "2026-11-27",
}: GregorianCalendarProps) {
  const initialParts = parseDateParts(selectedDateKeyEn ?? todayKeyEn);
  const [viewYear, setViewYear] = useState(initialParts.year);
  const [viewMonth, setViewMonth] = useState(initialParts.month);
  const [tzSheetOpen, setTzSheetOpen] = useState(false);
  const [tzSearch, setTzSearch] = useState("");

  useEffect(() => {
    if (!selectedDateKeyEn) return;
    const next = parseDateParts(selectedDateKeyEn);
    setViewYear(next.year);
    setViewMonth(next.month);
  }, [selectedDateKeyEn]);

  const slotsByDateKeyEn = useMemo(() => {
    const map = new Map<string, TimeSlotOption[]>();
    for (const slot of allSlots) {
      const dateKey = formatGregorianDateKeyInZone(
        new Date(slot.isoUtc),
        clientTimezone,
      );
      const list = map.get(dateKey) ?? [];
      list.push(slot);
      map.set(dateKey, list);
    }
    return map;
  }, [allSlots, clientTimezone]);

  const availableDateKeys = useMemo(
    () => new Set(slotsByDateKeyEn.keys()),
    [slotsByDateKeyEn],
  );

  const slotsForSelectedDate = useMemo(() => {
    if (!selectedDateKeyEn) return [];
    return slotsByDateKeyEn.get(selectedDateKeyEn) ?? [];
  }, [selectedDateKeyEn, slotsByDateKeyEn]);

  const daysInMonth = new Date(Date.UTC(viewYear, viewMonth, 0)).getUTCDate();
  const firstDayWeekday = new Date(Date.UTC(viewYear, viewMonth - 1, 1)).getUTCDay();

  const goPrevMonth = () => {
    if (viewMonth === 1) {
      setViewYear((y) => y - 1);
      setViewMonth(12);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 12) {
      setViewYear((y) => y + 1);
      setViewMonth(1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const dayCells = useMemo(() => {
    const blanks = Array.from({ length: firstDayWeekday }, () => null);
    const days = Array.from({ length: daysInMonth }, (_, idx) => {
      const day = idx + 1;
      const key = `${viewYear}-${String(viewMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return {
        day,
        key,
        isPast: key < todayKeyEn,
        hasSlots: availableDateKeys.has(key),
      };
    });
    return [...blanks, ...days];
  }, [availableDateKeys, daysInMonth, firstDayWeekday, todayKeyEn, viewMonth, viewYear]);

  const handleJumpNearestAvailable = () => {
    const sorted = Array.from(availableDateKeys)
      .filter((k) => k >= todayKeyEn)
      .sort();
    const target = sorted[0];
    if (!target) return;
    onSelectDateKeyEn(target);
    const [yStr, mStr] = target.split("-");
    setViewYear(Number(yStr));
    setViewMonth(Number(mStr));
  };

  const currentOffsetLabel = getTimezoneOffsetLabel(clientTimezone);

  const filteredTimezones = useMemo(() => {
    const q = tzSearch.trim().toLowerCase();
    if (!q) return CURATED_TIMEZONES;
    return CURATED_TIMEZONES.filter(
      (tz) =>
        tz.iana.toLowerCase().includes(q) ||
        tz.cityFa.includes(tzSearch.trim()) ||
        tz.countryFa.includes(tzSearch.trim()),
    );
  }, [tzSearch]);

  const selectedDateDisplayEn = useMemo(() => {
    if (!selectedDateKeyEn) return null;
    const [y, m, d] = selectedDateKeyEn.split("-").map(Number);
    if (!y || !m || !d) return selectedDateKeyEn;
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(new Date(Date.UTC(y, m - 1, d)));
  }, [selectedDateKeyEn]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-status-info-border bg-status-info-bg px-4 py-3">
        <div className="space-y-0.5 min-w-0">
          <span className="block text-xs text-status-info-ink">
            منطقه زمانی انتخابی شما
          </span>
          <p
            dir="ltr"
            className="text-sm sm:text-base font-semibold text-ink tabular-nums truncate"
          >
            {clientTimezone} ({currentOffsetLabel})
          </p>
        </div>

        <button
          type="button"
          onClick={() => setTzSheetOpen(true)}
          className="min-h-[44px] px-3.5 rounded-xl border border-border-strong bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle transition-colors"
        >
          تغییر منطقه زمانی
        </button>
      </div>

      {/* Explicit LTR container strictly required for pure Gregorian grid */}
      <div
        dir="ltr"
        className="rounded-2xl border border-border bg-subtle/40 p-3 sm:p-4 space-y-3"
      >
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="Previous month"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink hover:bg-subtle transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>

          <h3 className="text-base sm:text-lg font-semibold text-ink tabular-nums">
            {GREGORIAN_MONTHS[viewMonth - 1]} {viewYear}
          </h3>

          <button
            type="button"
            onClick={goNextMonth}
            aria-label="Next month"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink hover:bg-subtle transition-colors"
          >
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {GREGORIAN_WEEKDAYS.map((wd) => (
            <div
              key={wd}
              className="py-1.5 text-xs font-medium text-ink-muted"
            >
              {wd}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dayCells.map((cell, idx) => {
            if (!cell) {
              return <div key={`g-empty-${idx}`} className="min-h-[44px]" />;
            }

            const isSelected = cell.key === selectedDateKeyEn;
            return (
              <button
                key={cell.key}
                type="button"
                disabled={cell.isPast}
                onClick={() => onSelectDateKeyEn(cell.key)}
                aria-pressed={isSelected}
                aria-label={`${cell.key}${cell.hasSlots ? " available" : " no slots"}`}
                className={`relative min-h-[44px] rounded-xl flex flex-col items-center justify-center gap-0.5 text-sm sm:text-base tabular-nums transition-colors ${
                  cell.isPast
                    ? "text-ink-muted/40 cursor-not-allowed"
                    : isSelected
                      ? "bg-accent text-white font-semibold"
                      : cell.hasSlots
                        ? "bg-surface border border-border text-ink font-medium hover:border-accent hover:bg-accent-tint/60"
                        : "text-ink-muted hover:bg-surface/70"
                }`}
              >
                <span>{cell.day}</span>
                {!cell.isPast && cell.hasSlots ? (
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isSelected ? "bg-white" : "bg-accent"
                    }`}
                    aria-hidden="true"
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-3" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-sm sm:text-base font-semibold text-ink">
            ساعت‌های آزاد به وقت محلی شما
          </h4>
          {selectedDateDisplayEn ? (
            <span dir="ltr" className="text-xs sm:text-sm text-ink-muted tabular-nums">
              {selectedDateDisplayEn}
            </span>
          ) : null}
        </div>

        {slotsForSelectedDate.length === 0 ? (
          <div className="rounded-2xl border border-border bg-subtle/60 p-4 sm:p-5 text-center space-y-3">
            <p className="text-sm sm:text-base font-medium text-ink-secondary">
              در این تاریخ زمان خالی وجود ندارد
            </p>
            <button
              type="button"
              onClick={handleJumpNearestAvailable}
              className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              رفتن به نزدیک‌ترین زمان آزاد
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {slotsForSelectedDate.map((slot) => {
              const formatted = formatDualSlot(slot.isoUtc, clientTimezone);
              const isChosen = slot.id === selectedSlotId;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  aria-pressed={isChosen}
                  className={`min-h-[52px] px-3 py-2 rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${
                    isChosen
                      ? "border-accent bg-accent text-white"
                      : "border-border bg-surface text-ink hover:border-border-strong hover:bg-subtle/60"
                  }`}
                >
                  <span
                    dir="ltr"
                    className="text-sm sm:text-base font-bold tabular-nums"
                  >
                    {formatted.localTime24h}
                  </span>
                  <span
                    className={`text-xs tabular-nums ${
                      isChosen ? "text-white/90" : "text-ink-muted"
                    }`}
                  >
                    معادل {formatted.tehranTimeFa} تهران
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <SheetModal
        isOpen={tzSheetOpen}
        onClose={() => setTzSheetOpen(false)}
        title="انتخاب منطقه زمانی (IANA)"
        subtitle="ساعت جلسات به طور خودکار با اختلاف ساعت ایران همگام می‌شود"
      >
        <div className="space-y-4">
          <div>
            <label htmlFor="tz-search" className="sr-only">
              جستجوی شهر یا منطقه زمانی
            </label>
            <input
              id="tz-search"
              type="search"
              value={tzSearch}
              onChange={(e) => setTzSearch(e.target.value)}
              placeholder="جستجوی شهر یا منطقه زمانی (مثلاً Berlin یا تورنتو)"
              className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink placeholder:text-ink-muted"
            />
          </div>

          <div className="space-y-2">
            {filteredTimezones.length === 0 ? (
              <p className="text-sm text-ink-muted text-center py-6">
                منطقه زمانی متناسب با جستجوی شما یافت نشد.
              </p>
            ) : (
              filteredTimezones.map((tz) => {
                const offset = getTimezoneOffsetLabel(tz.iana);
                const isSelected = tz.iana === clientTimezone;
                return (
                  <button
                    key={tz.iana}
                    type="button"
                    onClick={() => {
                      onChangeTimezone(tz.iana);
                      setTzSheetOpen(false);
                      setTzSearch("");
                    }}
                    className={`w-full min-h-[48px] flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border text-start transition-colors ${
                      isSelected
                        ? "border-accent bg-accent-tint text-accent"
                        : "border-border bg-surface text-ink hover:bg-subtle"
                    }`}
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold">
                        {tz.cityFa} · {tz.countryFa}
                      </span>
                      <span
                        dir="ltr"
                        className="block text-xs text-ink-muted tabular-nums"
                      >
                        {tz.iana}
                      </span>
                    </div>
                    <span
                      dir="ltr"
                      className="shrink-0 text-xs sm:text-sm font-semibold tabular-nums"
                    >
                      {offset}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </SheetModal>
    </div>
  );
}
