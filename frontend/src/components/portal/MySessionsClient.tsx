"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Download,
  Mail,
  ShieldCheck,
  Smartphone,
  Video,
} from "lucide-react";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SheetModal } from "@/components/ui/SheetModal";
import { StatusBadge, statusVariantFromBooking } from "@/components/ui/StatusBadge";
import {
  ApiError,
  getAuthMe,
  issueOtp,
  listClientBookings,
  logout,
  submitBookingReview,
  verifyOtp,
  type ApiBookingDTO,
  type ApiUserDTO,
} from "@/lib/api";
import { downloadIcsFile } from "@/lib/ics";
import {
  dateToTehranJalali,
  formatCurrency,
  formatJalaliLong,
  toPersianDigits,
  toWesternDigits,
} from "@/lib/jalali";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";
import { formatDualSlot, formatTime24InZone } from "@/lib/timezone";
import type { ClientSessionRecord } from "@/lib/types";

const PLATFORM_HOSTNAMES = new Set([
  "ravannama.ir",
  "www.ravannama.ir",
  "localhost",
  "127.0.0.1",
]);

function resolveClientTenantMode(): TenantMode {
  if (typeof window === "undefined") return "platform";
  const host = window.location.hostname.toLowerCase().trim();
  if (!host || PLATFORM_HOSTNAMES.has(host)) return "platform";
  return "custom";
}

function resolveAvatarUrl(key: string | null | undefined): string {
  if (!key) return "/images/therapist-sara.jpg";
  const trimmed = key.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return "/images/therapist-sara.jpg";
}

function formatBookingDateParts(b: ApiBookingDTO): {
  dateTimeJalaliLabel: string;
  dateTimePrimaryLtr?: string;
  dateTimeSecondaryFa?: string;
} {
  const start = new Date(b.slot_start);
  if (Number.isNaN(start.getTime())) {
    return { dateTimeJalaliLabel: b.slot_start };
  }
  if (b.track === "abroad") {
    const dual = formatDualSlot(b.slot_start, b.client_timezone || "Europe/Berlin");
    const primaryLtr = `${dual.dateLabelEn} · ${dual.localTime24h}`;
    const secondaryFa = `معادل ${dual.tehranTimeFa} تهران`;
    return {
      dateTimeJalaliLabel: `${primaryLtr} (${secondaryFa})`,
      dateTimePrimaryLtr: primaryLtr,
      dateTimeSecondaryFa: secondaryFa,
    };
  }
  const j = dateToTehranJalali(start);
  const timeFa = toPersianDigits(formatTime24InZone(start, "Asia/Tehran"));
  return {
    dateTimeJalaliLabel: `${formatJalaliLong(j.jy, j.jm, j.jd)} · ساعت ${timeFa} به وقت تهران`,
  };
}

function mapApiBookingToSession(b: ApiBookingDTO): ClientSessionRecord {
  const startMs = new Date(b.slot_start).getTime();
  const endMs = new Date(b.slot_end).getTime();
  const durationMinutes =
    Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs
      ? Math.round((endMs - startMs) / 60_000)
      : 50;

  const canExposeJoinUrl =
    (b.status === "confirmed" || b.status === "completed") &&
    typeof b.call_join_url === "string" &&
    b.call_join_url.startsWith("https://");

  const dateParts = formatBookingDateParts(b);

  return {
    id: b.id,
    referenceCode: b.reference_code,
    therapistSlug: b.therapist_slug || "dr-sara-ahmadi",
    therapistName: b.therapist_name || "درمانگر روان‌نما",
    therapistSubtitle: b.therapist_subtitle || "",
    therapistAvatarUrl: resolveAvatarUrl(b.therapist_avatar_key),
    serviceOfferingId: b.service_offering_id,
    serviceTitle:
      b.service_title ||
      (b.track === "iran" ? "جلسه مشاوره آنلاین" : "Online Therapy Session"),
    track: b.track,
    clientTimezone: b.client_timezone,
    startIsoUtc: b.slot_start,
    durationMinutes,
    dateTimeJalaliLabel: dateParts.dateTimeJalaliLabel,
    dateTimePrimaryLtr: dateParts.dateTimePrimaryLtr,
    dateTimeSecondaryFa: dateParts.dateTimeSecondaryFa,
    amount: b.amount_expected,
    currency: b.currency,
    status: b.status,
    callJoinUrl: canExposeJoinUrl ? b.call_join_url ?? undefined : undefined,
    rejectionReason: b.rejection_reason ?? undefined,
    clientNote: b.client_note || undefined,
    hasReview: Boolean(b.has_review),
  };
}

export function MySessionsClient() {
  const [tenantMode, setTenantMode] = useState<TenantMode>("platform");
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<ApiUserDTO | null>(null);
  const [channel, setChannel] = useState<"phone" | "email">("phone");
  const [dialCode, setDialCode] = useState("+98");
  const [phoneNational, setPhoneNational] = useState("");
  const [emailInput, setEmailInput] = useState("");

  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(120);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [sessions, setSessions] = useState<ClientSessionRecord[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Verified-only review modal
  const [reviewTarget, setReviewTarget] = useState<ClientSessionRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  const loadBookings = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError(null);
    try {
      const res = await listClientBookings();
      setSessions((res.bookings ?? []).map(mapApiBookingToSession));
    } catch {
      setSessionsError("دریافت فهرست نوبت‌ها با خطا مواجه شد. لطفاً صفحه را تازه کنید.");
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setTenantMode(resolveClientTenantMode());
    (async () => {
      try {
        const me = await getAuthMe();
        if (!active) return;
        setAuthUser(me.user);
        await loadBookings();
      } catch {
        if (active) setAuthUser(null);
      } finally {
        if (active) setCheckingAuth(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadBookings]);

  useEffect(() => {
    if (!otpRequested || otpSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setOtpSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpRequested, otpSecondsLeft]);

  const targetDestination =
    channel === "phone"
      ? `${dialCode}${toWesternDigits(phoneNational).replace(/\D/g, "").replace(/^0/, "")}`
      : emailInput.trim().toLowerCase();

  const handleRequestOtp = async () => {
    if (channel === "phone") {
      const digits = toWesternDigits(phoneNational).replace(/\D/g, "");
      if (digits.length < 8) {
        setAuthError("لطفاً شماره موبایل معتبر وارد کنید.");
        return;
      }
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim())) {
      setAuthError("لطفاً نشانی ایمیل معتبر وارد کنید.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      await issueOtp({
        destination: targetDestination,
        channel: channel === "phone" ? "sms" : "email",
        purpose: "login",
      });
      setOtpRequested(true);
      setOtpSecondsLeft(120);
      setOtpCode("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setAuthError("تعداد درخواست کد تایید بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.");
      } else {
        setAuthError("ارسال کد تایید با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleVerifyOtp = async () => {
    const normalized = toWesternDigits(otpCode).replace(/\D/g, "");
    if (normalized.length !== 6) {
      setAuthError("لطفاً کد ۶ رقمی ارسال‌شده را کامل وارد کنید.");
      return;
    }

    setAuthBusy(true);
    setAuthError(null);
    try {
      const res = await verifyOtp({
        destination: targetDestination,
        channel: channel === "phone" ? "sms" : "email",
        purpose: "login",
        code: normalized,
      });
      setAuthUser(res.user);
      setOtpRequested(false);
      setOtpCode("");
      await loadBookings();
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setAuthError("تعداد تلاش‌های اشتباه بیش از حد مجاز است. لطفاً کد جدید دریافت کنید.");
      } else if (err instanceof ApiError && err.status === 401) {
        setAuthError("کد تایید نادرست یا منقضی شده است.");
      } else {
        setAuthError("خطا در ورود به پورتال. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // Clear local state regardless
    }
    setAuthUser(null);
    setSessions([]);
    setOtpRequested(false);
    setOtpCode("");
    setAuthError(null);
  };

  const handleSubmitVerifiedReview = async () => {
    if (!reviewTarget || reviewComment.trim().length < 5) return;
    setReviewSubmitting(true);
    setReviewError(null);
    try {
      await submitBookingReview(reviewTarget.id, {
        client_label:
          reviewTarget.track === "abroad"
            ? "مراجع خارج از کشور"
            : "مراجع تاییدشده",
        rating: reviewRating,
        comment: reviewComment.trim(),
      });
      setSessions((prev) =>
        prev.map((s) => (s.id === reviewTarget.id ? { ...s, hasReview: true } : s)),
      );
      setReviewNotice(
        `بازخورد تاییدشده شما برای جلسه ${reviewTarget.therapistName} ثبت شد.`,
      );
      setReviewTarget(null);
      setReviewComment("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSessions((prev) =>
          prev.map((s) => (s.id === reviewTarget.id ? { ...s, hasReview: true } : s)),
        );
        setReviewTarget(null);
      } else {
        setReviewError("ثبت بازخورد با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (checkingAuth) {
    return (
      <section className="max-w-lg mx-auto bg-surface border border-border rounded-2xl p-8 text-center text-sm text-ink-secondary">
        در حال بررسی نشست کاربری...
      </section>
    );
  }

  if (!authUser) {
    return (
      <section className="w-full max-w-full sm:max-w-lg mx-auto min-w-0 bg-surface border border-border rounded-2xl p-5 sm:p-8 space-y-6">
        <div className="space-y-2.5">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint border border-border px-3 py-1 text-xs font-medium text-accent">
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            <span>ورود امن با کد یک‌بارمصرف</span>
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            پورتال پیگیری نوبت مراجع
          </h1>
          <p className="text-sm sm:text-base text-ink-secondary leading-[1.7]">
            برای مشاهده لینک جلسه تاییدشده، پیگیری وضعیت رسید یا رزرو مجدد در صورت نیاز به اصلاح، با شماره موبایل یا ایمیل خود وارد شوید.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              setChannel("phone");
              setOtpRequested(false);
              setAuthError(null);
            }}
            className={`min-h-[48px] rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
              channel === "phone"
                ? "border-accent bg-accent-tint text-accent font-semibold"
                : "border-border bg-surface text-ink hover:bg-subtle"
            }`}
          >
            <Smartphone className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>شماره موبایل</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setChannel("email");
              setOtpRequested(false);
              setAuthError(null);
            }}
            className={`min-h-[48px] rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
              channel === "email"
                ? "border-accent bg-accent-tint text-accent font-semibold"
                : "border-border bg-surface text-ink hover:bg-subtle"
            }`}
          >
            <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>ایمیل</span>
          </button>
        </div>

        {!otpRequested ? (
          <div className="w-full max-w-full min-w-0 space-y-4">
            {channel === "phone" ? (
              <div className="w-full max-w-full min-w-0 space-y-1.5">
                <label htmlFor="portal-phone" className="block text-sm font-medium text-ink">
                  شماره موبایل ثبت‌شده هنگام رزرو
                </label>
                <PhoneInput
                  id="portal-phone"
                  dialCode={dialCode}
                  nationalNumber={phoneNational}
                  onDialCodeChange={setDialCode}
                  onNationalNumberChange={setPhoneNational}
                  hasError={Boolean(authError)}
                />
              </div>
            ) : (
              <div className="w-full max-w-full min-w-0 space-y-1.5">
                <label htmlFor="portal-email" className="block text-sm font-medium text-ink">
                  ایمیل ثبت‌شده هنگام رزرو
                </label>
                <input
                  id="portal-email"
                  type="email"
                  dir="ltr"
                  inputMode="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink tabular-nums"
                />
              </div>
            )}

            {authError ? (
              <p role="alert" className="text-[13px] text-status-rejected-ink">
                {authError}
              </p>
            ) : null}

            <button
              type="button"
              disabled={authBusy}
              onClick={handleRequestOtp}
              className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
            >
              {authBusy ? "در حال ارسال کد..." : "دریافت کد تایید یک‌بارمصرف"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl bg-subtle p-3.5 text-sm space-y-1 text-start">
              <span className="block text-xs text-ink-muted">کد ۶ رقمی ارسال شد به:</span>
              <p className="text-start">
                <span dir="ltr" className="inline-block font-semibold text-ink tabular-nums">
                  {targetDestination}
                </span>
              </p>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="portal-otp-input" className="block text-sm font-medium text-ink">
                کد تایید ۶ رقمی
              </label>
              <input
                id="portal-otp-input"
                type="text"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otpCode}
                onChange={(e) => {
                  setOtpCode(toWesternDigits(e.target.value).replace(/\D/g, "").slice(0, 6));
                  setAuthError(null);
                }}
                placeholder="123456"
                className="w-full min-h-[48px] px-4 rounded-xl border border-border-strong bg-surface text-center text-lg font-bold tracking-[0.25em] text-ink tabular-nums"
              />
              {authError ? (
                <p role="alert" className="text-[13px] text-status-rejected-ink text-center">
                  {authError}
                </p>
              ) : null}
            </div>

            <div className="flex items-center justify-between text-xs sm:text-sm" aria-live="polite">
              <span className="text-ink-muted tabular-nums">
                {otpSecondsLeft > 0
                  ? `اعتبار کد: ${toPersianDigits(otpSecondsLeft)} ثانیه`
                  : "مهلت کد به پایان رسید"}
              </span>
              <button
                type="button"
                disabled={otpSecondsLeft > 0 || authBusy}
                onClick={() => void handleRequestOtp()}
                className="min-h-[44px] text-accent font-medium disabled:text-ink-muted"
              >
                ارسال مجدد
              </button>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOtpRequested(false)}
                className="min-h-[48px] px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium"
              >
                ویرایش نشانی
              </button>
              <button
                type="button"
                disabled={authBusy}
                onClick={handleVerifyOtp}
                className="flex-1 min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
              >
                {authBusy ? "در حال ورود..." : "ورود به نوبت‌های من"}
              </button>
            </div>
          </div>
        )}
      </section>
    );
  }

  const authDisplay = authUser.phone_e164 || authUser.email || authUser.full_name;
  const upcomingSessions = sessions.filter((s) => s.status !== "completed");
  const pastSessions = sessions.filter((s) => s.status === "completed");

  return (
    <div className="space-y-8">
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-ink">نوبت‌های من</h1>
          <p className="text-xs sm:text-sm text-ink-muted">
            حساب تاییدشده:{" "}
            <span dir="ltr" className="font-medium text-ink tabular-nums">
              {authDisplay}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="min-h-[44px] px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
        >
          خروج از پورتال
        </button>
      </div>

      {reviewNotice ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-status-confirmed-border bg-status-confirmed-bg px-4 py-3 text-sm text-status-confirmed-ink"
        >
          {reviewNotice}
        </div>
      ) : null}

      {sessionsError ? (
        <div
          role="alert"
          className="rounded-2xl border border-status-rejected-border bg-status-rejected-bg px-4 py-3 text-sm text-status-rejected-ink flex items-center justify-between gap-2"
        >
          <span>{sessionsError}</span>
          <button
            type="button"
            onClick={() => void loadBookings()}
            className="min-h-[44px] px-3 rounded-xl border border-status-rejected-border bg-surface text-xs font-medium"
          >
            تلاش مجدد
          </button>
        </div>
      ) : null}

      {sessionsLoading ? (
        <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-ink-secondary">
          در حال بارگذاری نوبت‌های شما...
        </div>
      ) : (
        <>
          {/* Section 1: Upcoming / Active / Rejected Sessions */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-ink">نوبت‌های پیش‌رو و پیگیری‌ها</h2>

            {upcomingSessions.length === 0 ? (
              <div className="bg-surface border border-border rounded-2xl p-6 text-center space-y-3">
                <p className="text-sm text-ink-secondary">
                  هنوز نوبت پیش‌رویی برای شما ثبت نشده است.
                </p>
                <Link
                  href="/therapists"
                  className="min-h-[44px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  یافتن درمانگر و رزرو جلسه
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                {upcomingSessions.map((session) => {
                  const badge = statusVariantFromBooking(session.status);
                  const therapistProfileHref = buildTenantHref("/", {
                    mode: tenantMode,
                    slug: session.therapistSlug,
                  });
                  const rebookHref = buildTenantHref(
                    `/book?rebook=${encodeURIComponent(session.id)}`,
                    { mode: tenantMode, slug: session.therapistSlug },
                  );

                  return (
                    <article
                      key={session.id}
                      className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="flex items-start gap-3.5 min-w-0">
                          <Image
                            src={session.therapistAvatarUrl}
                            alt={session.therapistName}
                            width={52}
                            height={52}
                            className="w-12 h-12 sm:w-[52px] sm:h-[52px] rounded-full object-cover border border-border shrink-0"
                          />
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge variant={badge.variant} label={badge.label} />
                              <span className="text-xs font-mono text-ink-muted">
                                <span dir="ltr" className="inline-block tabular-nums">
                                  {session.referenceCode}
                                </span>
                              </span>
                            </div>
                            <h3 className="text-base sm:text-lg font-bold text-ink pt-0.5">
                              <Link
                                href={therapistProfileHref}
                                className="hover:text-accent transition-colors"
                              >
                                {session.therapistName}
                              </Link>
                            </h3>
                            <p className="text-sm text-ink-secondary">
                              <bdi dir="auto">{session.serviceTitle}</bdi> ·{" "}
                              <span className="tabular-nums">
                                {toPersianDigits(session.durationMinutes)} دقیقه
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border sm:border-t-0 sm:pt-0 sm:block sm:text-end shrink-0">
                          <span className="text-xs text-ink-muted sm:hidden">مبلغ جلسه</span>
                          <span
                            dir={session.currency === "IRT" ? "rtl" : "ltr"}
                            className="inline-block text-base font-bold text-accent tabular-nums"
                          >
                            {formatCurrency(session.amount, session.currency)}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-xl bg-subtle/60 border border-border px-4 py-3 text-sm text-ink tabular-nums flex items-center gap-2">
                        {session.status === "confirmed" ? (
                          <CheckCircle2 className="w-4 h-4 text-status-confirmed-ink shrink-0" aria-hidden="true" />
                        ) : session.status === "pending_verification" || session.status === "held" ? (
                          <Clock className="w-4 h-4 text-status-pending-ink shrink-0" aria-hidden="true" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-status-rejected-ink shrink-0" aria-hidden="true" />
                        )}
                        {session.track === "abroad" && session.dateTimePrimaryLtr ? (
                          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-start">
                            <span dir="ltr" className="inline-block tabular-nums">
                              {session.dateTimePrimaryLtr}
                            </span>
                            {session.dateTimeSecondaryFa ? (
                              <span className="text-ink-secondary">
                                ({session.dateTimeSecondaryFa})
                              </span>
                            ) : null}
                          </span>
                        ) : (
                          <span>{session.dateTimeJalaliLabel}</span>
                        )}
                      </div>

                      {/* Confirmed Call Link + .ics */}
                      {session.status === "confirmed" &&
                      session.callJoinUrl?.startsWith("https://") ? (
                        <div className="flex flex-col sm:flex-row gap-3 pt-1">
                          <a
                            href={session.callJoinUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 min-h-[48px] inline-flex items-center justify-center gap-2 px-5 rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover transition-colors"
                          >
                            <Video className="w-4 h-4 shrink-0" aria-hidden="true" />
                            <span>ورود به جلسه آنلاین</span>
                          </a>
                          <button
                            type="button"
                            onClick={() =>
                              downloadIcsFile(`ravannama-${session.referenceCode}.ics`, {
                                uid: session.referenceCode,
                                title: `جلسه مشاوره با ${session.therapistName}`,
                                description: session.serviceTitle,
                                startIsoUtc: session.startIsoUtc,
                                durationMinutes: session.durationMinutes,
                                location: session.callJoinUrl,
                              })
                            }
                            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
                          >
                            <Download className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
                            <span>افزودن به تقویم (.ics)</span>
                          </button>
                        </div>
                      ) : null}

                      {/* Pending Verification Notice */}
                      {session.status === "pending_verification" ? (
                        <div className="rounded-xl border border-status-pending-border bg-status-pending-bg px-4 py-3 text-sm text-status-pending-ink">
                          رسید شما در حال بررسی توسط درمانگر است. پس از تایید، دکمه ورود به جلسه آنلاین در همین بخش فعال می‌شود.
                        </div>
                      ) : null}

                      {/* Rejected Receipt Recovery */}
                      {session.status === "rejected" ? (
                        <div className="space-y-3">
                          <div
                            role="alert"
                            className="rounded-xl border border-status-rejected-border bg-status-rejected-bg px-4 py-3.5 text-sm text-status-rejected-ink space-y-1"
                          >
                            <span className="block font-semibold">
                              دلیل رد رسید توسط درمانگر:
                            </span>
                            <p>{session.rejectionReason}</p>
                          </div>

                          <Link
                            href={rebookHref}
                            className="w-full sm:w-auto min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover transition-colors"
                          >
                            رزرو و آپلود مجدد
                          </Link>
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          {/* Section 2: Past History + Verified Review */}
          <section className="space-y-4">
            <h2 className="text-lg sm:text-xl font-bold text-ink">جلسات گذشته</h2>

            {pastSessions.length === 0 ? (
              <div className="bg-surface border border-border rounded-2xl p-6 text-center text-sm text-ink-muted">
                هنوز جلسه برگزارشده‌ای در سابقه شما ثبت نشده است.
              </div>
            ) : (
              <div className="space-y-4">
                {pastSessions.map((session) => (
                  <article
                    key={session.id}
                    className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <Image
                          src={session.therapistAvatarUrl}
                          alt={session.therapistName}
                          width={48}
                          height={48}
                          className="w-12 h-12 rounded-full object-cover border border-border shrink-0"
                        />
                        <div className="space-y-1 min-w-0">
                          <StatusBadge variant="info" label="جلسه برگزارشده" />
                          <h3 className="text-base sm:text-lg font-bold text-ink pt-0.5">
                            {session.therapistName}
                          </h3>
                          <p className="text-sm text-ink-secondary tabular-nums flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                            <bdi dir="auto">{session.serviceTitle}</bdi>
                            <span aria-hidden="true">·</span>
                            {session.track === "abroad" && session.dateTimePrimaryLtr ? (
                              <span className="inline-flex flex-wrap items-center gap-x-1.5">
                                <span dir="ltr" className="inline-block tabular-nums">
                                  {session.dateTimePrimaryLtr}
                                </span>
                                {session.dateTimeSecondaryFa ? (
                                  <span>({session.dateTimeSecondaryFa})</span>
                                ) : null}
                              </span>
                            ) : (
                              <span>{session.dateTimeJalaliLabel}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      {session.hasReview ? (
                        <span className="rounded-full bg-status-confirmed-bg border border-status-confirmed-border px-3 py-1 text-xs font-medium text-status-confirmed-ink">
                          بازخورد ثبت شد
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setReviewTarget(session);
                            setReviewRating(5);
                            setReviewComment("");
                            setReviewError(null);
                          }}
                          className="min-h-[44px] px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
                        >
                          ثبت بازخورد تاییدشده
                        </button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <footer className="pt-4 border-t border-border text-center">
        <Link
          href="/therapists"
          className="min-h-[44px] inline-flex items-center text-sm sm:text-base font-medium text-accent hover:text-accent-hover underline underline-offset-4"
        >
          مشاهده فهرست درمانگران روان‌نما
        </Link>
      </footer>

      {/* Verified Review Modal (strictly unlocked ONLY for completed sessions) */}
      <SheetModal
        isOpen={Boolean(reviewTarget)}
        onClose={() => setReviewTarget(null)}
        title="ثبت بازخورد مراجع تاییدشده"
        subtitle={
          reviewTarget
            ? `تجربه جلسه با ${reviewTarget.therapistName} (نام شما منتشر نمی‌شود)`
            : undefined
        }
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <span className="block text-sm font-medium text-ink">امتیاز جلسه</span>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setReviewRating(star)}
                  aria-label={`امتیاز ${toPersianDigits(star)} از ۵`}
                  className={`flex-1 min-h-[44px] rounded-xl border text-sm font-semibold tabular-nums transition-colors ${
                    reviewRating >= star
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-border bg-surface text-ink-muted"
                  }`}
                >
                  {toPersianDigits(star)} ★
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="verified-review-text" className="block text-sm font-medium text-ink">
              توضیح تجربه شما از جلسه
            </label>
            <textarea
              id="verified-review-text"
              rows={4}
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
              placeholder="تجربه خود را به صورت محترمانه و مفید برای سایر مراجعان بنویسید..."
              className="w-full px-3.5 py-3 rounded-xl border border-border-strong bg-surface text-base"
            />
          </div>

          {reviewError ? (
            <p role="alert" className="text-[13px] text-status-rejected-ink">
              {reviewError}
            </p>
          ) : null}

          <button
            type="button"
            disabled={reviewComment.trim().length < 5 || reviewSubmitting}
            onClick={handleSubmitVerifiedReview}
            className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
          >
            {reviewSubmitting ? "در حال ثبت..." : "ارسال بازخورد تاییدشده"}
          </button>
        </div>
      </SheetModal>
    </div>
  );
}
