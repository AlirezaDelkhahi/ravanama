"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Globe, MapPin, Search, ShieldCheck, Sparkles } from "lucide-react";
import { formatCurrency, toPersianDigits } from "@/lib/jalali";
import type { TherapistProfile } from "@/lib/mock-data";

interface TherapistsDirectoryClientProps {
  therapists: TherapistProfile[];
  initialTopic?: string;
}

export function TherapistsDirectoryClient({
  therapists,
  initialTopic,
}: TherapistsDirectoryClientProps) {
  const allFocusOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const therapist of therapists) {
      for (const area of therapist.focusAreas) {
        unique.add(area);
      }
    }
    return Array.from(unique);
  }, [therapists]);

  const trimmedInitialTopic = initialTopic?.trim() ?? "";
  const initialFocusMatch = allFocusOptions.includes(trimmedInitialTopic)
    ? trimmedInitialTopic
    : "all";
  const initialSearchValue =
    trimmedInitialTopic && initialFocusMatch === "all" ? trimmedInitialTopic : "";

  const [searchQuery, setSearchQuery] = useState(initialSearchValue);
  const [trackFilter, setTrackFilter] = useState<"all" | "iran" | "abroad">("all");
  const [focusFilter, setFocusFilter] = useState<string>(initialFocusMatch);

  const filteredTherapists = useMemo(() => {
    const q = searchQuery.trim();
    return therapists.filter((therapist) => {
      if (trackFilter !== "all") {
        const supportsTrack = therapist.offerings.some(
          (o) => o.track === trackFilter,
        );
        if (!supportsTrack) return false;
      }
      if (
        focusFilter !== "all" &&
        !therapist.focusAreas.includes(focusFilter)
      ) {
        return false;
      }
      if (q.length > 0) {
        const haystack = `${therapist.displayName} ${therapist.subtitle} ${therapist.focusAreas.join(" ")}`;
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [focusFilter, searchQuery, therapists, trackFilter]);

  return (
    <div className="space-y-6">
      {/* Filter Controls */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
          <div className="sm:col-span-6">
            <label htmlFor="directory-search" className="sr-only">
              جستجوی نام درمانگر یا حوزه تخصصی
            </label>
            <div className="flex items-center rounded-xl border border-border-strong bg-surface focus-within:border-accent overflow-hidden">
              <span className="ps-3.5 text-ink-muted shrink-0" aria-hidden="true">
                <Search className="w-4 h-4" />
              </span>
              <input
                id="directory-search"
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="جستجوی نام درمانگر یا موضوع..."
                className="flex-1 min-w-0 min-h-[48px] px-3 bg-transparent text-base text-ink placeholder:text-ink-muted outline-none"
              />
            </div>
          </div>

          <div className="sm:col-span-6 grid grid-cols-3 gap-2">
            {(
              [
                { id: "all", label: "همه مسیرها", icon: Sparkles },
                { id: "iran", label: "داخل ایران", icon: MapPin },
                { id: "abroad", label: "خارج از ایران", icon: Globe },
              ] as const
            ).map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setTrackFilter(opt.id)}
                  className={`min-h-[48px] px-2 rounded-xl border text-xs sm:text-sm font-medium inline-flex items-center justify-center gap-1.5 transition-colors ${
                    trackFilter === opt.id
                      ? "border-accent bg-accent-tint text-accent font-semibold"
                      : "border-border bg-surface text-ink-secondary hover:bg-subtle"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setFocusFilter("all")}
            className={`min-h-[44px] px-3.5 py-2 rounded-full border text-xs sm:text-sm transition-colors ${
              focusFilter === "all"
                ? "border-accent bg-accent-tint text-accent font-medium"
                : "border-border bg-subtle text-ink-secondary hover:text-ink"
            }`}
          >
            همه تخصص‌ها
          </button>
          {allFocusOptions.slice(0, 8).map((area) => (
            <button
              key={area}
              type="button"
              onClick={() =>
                setFocusFilter((prev) => (prev === area ? "all" : area))
              }
              className={`min-h-[44px] px-3.5 py-2 rounded-full border text-xs sm:text-sm transition-colors ${
                focusFilter === area
                  ? "border-accent bg-accent-tint text-accent font-medium"
                  : "border-border bg-subtle text-ink-secondary hover:text-ink"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      {/* Directory Grid */}
      {filteredTherapists.length === 0 ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-3">
          <p className="text-base font-medium text-ink-secondary">
            درمانگری با این فیلتر یافت نشد.
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setTrackFilter("all");
              setFocusFilter("all");
            }}
            className="min-h-[44px] px-4 rounded-xl border border-border-strong bg-surface text-sm font-medium text-ink"
          >
            پاک کردن فیلترها
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredTherapists.map((therapist) => {
            const iranStarting = therapist.offerings.find(
              (o) => o.track === "iran",
            );
            const abroadStarting = therapist.offerings.find(
              (o) => o.track === "abroad",
            );

            return (
              <article
                key={therapist.id}
                className="bg-surface border border-border rounded-2xl p-5 sm:p-6 flex flex-col justify-between gap-5"
              >
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <Image
                      src={therapist.avatarUrl}
                      alt={therapist.displayName}
                      width={64}
                      height={64}
                      className="w-16 h-16 rounded-full object-cover border border-border shrink-0"
                    />
                    <div className="min-w-0 space-y-1">
                      <h2 className="text-lg font-bold text-ink line-clamp-2">
                        {therapist.displayName}
                      </h2>
                      <p className="text-sm text-ink-secondary line-clamp-2">
                        {therapist.subtitle}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 pt-0.5 text-xs text-ink-muted tabular-nums">
                        <span className="inline-flex items-center gap-1 text-accent font-medium">
                          <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                          <span>پروانه {therapist.licenseNumber}</span>
                        </span>
                        <span>·</span>
                        <span>{toPersianDigits(therapist.experienceYears)} سال سابقه</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm leading-[1.7] text-ink-secondary line-clamp-2">
                    {therapist.bio}
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {therapist.focusAreas.slice(0, 4).map((area) => (
                      <span
                        key={area}
                        className="rounded-full bg-subtle border border-border text-ink-secondary px-3 py-1 text-xs"
                      >
                        {area}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-border">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs sm:text-sm">
                    {iranStarting ? (
                      <span className="text-ink-secondary tabular-nums">
                        داخل ایران از{" "}
                        <strong className="text-ink">
                          {formatCurrency(
                            iranStarting.priceAmount,
                            iranStarting.currency,
                          )}
                        </strong>
                      </span>
                    ) : null}
                    {abroadStarting ? (
                      <span className="text-ink-secondary tabular-nums">
                        خارج از ایران از{" "}
                        <strong dir="ltr" className="text-ink">
                          {formatCurrency(
                            abroadStarting.priceAmount,
                            abroadStarting.currency,
                          )}
                        </strong>
                      </span>
                    ) : null}
                  </div>

                  <div className="flex gap-2.5">
                    <Link
                      href={`/${therapist.slug}`}
                      className="flex-1 min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
                    >
                      مشاهده پروفایل
                    </Link>
                    <Link
                      href={`/${therapist.slug}/book`}
                      className="flex-1 min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                    >
                      رزرو جلسه
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
