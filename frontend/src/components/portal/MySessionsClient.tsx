"use client";

import { useEffect, useState } from "react";
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
  clearVerifiedClientSession,
  readVerifiedClientSession,
  writeVerifiedClientSession,
} from "@/lib/client-session";
import { downloadIcsFile } from "@/lib/ics";
import { formatCurrency, toPersianDigits, toWesternDigits } from "@/lib/jalali";
import {
  getTherapistAvatarBySlug,
  MOCK_CLIENT_SESSIONS,
  type ClientSessionRecord,
} from "@/lib/mock-data";
import { buildTenantHref } from "@/lib/tenant-href";

export function MySessionsClient() {
  const [authContact, setAuthContact] = useState<string | null>(null);
  const [channel, setChannel] = useState<"phone" | "email">("phone");
  const [dialCode, setDialCode] = useState("+98");
  const [phoneNational, setPhoneNational] = useState("912 345 6789");
  const [emailInput, setEmailInput] = useState("negar.mousavi@example.com");

  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(120);
  const [authError, setAuthError] = useState<string | null>(null);

  const [sessions, setSessions] = useState<ClientSessionRecord[]>(() => [
    ...MOCK_CLIENT_SESSIONS,
  ]);

  // Verified-only review modal
  const [reviewTarget, setReviewTarget] = useState<ClientSessionRecord | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewNotice, setReviewNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = readVerifiedClientSession();
    if (saved) {
      setAuthContact(saved.identifier);
    }
  }, []);

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

  const handleRequestOtp = () => {
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
    setAuthError(null);
    setOtpRequested(true);
    setOtpSecondsLeft(120);
    setOtpCode("");
  };

  const handleVerifyOtp = () => {
    const normalized = toWesternDigits(otpCode).replace(/\D/g, "");
    if (normalized !== "123456") {
      setAuthError("کد تایید نادرست است. در محیط پیش‌نمایش از 123456 استفاده کنید.");
      return;
    }
    const saved = writeVerifiedClientSession(channel, targetDestination);
    setAuthContact(saved.identifier);
    setAuthError(null);
  };

  const handleSignOut = () => {
    clearVerifiedClientSession();
    setAuthContact(null);
    setOtpRequested(false);
    setOtpCode("");
  };

  const handleSubmitVerifiedReview = () => {
    if (!reviewTarget || reviewComment.trim().length < 5) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === reviewTarget.id ? { ...s, hasReview: true } : s)),
    );
    setReviewNotice(
      `بازخورد تاییدشده شما برای جلسه ${reviewTarget.therapistName} ثبت شد.`,
    );
    setReviewTarget(null);
    setReviewComment("");
  };

  if (!authContact) {
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
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink tabular-nums"
                />
              </div>
            )}

            {authError ? (
              <p className="text-[13px] text-status-rejected-ink">{authError}</p>
            ) : null}

            <button
              type="button"
              onClick={handleRequestOtp}
              className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
            >
              دریافت کد تایید یک‌بارمصرف
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
              <p className="text-xs text-ink-muted text-center">
                (کد آزمایشی پیش‌نمایش:{" "}
                <span dir="ltr" className="font-mono font-semibold text-ink">
                  123456
                </span>
                )
              </p>
              {authError ? (
                <p className="text-[13px] text-status-rejected-ink text-center">
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
                disabled={otpSecondsLeft > 0}
                onClick={() => setOtpSecondsLeft(120)}
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
                ویرایش شماره
              </button>
              <button
                type="button"
                onClick={handleVerifyOtp}
                className="flex-1 min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
              >
                ورود به نوبت‌های من
              </button>
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border text-center">
          <button
            type="button"
            onClick={() => {
              const demo = "+989123456789";
              const saved = writeVerifiedClientSession("phone", demo);
              setAuthContact(saved.identifier);
            }}
            className="min-h-[44px] px-3 text-xs sm:text-sm text-accent font-medium underline underline-offset-4 hover:text-accent-hover"
          >
            مشاهده فوری نمونه پورتال مراجع (حساب پیش‌نمایش)
          </button>
        </div>
      </section>
    );
  }

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
              {authContact}
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

      {/* Section 1: Upcoming Sessions */}
      <section className="space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-ink">نوبت‌های پیش‌رو</h2>

        <div className="space-y-4">
          {upcomingSessions.map((session) => {
            const badge = statusVariantFromBooking(session.status);
            const therapistProfileHref = buildTenantHref("/", {
              mode: "platform",
              slug: session.therapistSlug,
            });
            const rebookHref = buildTenantHref(
              `/book?rebook=${encodeURIComponent(session.id)}`,
              { mode: "platform", slug: session.therapistSlug },
            );

            return (
              <article
                key={session.id}
                className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3.5 min-w-0">
                    <Image
                      src={getTherapistAvatarBySlug(session.therapistSlug)}
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

                  <span
                    dir={session.currency === "IRT" ? "rtl" : "ltr"}
                    className="text-base font-bold text-accent tabular-nums"
                  >
                    {formatCurrency(session.amount, session.currency)}
                  </span>
                </div>

                <div className="rounded-xl bg-subtle/60 border border-border px-4 py-3 text-sm text-ink tabular-nums flex items-center gap-2">
                  {session.status === "confirmed" ? (
                    <CheckCircle2 className="w-4 h-4 text-status-confirmed-ink shrink-0" aria-hidden="true" />
                  ) : session.status === "pending_verification" ? (
                    <Clock className="w-4 h-4 text-status-pending-ink shrink-0" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-status-rejected-ink shrink-0" aria-hidden="true" />
                  )}
                  <span>{session.dateTimeJalaliLabel}</span>
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
      </section>

      {/* Section 2: Past History + Verified Review */}
      <section className="space-y-4">
        <h2 className="text-lg sm:text-xl font-bold text-ink">جلسات گذشته</h2>

        <div className="space-y-4">
          {pastSessions.map((session) => (
            <article
              key={session.id}
              className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3.5 min-w-0">
                  <Image
                    src={getTherapistAvatarBySlug(session.therapistSlug)}
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
                    <p className="text-sm text-ink-secondary tabular-nums">
                      <bdi dir="auto">{session.serviceTitle}</bdi> · {session.dateTimeJalaliLabel}
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
      </section>

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

          <button
            type="button"
            disabled={reviewComment.trim().length < 5}
            onClick={handleSubmitVerifiedReview}
            className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
          >
            ارسال بازخورد تاییدشده
          </button>
        </div>
      </SheetModal>
    </div>
  );
}
