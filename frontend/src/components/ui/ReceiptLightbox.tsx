"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { toPersianDigits } from "@/lib/jalali";

interface ReceiptLightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  title?: string;
  metadataLine?: ReactNode;
}

export function ReceiptLightbox({
  isOpen,
  onClose,
  imageUrl,
  title = "بررسی تصویر رسید واریز",
  metadataLine,
}: ReceiptLightboxProps) {
  const titleId = useId();
  const [zoom, setZoom] = useState<100 | 200>(100);
  const [rotation, setRotation] = useState<0 | 90 | 180 | 270>(0);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number }>({
    width: 480,
    height: 680,
  });

  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setZoom(100);
        setRotation(0);
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const handleClose = () => {
    setZoom(100);
    setRotation(0);
    onClose();
  };

  if (!isOpen) return null;

  // Compute proportional base display dimensions so 100% fits cleanly and 200% expands real scroll box.
  const fitScale = Math.min(460 / naturalSize.width, 540 / naturalSize.height, 1);
  const baseW = Math.max(240, Math.round(naturalSize.width * fitScale));
  const baseH = Math.max(240, Math.round(naturalSize.height * fitScale));

  const scale = zoom / 100;
  const imgW = Math.round(baseW * scale);
  const imgH = Math.round(baseH * scale);
  const isQuarterTurn = rotation === 90 || rotation === 270;
  const boxW = isQuarterTurn ? imgH : imgW;
  const boxH = isQuarterTurn ? imgW : imgH;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        className="fixed inset-0 bg-ink/65 backdrop-blur-[2px]"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div className="relative z-10 w-full max-w-4xl h-[90dvh] flex flex-col bg-surface border border-border rounded-2xl shadow-[var(--shadow-popover)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border bg-canvas">
          <div className="min-w-0">
            <h2 id={titleId} className="text-sm sm:text-base font-semibold text-ink truncate">
              {title}
            </h2>
            {metadataLine ? (
              <p className="text-xs text-ink-muted text-start break-words">{metadataLine}</p>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setZoom((prev) => (prev === 100 ? 200 : 100))}
              aria-pressed={zoom === 200}
              className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 tabular-nums transition-colors ${
                zoom === 200
                  ? "border-accent bg-accent-tint text-accent"
                  : "border-border-strong bg-surface text-ink hover:bg-subtle"
              }`}
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
              </svg>
              <span>{zoom === 200 ? "نمای ۱۰۰٪" : "بزرگ‌نمایی ۲۰۰٪"}</span>
            </button>

            <button
              type="button"
              onClick={() =>
                setRotation((prev) => ((prev + 90) % 360) as 0 | 90 | 180 | 270)
              }
              className="min-h-[44px] px-3 rounded-xl border border-border-strong bg-surface text-ink text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 tabular-nums hover:bg-subtle transition-colors"
            >
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 11-3-6.7L21 8" />
                <path d="M21 3v5h-5" />
              </svg>
              <span>چرخش ۹۰° ({toPersianDigits(rotation)}°)</span>
            </button>

            <button
              type="button"
              onClick={handleClose}
              aria-label="بستن پیش‌نمایش رسید"
              className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink-secondary hover:bg-subtle hover:text-ink transition-colors"
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
        </div>

        {/* Flex + m-auto on explicit rotated/zoomed bounding box exposes 100% of overflow without negative clipping */}
        <div
          dir="ltr"
          className="flex-1 overflow-auto bg-subtle/60 p-4 sm:p-6 flex"
        >
          <div
            className="relative shrink-0 m-auto"
            style={{ width: `${boxW}px`, height: `${boxH}px` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={title}
              onLoad={(e) => {
                const nw = e.currentTarget.naturalWidth;
                const nh = e.currentTarget.naturalHeight;
                if (nw > 0 && nh > 0) {
                  setNaturalSize({ width: nw, height: nh });
                }
              }}
              style={{
                width: `${imgW}px`,
                height: `${imgH}px`,
                maxWidth: "none",
                maxHeight: "none",
                position: "absolute",
                inset: 0,
                margin: "auto",
                transform: `rotate(${rotation}deg)`,
                transformOrigin: "center center",
              }}
              className="rounded-xl border border-border bg-surface transition-transform duration-200 select-none"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
