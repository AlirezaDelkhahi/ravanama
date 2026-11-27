"use client";

import { useState } from "react";

interface CopyFieldProps {
  label: string;
  value: string;
  monospace?: boolean;
  hint?: string;
}

export function CopyField({
  label,
  value,
  monospace = false,
  hint,
}: CopyFieldProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
    }

    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-xl border border-border bg-subtle/60 p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs sm:text-sm font-medium text-ink-secondary">
          {label}
        </span>
        {hint ? <span className="text-xs text-ink-muted">{hint}</span> : null}
      </div>

      <div className="flex items-center justify-between gap-2.5">
        <div className="flex-1 min-w-0 text-start">
          <span
            dir="ltr"
            className={`inline-block max-w-full text-start text-ink font-semibold tabular-nums select-all break-all [overflow-wrap:anywhere] ${
              monospace ? "font-mono text-sm" : "text-sm sm:text-base"
            }`}
          >
            {value}
          </span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className={`shrink-0 min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-medium inline-flex items-center gap-1.5 transition-colors ${
            copied
              ? "border-status-confirmed-border bg-status-confirmed-bg text-status-confirmed-ink"
              : "border-border-strong bg-surface text-ink hover:bg-subtle"
          }`}
        >
          {copied ? (
            <>
              <svg
                className="w-4 h-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M16.704 5.29a1 1 0 010 1.42l-7.2 7.2a1 1 0 01-1.415 0l-3.6-3.6a1 1 0 111.414-1.42l2.893 2.894 6.493-6.494a1 1 0 011.415 0z"
                  clipRule="evenodd"
                />
              </svg>
              <span>کپی شد</span>
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4 shrink-0 text-ink-muted"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              <span>کپی</span>
            </>
          )}
        </button>
      </div>

      <span className="sr-only" aria-live="polite">
        {copied ? `${label} در حافظه کپی شد` : ""}
      </span>
    </div>
  );
}
