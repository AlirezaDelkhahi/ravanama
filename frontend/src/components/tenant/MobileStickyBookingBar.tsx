"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface MobileStickyBookingBarProps {
  bookHref: string;
  startingPriceLabel: string | null;
  startingPriceIsLtr?: boolean;
}

export function MobileStickyBookingBar({
  bookHref,
  startingPriceLabel,
  startingPriceIsLtr = false,
}: MobileStickyBookingBarProps) {
  const heroCtaRef = useRef<HTMLDivElement | null>(null);
  const [showSticky, setShowSticky] = useState(false);

  useEffect(() => {
    const target = heroCtaRef.current;
    if (!target || typeof IntersectionObserver === "undefined") {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        // Show sticky bottom bar only once the above-fold hero CTA has scrolled off top of viewport
        const scrolledPastHeroCta =
          !entry.isIntersecting && entry.boundingClientRect.top < 0;
        setShowSticky(scrolledPastHeroCta);
      },
      { threshold: 0 },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={heroCtaRef} className="lg:hidden pt-1">
        <Link
          href={bookHref}
          className="w-full min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
        >
          رزرو جلسه آنلاین
        </Link>
      </div>

      <div
        aria-hidden={!showSticky}
        className={`lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[var(--shadow-sticky)] flex items-center justify-between gap-3 transition-all duration-200 ${
          showSticky
            ? "translate-y-0 opacity-100 pointer-events-auto"
            : "translate-y-full opacity-0 pointer-events-none"
        }`}
      >
        <div className="min-w-0">
          <span className="block text-xs text-ink-muted">شروع تعرفه جلسه</span>
          {startingPriceLabel ? (
            <strong
              dir={startingPriceIsLtr ? "ltr" : "rtl"}
              className="block text-sm sm:text-base font-bold text-ink tabular-nums"
            >
              {startingPriceLabel}
            </strong>
          ) : null}
        </div>

        <Link
          href={bookHref}
          tabIndex={showSticky ? 0 : -1}
          className="shrink-0 min-h-[48px] inline-flex items-center justify-center px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
        >
          رزرو نوبت
        </Link>
      </div>
    </>
  );
}
