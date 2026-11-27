"use client";

import { useEffect, useMemo, useState } from "react";
import {
  formatJalaliKey,
  formatJalaliLong,
  formatJalaliMonthYear,
  getJalaliMonthFirstWeekdaySat0,
  getJalaliMonthLength,
  JALALI_WEEKDAYS_FULL,
  JALALI_WEEKDAYS_SHORT,
  toPersianDigits,
} from "@/lib/jalali";
import type { TimeSlotOption } from "@/lib/mock-data";

interface JalaliCalendarProps {
  availableDates: Set<string>;
  selectedDateKey: string | null;
  onSelectDate: (dateKey: string) => void;
  slotsForSelectedDate: TimeSlotOption[];
  selectedSlotId: string | null;
  onSelectSlot: (slot: TimeSlotOption) => void;
  onJumpToNearestAvailable: () => void;
  initialYear?: number;
  initialMonth?: number;
  todayKey?: string;
}

export function JalaliCalendar({
  availableDates,
  selectedDateKey,
  onSelectDate,
  slotsForSelectedDate,
  selectedSlotId,
  onSelectSlot,
  onJumpToNearestAvailable,
  initialYear = 1405,
  initialMonth = 9,
  todayKey = "1405-09-06",
}: JalaliCalendarProps) {
  const [viewYear, setViewYear] = useState(initialYear);
  const [viewMonth, setViewMonth] = useState(initialMonth);

  useEffect(() => {
    setViewYear(initialYear);
    setViewMonth(initialMonth);
  }, [initialYear, initialMonth]);

  const monthLength = getJalaliMonthLength(viewYear, viewMonth);
  const firstWeekdaySat0 = getJalaliMonthFirstWeekdaySat0(viewYear, viewMonth);

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
    const blanks = Array.from({ length: firstWeekdaySat0 }, () => null);
    const days = Array.from({ length: monthLength }, (_, idx) => {
      const day = idx + 1;
      const key = formatJalaliKey(viewYear, viewMonth, day);
      return {
        day,
        key,
        isPast: key < todayKey,
        hasSlots: availableDates.has(key),
      };
    });
    return [...blanks, ...days];
  }, [availableDates, firstWeekdaySat0, monthLength, todayKey, viewMonth, viewYear]);

  const selectedLabel = useMemo(() => {
    if (!selectedDateKey) return null;
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(selectedDateKey);
    if (!match) return null;
    return formatJalaliLong(Number(match[1]), Number(match[2]), Number(match[3]));
  }, [selectedDateKey]);

  const handleSelectDateAndSyncMonth = (key: string) => {
    onSelectDate(key);
  };

  const handleJumpNearest = () => {
    onJumpToNearestAvailable();
    const sortedKeys = Array.from(availableDates).sort();
    const firstAvailable = sortedKeys.find((k) => k >= todayKey) ?? sortedKeys[0];
    if (firstAvailable) {
      const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(firstAvailable);
      if (match) {
        setViewYear(Number(match[1]));
        setViewMonth(Number(match[2]));
      }
    }
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-subtle/40 p-3 sm:p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goPrevMonth}
            aria-label="ماه قبل"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink hover:bg-subtle transition-colors"
          >
            <svg
              className="w-5 h-5 rtl:rotate-180"
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
            {formatJalaliMonthYear(viewYear, viewMonth)}
          </h3>

          <button
            type="button"
            onClick={goNextMonth}
            aria-label="ماه بعد"
            className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink hover:bg-subtle transition-colors"
          >
            <svg
              className="w-5 h-5 rtl:rotate-180"
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
          {JALALI_WEEKDAYS_SHORT.map((shortLabel, idx) => (
            <div
              key={shortLabel}
              aria-label={JALALI_WEEKDAYS_FULL[idx]}
              className="py-1.5 text-xs sm:text-sm font-medium text-ink-muted"
            >
              {shortLabel}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {dayCells.map((cell, idx) => {
            if (!cell) {
              return <div key={`empty-${idx}`} className="min-h-[44px]" />;
            }

            const isSelected = cell.key === selectedDateKey;
            return (
              <button
                key={cell.key}
                type="button"
                disabled={cell.isPast}
                onClick={() => handleSelectDateAndSyncMonth(cell.key)}
                aria-pressed={isSelected}
                aria-label={`${formatJalaliLong(viewYear, viewMonth, cell.day)}${
                  cell.hasSlots ? " — دارای زمان آزاد" : " — بدون زمان آزاد"
                }`}
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
                <span>{toPersianDigits(cell.day)}</span>
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
            {selectedLabel ? `زمان‌های آزاد برای ${selectedLabel}` : "یک تاریخ را انتخاب کنید"}
          </h4>
          <span className="text-xs text-ink-muted">ساعت رسمی تهران</span>
        </div>

        {slotsForSelectedDate.length === 0 ? (
          <div className="rounded-2xl border border-border bg-subtle/60 p-4 sm:p-5 text-center space-y-3">
            <p className="text-sm sm:text-base font-medium text-ink-secondary">
              در این تاریخ زمان خالی وجود ندارد
            </p>
            <button
              type="button"
              onClick={handleJumpNearest}
              className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              رفتن به نزدیک‌ترین زمان آزاد
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {slotsForSelectedDate.map((slot) => {
              const isChosen = slot.id === selectedSlotId;
              return (
                <button
                  key={slot.id}
                  type="button"
                  onClick={() => onSelectSlot(slot)}
                  aria-pressed={isChosen}
                  className={`min-h-[44px] px-3 py-2 rounded-xl border text-sm sm:text-base font-medium tabular-nums transition-colors ${
                    isChosen
                      ? "border-accent bg-accent text-white font-semibold"
                      : "border-border bg-surface text-ink hover:border-border-strong hover:bg-subtle/60"
                  }`}
                >
                  {slot.tehranTimeFa}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
