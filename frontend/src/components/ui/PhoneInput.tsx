"use client";

import { useState } from "react";
import { toWesternDigits } from "@/lib/jalali";
import { SheetModal } from "./SheetModal";

export interface CountryDialOption {
  code: string;
  dial: string;
  labelFa: string;
  placeholder: string;
}

export const COUNTRY_DIAL_OPTIONS: readonly CountryDialOption[] = [
  { code: "IR", dial: "+98", labelFa: "ایران", placeholder: "912 345 6789" },
  { code: "DE", dial: "+49", labelFa: "آلمان", placeholder: "151 2345 6789" },
  { code: "GB", dial: "+44", labelFa: "بریتانیا", placeholder: "7700 900123" },
  { code: "US", dial: "+1", labelFa: "آمریکا / کانادا", placeholder: "416 555 0149" },
  { code: "AE", dial: "+971", labelFa: "امارات", placeholder: "50 123 4567" },
  { code: "AU", dial: "+61", labelFa: "استرالیا", placeholder: "412 345 678" },
] as const;

interface PhoneInputProps {
  id: string;
  dialCode: string;
  nationalNumber: string;
  onDialCodeChange: (dial: string) => void;
  onNationalNumberChange: (val: string) => void;
  hasError?: boolean;
  describedBy?: string;
}

export function PhoneInput({
  id,
  dialCode,
  nationalNumber,
  onDialCodeChange,
  onNationalNumberChange,
  hasError = false,
  describedBy,
}: PhoneInputProps) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const activeCountry =
    COUNTRY_DIAL_OPTIONS.find((item) => item.dial === dialCode) ??
    COUNTRY_DIAL_OPTIONS[0];

  return (
    <>
      <div
        dir="ltr"
        className={`w-full max-w-full min-w-0 flex items-stretch rounded-xl border bg-surface overflow-hidden transition-colors ${
          hasError
            ? "border-status-rejected-ink focus-within:border-status-rejected-ink"
            : "border-border-strong focus-within:border-accent"
        }`}
      >
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          aria-label={`انتخاب پیش‌شماره کشور (فعلی ${activeCountry.dial})`}
          className="shrink-0 flex items-center gap-1.5 px-3 bg-subtle border-e border-border min-h-[48px] text-sm font-medium text-ink tabular-nums hover:bg-muted-surface/70 transition-colors"
        >
          <span className="inline-flex items-center justify-center rounded-md bg-surface border border-border px-1.5 py-0.5 text-[11px] font-semibold text-ink-secondary">
            {activeCountry.code}
          </span>
          <span>{activeCountry.dial}</span>
          <svg
            className="w-4 h-4 text-ink-muted"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <input
          id={id}
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="tel-national"
          value={nationalNumber}
          onChange={(e) => {
            const normalized = toWesternDigits(e.target.value).replace(/[^\d\s-]/g, "");
            onNationalNumberChange(normalized);
          }}
          placeholder={activeCountry.placeholder}
          aria-invalid={hasError}
          aria-describedby={describedBy}
          className="flex-1 min-w-0 bg-transparent px-3 py-3 text-base text-ink tabular-nums placeholder:text-ink-muted outline-none"
        />
      </div>

      <SheetModal
        isOpen={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="انتخاب پیش‌شماره کشور"
        maxWidthClass="max-w-sm"
      >
        <div className="space-y-2">
          {COUNTRY_DIAL_OPTIONS.map((option) => {
            const isSelected = option.dial === activeCountry.dial;
            return (
              <button
                key={option.dial}
                type="button"
                onClick={() => {
                  onDialCodeChange(option.dial);
                  setPickerOpen(false);
                }}
                className={`w-full min-h-[48px] flex items-center justify-between gap-3 px-4 rounded-xl border text-sm transition-colors ${
                  isSelected
                    ? "border-accent bg-accent-tint text-accent font-semibold"
                    : "border-border bg-surface text-ink hover:bg-subtle"
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <span className="inline-flex items-center justify-center rounded-md bg-subtle border border-border px-2 py-0.5 text-xs font-semibold text-ink-secondary">
                    {option.code}
                  </span>
                  <span>{option.labelFa}</span>
                </span>
                <span dir="ltr" className="tabular-nums font-semibold">
                  {option.dial}
                </span>
              </button>
            );
          })}
        </div>
      </SheetModal>
    </>
  );
}
