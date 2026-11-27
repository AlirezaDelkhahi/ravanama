"use client";

import { useEffect, useId, type ReactNode } from "react";

interface SheetModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  children: ReactNode;
}

export function SheetModal({
  isOpen,
  onClose,
  title,
  subtitle,
  maxWidthClass = "max-w-lg",
  children,
}: SheetModalProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0 bg-ink/45 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className={`relative z-10 w-full ${maxWidthClass} max-h-[90dvh] flex flex-col bg-surface border border-border rounded-t-2xl sm:rounded-2xl shadow-[var(--shadow-popover)] overflow-hidden`}
      >
        <div className="flex items-start justify-between gap-3 px-4 sm:px-6 py-4 border-b border-border bg-canvas/60">
          <div className="space-y-0.5 min-w-0">
            <h2 id={titleId} className="text-base sm:text-lg font-semibold text-ink">
              {title}
            </h2>
            {subtitle ? (
              <p className="text-xs sm:text-sm text-ink-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="بستن پنجره"
            className="shrink-0 min-h-[44px] min-w-[44px] -me-2 inline-flex items-center justify-center rounded-xl text-ink-secondary hover:bg-subtle hover:text-ink transition-colors"
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
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 sm:px-6 pt-4 pb-[calc(20px+env(safe-area-inset-bottom))] sm:pb-6">
          {children}
        </div>
      </div>
    </div>
  );
}
