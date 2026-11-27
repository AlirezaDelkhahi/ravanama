"use client";

import { useId, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
  SlidersHorizontal,
} from "lucide-react";
import { ReceiptLightbox } from "@/components/ui/ReceiptLightbox";
import { SheetModal } from "@/components/ui/SheetModal";
import { StatusBadge, statusVariantFromBooking } from "@/components/ui/StatusBadge";
import {
  formatCurrency,
  formatJalaliKey,
  formatJalaliMonthYear,
  formatJalaliNumeric,
  getJalaliMonthFirstWeekdaySat0,
  getJalaliMonthLength,
  JALALI_WEEKDAYS_FULL,
  JALALI_WEEKDAYS_SHORT,
  toPersianDigits,
} from "@/lib/jalali";
import {
  getPaymentAccountsForHeldBooking,
  MOCK_DASHBOARD_BOOKINGS,
  type DashboardBookingRecord,
  type JalaliOverride,
  type TherapistProfile,
  type WeeklyScheduleRule,
} from "@/lib/mock-data";

interface TherapistDashboardClientProps {
  therapist: TherapistProfile;
  initialDefaultJoinUrl: string;
}

type DashboardTab = "bookings" | "schedule" | "profile";
type BookingFilterTab =
  | "pending_verification"
  | "confirmed"
  | "completed"
  | "rejected";

const PRESET_REJECTION_REASONS = [
  "تصویر رسید ناخوانا است",
  "مبلغ واریزی با تعرفه مطابقت ندارد",
  "شماره کارت/حساب مقصد اشتباه است",
  "تراکنش در حساب یافت نشد",
] as const;

export function TherapistDashboardClient({
  therapist,
  initialDefaultJoinUrl,
}: TherapistDashboardClientProps) {
  const baseId = useId();
  const [activeTab, setActiveTab] = useState<DashboardTab>("bookings");

  // Tab 1 state
  const [bookings, setBookings] = useState<DashboardBookingRecord[]>(() => [
    ...MOCK_DASHBOARD_BOOKINGS,
  ]);
  const [bookingFilter, setBookingFilter] =
    useState<BookingFilterTab>("pending_verification");
  const [lightboxBooking, setLightboxBooking] =
    useState<DashboardBookingRecord | null>(null);

  const [approveTarget, setApproveTarget] =
    useState<DashboardBookingRecord | null>(null);
  const [approveJoinUrl, setApproveJoinUrl] = useState(initialDefaultJoinUrl);
  const [approveUrlError, setApproveUrlError] = useState<string | null>(null);

  const [rejectTarget, setRejectTarget] =
    useState<DashboardBookingRecord | null>(null);
  const [rejectReason, setRejectReason] = useState<string>(
    PRESET_REJECTION_REASONS[0],
  );
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Tab 2 state
  const [weeklyRules, setWeeklyRules] = useState<WeeklyScheduleRule[]>(() =>
    therapist.weeklySchedule.map((r) => ({
      ...r,
      windows: r.windows.map((w) => ({ ...w })),
    })),
  );
  const [bufferMinutes, setBufferMinutes] = useState<0 | 10 | 15>(10);
  const [minNoticeHours, setMinNoticeHours] = useState<2 | 12 | 24>(12);
  const [overrides, setOverrides] = useState<JalaliOverride[]>(() => [
    ...therapist.jalaliOverrides,
  ]);
  const [pickerYear, setPickerYear] = useState(1405);
  const [pickerMonth, setPickerMonth] = useState(9);
  const [pickedJalaliDay, setPickedJalaliDay] = useState<number>(25);
  const [overrideType, setOverrideType] = useState<"closed" | "custom_hours">(
    "closed",
  );
  const [overrideStart, setOverrideStart] = useState("16:00");
  const [overrideEnd, setOverrideEnd] = useState("19:00");

  // Tab 3 state
  const initialAccounts = useMemo(
    () => getPaymentAccountsForHeldBooking(therapist.slug),
    [therapist.slug],
  );
  const [displayName, setDisplayName] = useState(therapist.displayName);
  const [subtitle, setSubtitle] = useState(therapist.subtitle);
  const [bio, setBio] = useState(therapist.bio);
  const [licenseNo, setLicenseNo] = useState(therapist.licenseNumber);
  const [focusTags, setFocusTags] = useState<string[]>(therapist.focusAreas);
  const [newTagInput, setNewTagInput] = useState("");
  const [directoryOptIn, setDirectoryOptIn] = useState(therapist.directoryOptIn);
  const [defaultJoinUrl, setDefaultJoinUrl] = useState(initialDefaultJoinUrl);
  const [customDomainInput, setCustomDomainInput] = useState(
    therapist.customDomain ?? "dr-sara.ir",
  );
  const [cnameStatus, setCnameStatus] = useState<
    "verified" | "checking" | "pending"
  >(therapist.customDomainVerified ? "verified" : "pending");

  const [cardPan, setCardPan] = useState(initialAccounts.iran.cardPan);
  const [sheba, setSheba] = useState(initialAccounts.iran.sheba);
  const [paypalEmail, setPaypalEmail] = useState(
    initialAccounts.abroad.paypal?.email ?? "",
  );
  const [ibanValue, setIbanValue] = useState(
    initialAccounts.abroad.iban?.iban ?? "",
  );
  const [usdtValue, setUsdtValue] = useState(
    initialAccounts.abroad.usdt?.address ?? "",
  );

  // Blog editor state
  const [blogTitle, setBlogTitle] = useState(
    "تنظیم هیجان در روزهای پرچالش کاری",
  );
  const [blogSlug, setBlogSlug] = useState("emotion-regulation-at-work");
  const [blogSummary, setBlogSummary] = useState(
    "مروری کوتاه و کاربردی بر تکنیک‌های تنظیم سیستم عصبی در میانه روز کاری پرتنش.",
  );
  const [blogMarkdown, setBlogMarkdown] = useState(
    "## چرا بدن پیش از ذهن خسته می‌شود؟\n\nوقتی در طول روز چندین تماس و جلسه پیاپی داریم، سیستم عصبی فرصت بازگشت به خط پایه را پیدا نمی‌کند.\n\n### تمرین تنفس ۹۰ ثانیه‌ای\n\nپیش از شروع هر جلسه جدید، سه بازدم آهسته و طولانی انجام دهید.",
  );
  const [blogPreviewMode, setBlogPreviewMode] = useState<"edit" | "preview">(
    "edit",
  );
  const [blogStatus, setBlogStatus] = useState<"draft" | "published">(
    "published",
  );
  const [blogSeoTitle, setBlogSeoTitle] = useState(
    "تنظیم هیجان در محیط کار | دکتر سارا احمدی",
  );
  const [blogSeoDesc, setBlogSeoDesc] = useState(
    "راهنمای علمی مدیریت استرس شغلی و بازگرداندن تمرکز با تکنیک‌های کوتاه روان‌شناسی.",
  );
  const [blogCoverName, setBlogCoverName] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "pending_verification").length,
    [bookings],
  );
  const confirmedCount = useMemo(
    () => bookings.filter((b) => b.status === "confirmed").length,
    [bookings],
  );
  const activeWeeklyDaysCount = useMemo(
    () => weeklyRules.filter((r) => r.enabled).length,
    [weeklyRules],
  );

  const filteredBookings = useMemo(
    () => bookings.filter((b) => b.status === bookingFilter),
    [bookings, bookingFilter],
  );

  const handleConfirmApprove = () => {
    if (!approveTarget) return;
    const trimmed = approveJoinUrl.trim();
    let isValidHttpsUrl = false;
    try {
      const parsed = new URL(trimmed);
      isValidHttpsUrl = parsed.protocol === "https:" && parsed.hostname.length > 0;
    } catch {
      isValidHttpsUrl = false;
    }
    if (!isValidHttpsUrl) {
      setApproveUrlError("لینک جلسه آنلاین باید یک نشانی معتبر و دارای https:// باشد.");
      return;
    }

    setBookings((prev) =>
      prev.map((item) =>
        item.id === approveTarget.id
          ? { ...item, status: "confirmed", callJoinUrl: trimmed }
          : item,
      ),
    );
    setActionFeedback(
      `نوبت ${approveTarget.clientName} (${approveTarget.referenceCode}) تایید شد و لینک جلسه برای مراجع فعال گردید.`,
    );
    setApproveTarget(null);
    setApproveUrlError(null);
  };

  const handleConfirmReject = () => {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 4) {
      setRejectError("لطفاً دلیل رد رسید را برای اطلاع مراجع بنویسید.");
      return;
    }

    setBookings((prev) =>
      prev.map((item) =>
        item.id === rejectTarget.id
          ? { ...item, status: "rejected", rejectionReason: trimmed }
          : item,
      ),
    );
    setActionFeedback(
      `رسید ${rejectTarget.clientName} رد شد و زمان انتخاب‌شده بلافاصله برای سایر مراجعان آزاد شد.`,
    );
    setRejectTarget(null);
    setRejectError(null);
  };

  const handleToggleDay = (weekdaySat0: number) => {
    setWeeklyRules((prev) =>
      prev.map((rule) =>
        rule.weekdaySat0 === weekdaySat0
          ? {
              ...rule,
              enabled: !rule.enabled,
              windows:
                !rule.enabled && rule.windows.length === 0
                  ? [
                      {
                        id: `w-${weekdaySat0}-${Date.now()}`,
                        startTime: "16:00",
                        endTime: "19:00",
                      },
                    ]
                  : rule.windows,
            }
          : rule,
      ),
    );
  };

  const handleAddWindow = (weekdaySat0: number) => {
    setWeeklyRules((prev) =>
      prev.map((rule) =>
        rule.weekdaySat0 === weekdaySat0
          ? {
              ...rule,
              enabled: true,
              windows: [
                ...rule.windows,
                {
                  id: `w-${weekdaySat0}-${Date.now()}`,
                  startTime: "17:00",
                  endTime: "19:30",
                },
              ],
            }
          : rule,
      ),
    );
  };

  const handleRemoveWindow = (weekdaySat0: number, windowId: string) => {
    setWeeklyRules((prev) =>
      prev.map((rule) =>
        rule.weekdaySat0 === weekdaySat0
          ? {
              ...rule,
              windows: rule.windows.filter((w) => w.id !== windowId),
            }
          : rule,
      ),
    );
  };

  const updatePickerMonth = (delta: -1 | 1) => {
    let nextYear = pickerYear;
    let nextMonth = pickerMonth + delta;
    if (nextMonth < 1) {
      nextYear -= 1;
      nextMonth = 12;
    } else if (nextMonth > 12) {
      nextYear += 1;
      nextMonth = 1;
    }
    const maxDay = getJalaliMonthLength(nextYear, nextMonth);
    setPickerYear(nextYear);
    setPickerMonth(nextMonth);
    setPickedJalaliDay((d) => Math.min(d, maxDay));
  };

  const handleAddJalaliOverride = () => {
    const safeDay = Math.min(
      pickedJalaliDay,
      getJalaliMonthLength(pickerYear, pickerMonth),
    );
    const key = formatJalaliKey(pickerYear, pickerMonth, safeDay);
    const label = formatJalaliNumeric(pickerYear, pickerMonth, safeDay);
    const newItem: JalaliOverride = {
      id: `ovr-${Date.now()}`,
      jalaliKey: key,
      jalaliLabel: label,
      type: overrideType,
      note:
        overrideType === "closed"
          ? "مرخصی روزانه (عدم پذیرش جلسه)"
          : `ساعت اختصاصی (${toPersianDigits(overrideStart)} تا ${toPersianDigits(overrideEnd)})`,
      windows:
        overrideType === "closed"
          ? []
          : [{ id: `ovw-${Date.now()}`, startTime: overrideStart, endTime: overrideEnd }],
    };

    setOverrides((prev) => [newItem, ...prev.filter((o) => o.jalaliKey !== key)]);
  };

  const pickerMonthLength = getJalaliMonthLength(pickerYear, pickerMonth);
  const pickerFirstWeekday = getJalaliMonthFirstWeekdaySat0(pickerYear, pickerMonth);

  const renderedMarkdownBlocks = useMemo(() => {
    return blogMarkdown
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
  }, [blogMarkdown]);

  return (
    <div className="space-y-6">
      {/* Therapist Top Strip */}
      <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 space-y-1">
        <h1 className="text-xl sm:text-2xl font-bold text-ink">
          پنل مدیریت {displayName}
        </h1>
        <p className="text-sm text-ink-secondary">
          بررسی رسیدها، تنظیم تقویم شنبه تا جمعه و مدیریت صفحه شخصی و مقالات
        </p>
      </div>

      {/* 3-Tab Navigation Shell */}
      <div
        role="tablist"
        aria-label="بخش‌های پنل درمانگر"
        className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-surface border border-border rounded-2xl p-2"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "bookings"}
          onClick={() => setActiveTab("bookings")}
          className={`min-h-[48px] px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === "bookings"
              ? "bg-accent text-white"
              : "text-ink-secondary hover:bg-subtle hover:text-ink"
          }`}
        >
          <Inbox className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>نوبت‌ها و تایید رسید</span>
          <span
            className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-xs font-bold tabular-nums ${
              activeTab === "bookings"
                ? "bg-white text-accent"
                : "bg-status-pending-bg text-status-pending-ink"
            }`}
          >
            {toPersianDigits(pendingCount)}
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "schedule"}
          onClick={() => setActiveTab("schedule")}
          className={`min-h-[48px] px-4 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
            activeTab === "schedule"
              ? "bg-accent text-white"
              : "text-ink-secondary hover:bg-subtle hover:text-ink"
          }`}
        >
          <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>برنامه هفتگی و مرخصی</span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "profile"}
          onClick={() => setActiveTab("profile")}
          className={`min-h-[48px] px-4 rounded-xl text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
            activeTab === "profile"
              ? "bg-accent text-white"
              : "text-ink-secondary hover:bg-subtle hover:text-ink"
          }`}
        >
          <SlidersHorizontal className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>پروفایل و وبلاگ</span>
        </button>
      </div>

      {actionFeedback ? (
        <div
          role="status"
          aria-live="polite"
          className="rounded-2xl border border-status-confirmed-border bg-status-confirmed-bg px-4 py-3 text-sm text-status-confirmed-ink flex items-center justify-between gap-3"
        >
          <span>{actionFeedback}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="min-h-[44px] px-2 text-xs font-semibold underline"
          >
            بستن
          </button>
        </div>
      ) : null}

      {/* TAB 1: Bookings & Receipt Verification Queue */}
      {activeTab === "bookings" ? (
        <section className="space-y-5">
          {/* 3 Compact KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-status-pending-bg text-status-pending-ink inline-flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="block text-xs text-ink-muted">در انتظار تایید</span>
                <strong className="block text-xl font-bold text-ink tabular-nums">
                  {toPersianDigits(pendingCount)} مورد
                </strong>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-status-confirmed-bg text-status-confirmed-ink inline-flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="block text-xs text-ink-muted">نوبت‌های تاییدشده</span>
                <strong className="block text-xl font-bold text-ink tabular-nums">
                  {toPersianDigits(confirmedCount)} جلسه
                </strong>
              </div>
            </div>

            <div className="bg-surface border border-border rounded-2xl p-4 flex items-center gap-3.5">
              <span className="w-10 h-10 rounded-xl bg-accent-tint text-accent inline-flex items-center justify-center shrink-0">
                <CalendarDays className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <span className="block text-xs text-ink-muted">روزهای فعال هفته</span>
                <strong className="block text-xl font-bold text-ink tabular-nums">
                  {toPersianDigits(activeWeeklyDaysCount)} از ۷ روز
                </strong>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "pending_verification", label: "در انتظار تایید" },
                { id: "confirmed", label: "تاییدشده" },
                { id: "completed", label: "تکمیل‌شده / گذشته" },
                { id: "rejected", label: "ردشده / لغوشده" },
              ] as const
            ).map((tab) => {
              const count = bookings.filter((b) => b.status === tab.id).length;
              const isSelected = bookingFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBookingFilter(tab.id)}
                  className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-medium inline-flex items-center gap-2 transition-colors ${
                    isSelected
                      ? "border-accent bg-accent-tint text-accent font-semibold"
                      : "border-border bg-surface text-ink-secondary hover:bg-subtle"
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className="tabular-nums text-xs">
                    ({toPersianDigits(count)})
                  </span>
                </button>
              );
            })}
          </div>

          {filteredBookings.length === 0 ? (
            <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-ink-muted">
              در این وضعیت نوبتی ثبت نشده است.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredBookings.map((booking) => {
                const badge = statusVariantFromBooking(booking.status);
                return (
                  <article
                    key={booking.id}
                    className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="text-base sm:text-lg font-bold text-ink">
                            {booking.clientName}
                          </h2>
                          <StatusBadge variant={badge.variant} label={badge.label} />
                          <span className="rounded-full bg-subtle border border-border px-2.5 py-0.5 text-xs text-ink-secondary">
                            {booking.track === "iran" ? "داخل ایران" : "خارج از ایران"}
                          </span>
                        </div>
                        <p className="text-sm text-ink-secondary">
                          <bdi dir="auto">{booking.serviceTitle}</bdi> ·{" "}
                          <span className="tabular-nums">
                            {toPersianDigits(booking.durationMinutes)} دقیقه
                          </span>
                        </p>
                      </div>

                      <div className="text-end space-y-0.5">
                        <span
                          dir={booking.currency === "IRT" ? "rtl" : "ltr"}
                          className="block text-base font-bold text-accent tabular-nums"
                        >
                          {formatCurrency(booking.amount, booking.currency)}
                        </span>
                        <span className="block text-xs font-mono text-ink-muted">
                          <span dir="ltr" className="inline-block tabular-nums">
                            {booking.referenceCode}
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                      <dl className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-subtle/50 border border-border p-3.5 text-sm">
                        <div>
                          <dt className="text-xs text-ink-muted">زمان جلسه</dt>
                          <dd className="font-medium text-ink mt-0.5 tabular-nums text-start">
                            {booking.slotLabelJalali}
                          </dd>
                          {booking.slotLabelDual ? (
                            <dd className="text-xs text-ink-secondary mt-0.5 text-start">
                              <span dir="ltr" className="inline-block tabular-nums">
                                {booking.slotLabelDual}
                              </span>
                            </dd>
                          ) : null}
                        </div>

                        <div>
                          <dt className="text-xs text-ink-muted">اطلاعات تماس مراجع</dt>
                          <dd className="font-medium text-ink mt-0.5 text-start break-all">
                            <span dir="ltr" className="inline-block tabular-nums">
                              {booking.clientContactDisplay}
                            </span>
                          </dd>
                        </div>

                        <div>
                          <dt className="text-xs text-ink-muted">کد پیگیری تراکنش</dt>
                          <dd className="font-mono font-semibold text-ink mt-0.5 text-start">
                            <span dir="ltr" className="inline-block tabular-nums">
                              {booking.trackingCode}
                            </span>
                          </dd>
                        </div>

                        <div>
                          <dt className="text-xs text-ink-muted">زمان ثبت رسید</dt>
                          <dd className="text-ink-secondary mt-0.5 tabular-nums">
                            {booking.submittedAtJalali}
                          </dd>
                        </div>

                        {booking.clientNote ? (
                          <div className="sm:col-span-2 pt-2 border-t border-border">
                            <dt className="text-xs text-ink-muted">یادداشت مراجع</dt>
                            <dd className="text-ink-secondary mt-0.5">
                              {booking.clientNote}
                            </dd>
                          </div>
                        ) : null}
                      </dl>

                      {/* Clickable Receipt Thumbnail -> ReceiptLightbox */}
                      <div className="md:col-span-4 flex flex-col items-start gap-2">
                        <button
                          type="button"
                          onClick={() => setLightboxBooking(booking)}
                          className="w-full min-h-[120px] rounded-xl border border-border bg-subtle/40 hover:border-accent p-2.5 flex items-center gap-3 text-start transition-colors group"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={booking.receiptImageUrl}
                            alt={`تصویر رسید ${booking.clientName}`}
                            className="w-16 h-22 object-cover rounded-lg border border-border bg-surface shrink-0"
                          />
                          <div className="min-w-0 space-y-1">
                            <span className="block text-sm font-semibold text-ink group-hover:text-accent">
                              مشاهده و بزرگ‌نمایی رسید
                            </span>
                            <span className="block text-xs text-ink-muted">
                              بزرگ‌نمایی ۲۰۰٪ و چرخش ۹۰°
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {booking.status === "pending_verification" ? (
                      <div className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-border">
                        <button
                          type="button"
                          onClick={() => {
                            setApproveTarget(booking);
                            setApproveJoinUrl(defaultJoinUrl);
                            setApproveUrlError(null);
                          }}
                          className="min-h-[48px] px-5 rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover transition-colors"
                        >
                          تایید و ارسال لینک جلسه
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setRejectTarget(booking);
                            setRejectReason(PRESET_REJECTION_REASONS[0]);
                            setRejectError(null);
                          }}
                          className="min-h-[48px] px-5 rounded-xl border border-status-rejected-border bg-status-rejected-bg text-status-rejected-ink text-sm sm:text-base font-medium hover:opacity-90 transition-opacity"
                        >
                          رد رسید با دلیل
                        </button>
                      </div>
                    ) : null}

                    {booking.status === "confirmed" && booking.callJoinUrl ? (
                      <div className="pt-2 border-t border-border flex flex-wrap items-center justify-between gap-2 text-sm">
                        <span className="text-ink-muted">لینک فعال جلسه:</span>
                        <a
                          href={booking.callJoinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent font-medium underline underline-offset-4 break-all"
                        >
                          <span dir="ltr" className="inline-block tabular-nums">
                            {booking.callJoinUrl}
                          </span>
                        </a>
                      </div>
                    ) : null}

                    {booking.status === "rejected" && booking.rejectionReason ? (
                      <div className="rounded-xl border border-status-rejected-border bg-status-rejected-bg px-3.5 py-2.5 text-sm text-status-rejected-ink">
                        <strong>دلیل رد:</strong> {booking.rejectionReason}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {/* TAB 2: Weekly Schedule & Jalali Overrides */}
      {activeTab === "schedule" ? (
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-ink">
                برنامه هفتگی آنلاین (شنبه تا جمعه)
              </h2>
              <p className="text-sm text-ink-secondary">
                تمام بازه‌های زمانی بر پایه ساعت رسمی تهران (Asia/Tehran) ذخیره می‌شوند.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 min-w-0 rounded-xl bg-subtle/60 border border-border p-3.5 space-y-2">
                <span className="block text-xs font-semibold text-ink-secondary">
                  فاصله استراحت بین جلسات
                </span>
                <div className="flex gap-2">
                  {([0, 10, 15] as const).map((min) => (
                    <button
                      key={min}
                      type="button"
                      onClick={() => setBufferMinutes(min)}
                      className={`flex-1 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium tabular-nums transition-colors ${
                        bufferMinutes === min
                          ? "border-accent bg-accent-tint text-accent font-semibold"
                          : "border-border bg-surface text-ink"
                      }`}
                    >
                      {toPersianDigits(min)} دقیقه
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex-1 min-w-0 rounded-xl bg-subtle/60 border border-border p-3.5 space-y-2">
                <span className="block text-xs font-semibold text-ink-secondary">
                  حداقل زمان پیش‌نیاز رزرو
                </span>
                <div className="flex gap-2">
                  {([2, 12, 24] as const).map((hr) => (
                    <button
                      key={hr}
                      type="button"
                      onClick={() => setMinNoticeHours(hr)}
                      className={`flex-1 min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium tabular-nums transition-colors ${
                        minNoticeHours === hr
                          ? "border-accent bg-accent-tint text-accent font-semibold"
                          : "border-border bg-surface text-ink"
                      }`}
                    >
                      {toPersianDigits(hr)} ساعت
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              {weeklyRules.map((rule) => (
                <div
                  key={rule.weekdaySat0}
                  className="rounded-xl border border-border bg-surface p-3.5 space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => handleToggleDay(rule.weekdaySat0)}
                      aria-pressed={rule.enabled}
                      className="min-h-[44px] inline-flex items-center gap-2.5 text-sm sm:text-base font-semibold text-ink"
                    >
                      <span
                        className={`w-10 h-6 rounded-full p-0.5 transition-colors inline-flex items-center ${
                          rule.enabled
                            ? "bg-accent justify-end"
                            : "bg-muted-surface justify-start"
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full bg-white block" />
                      </span>
                      <span>{JALALI_WEEKDAYS_FULL[rule.weekdaySat0]}</span>
                    </button>

                    {rule.enabled ? (
                      <button
                        type="button"
                        onClick={() => handleAddWindow(rule.weekdaySat0)}
                        className="min-h-[44px] px-3 rounded-xl border border-border bg-subtle/60 text-xs font-medium text-ink hover:bg-subtle transition-colors"
                      >
                        + افزودن بازه
                      </button>
                    ) : (
                      <span className="text-xs text-ink-muted">روز تعطیل</span>
                    )}
                  </div>

                  {rule.enabled && rule.windows.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {rule.windows.map((win) => (
                        <div
                          key={win.id}
                          className="min-h-[44px] inline-flex items-center gap-1 rounded-xl border border-border bg-subtle/60 ps-3 pe-1 text-xs sm:text-sm tabular-nums"
                        >
                          <span>
                            {toPersianDigits(win.startTime)} تا{" "}
                            {toPersianDigits(win.endTime)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleRemoveWindow(rule.weekdaySat0, win.id)
                            }
                            aria-label="حذف بازه زمانی"
                            className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-lg text-ink-muted hover:text-status-rejected-ink transition-colors"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </div>

          {/* Pure Jalali Override Picker */}
          <div className="lg:col-span-5 bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-ink">
                مرخصی و استثنای تقویم جلالی
              </h2>
              <p className="text-sm text-ink-secondary">
                برای تعطیل کردن یک روز خاص یا تعریف ساعت اختصاصی، تاریخ جلالی را انتخاب کنید.
              </p>
            </div>

            <div className="rounded-2xl border border-border bg-subtle/40 p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => updatePickerMonth(-1)}
                  aria-label="ماه قبل"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink"
                >
                  <svg
                    className="w-4 h-4 rtl:rotate-180"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <span className="text-sm font-semibold text-ink tabular-nums">
                  {formatJalaliMonthYear(pickerYear, pickerMonth)}
                </span>
                <button
                  type="button"
                  onClick={() => updatePickerMonth(1)}
                  aria-label="ماه بعد"
                  className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-xl border border-border bg-surface text-ink"
                >
                  <svg
                    className="w-4 h-4 rtl:rotate-180"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-muted">
                {JALALI_WEEKDAYS_SHORT.map((d) => (
                  <div key={d}>{d}</div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: pickerFirstWeekday }, (_, i) => (
                  <div key={`b-${i}`} className="min-h-[44px]" />
                ))}
                {Array.from({ length: pickerMonthLength }, (_, idx) => {
                  const day = idx + 1;
                  const active = day === pickedJalaliDay;
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => setPickedJalaliDay(day)}
                      className={`min-h-[44px] rounded-xl text-xs sm:text-sm tabular-nums transition-colors ${
                        active
                          ? "bg-accent text-white font-semibold"
                          : "bg-surface border border-border text-ink hover:bg-subtle"
                      }`}
                    >
                      {toPersianDigits(day)}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOverrideType("closed")}
                  className={`min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium ${
                    overrideType === "closed"
                      ? "border-accent bg-accent-tint text-accent font-semibold"
                      : "border-border bg-surface text-ink"
                  }`}
                >
                  مرخصی روزانه
                </button>
                <button
                  type="button"
                  onClick={() => setOverrideType("custom_hours")}
                  className={`min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium ${
                    overrideType === "custom_hours"
                      ? "border-accent bg-accent-tint text-accent font-semibold"
                      : "border-border bg-surface text-ink"
                  }`}
                >
                  ساعت اختصاصی
                </button>
              </div>

              {overrideType === "custom_hours" ? (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label
                      htmlFor={`${baseId}-ovr-start`}
                      className="block text-xs text-ink-muted mb-1"
                    >
                      شروع
                    </label>
                    <input
                      id={`${baseId}-ovr-start`}
                      type="text"
                      dir="ltr"
                      value={overrideStart}
                      onChange={(e) => setOverrideStart(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor={`${baseId}-ovr-end`}
                      className="block text-xs text-ink-muted mb-1"
                    >
                      پایان
                    </label>
                    <input
                      id={`${baseId}-ovr-end`}
                      type="text"
                      dir="ltr"
                      value={overrideEnd}
                      onChange={(e) => setOverrideEnd(e.target.value)}
                      className="w-full min-h-[44px] px-3 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
                    />
                  </div>
                </div>
              ) : null}

              <button
                type="button"
                onClick={handleAddJalaliOverride}
                className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
              >
                ثبت برای تاریخ{" "}
                <span className="tabular-nums">
                  {formatJalaliNumeric(pickerYear, pickerMonth, pickedJalaliDay)}
                </span>
              </button>
            </div>

            <div className="space-y-2 pt-2 border-t border-border">
              <h3 className="text-sm font-semibold text-ink">استثناهای ثبت‌شده</h3>
              {overrides.map((ovr) => (
                <div
                  key={ovr.id}
                  className="rounded-xl border border-border bg-subtle/50 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs sm:text-sm"
                >
                  <div>
                    <span className="font-semibold text-ink tabular-nums">
                      {ovr.jalaliLabel}
                    </span>
                    <span className="block text-xs text-ink-secondary">{ovr.note}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setOverrides((prev) => prev.filter((item) => item.id !== ovr.id))
                    }
                    className="min-h-[44px] px-2.5 text-xs text-status-rejected-ink font-medium"
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* TAB 3: Profile, Custom Domain CNAME, Payouts & Markdown Blog Editor */}
      {activeTab === "profile" ? (
        <section className="space-y-6">
          {savedNotice ? (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-status-confirmed-border bg-status-confirmed-bg px-4 py-3 text-sm text-status-confirmed-ink"
            >
              {savedNotice}
            </div>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Profile & Focus Tags */}
            <div className="lg:col-span-6 bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
              <h2 className="text-lg font-bold text-ink">مشخصات حرفه‌ای و دایرکتوری</h2>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-display-name`}
                  className="block text-sm font-medium text-ink"
                >
                  نام نمایشی
                </label>
                <input
                  id={`${baseId}-display-name`}
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-subtitle`}
                  className="block text-sm font-medium text-ink"
                >
                  عنوان تخصصی
                </label>
                <input
                  id={`${baseId}-subtitle`}
                  type="text"
                  value={subtitle}
                  onChange={(e) => setSubtitle(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-license-no`}
                  className="block text-sm font-medium text-ink"
                >
                  شماره پروانه نظام
                </label>
                <input
                  id={`${baseId}-license-no`}
                  type="text"
                  value={licenseNo}
                  onChange={(e) => setLicenseNo(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-default-join-url`}
                  className="block text-sm font-medium text-ink"
                >
                  لینک پیش‌فرض اتاق آنلاین
                </label>
                <input
                  id={`${baseId}-default-join-url`}
                  type="url"
                  dir="ltr"
                  value={defaultJoinUrl}
                  onChange={(e) => setDefaultJoinUrl(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink tabular-nums"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-bio`}
                  className="block text-sm font-medium text-ink"
                >
                  معرفی کوتاه
                </label>
                <textarea
                  id={`${baseId}-bio`}
                  rows={5}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-border-strong bg-surface text-base leading-[1.75] text-ink"
                />
              </div>

              {/* Focus tags max 8 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">حوزه‌های تمرکز درمانی</span>
                  <span className="text-xs text-ink-muted tabular-nums">
                    {toPersianDigits(focusTags.length)} از ۸ برچسب
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {focusTags.map((tag) => (
                    <span
                      key={tag}
                      className="min-h-[44px] inline-flex items-center gap-1 rounded-full bg-subtle border border-border ps-3.5 pe-1 text-xs sm:text-sm text-ink-secondary"
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setFocusTags((prev) => prev.filter((t) => t !== tag))
                        }
                        aria-label={`حذف ${tag}`}
                        className="min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-full text-ink-muted hover:text-status-rejected-ink transition-colors"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
                {focusTags.length < 8 ? (
                  <div className="flex gap-2">
                    <label htmlFor={`${baseId}-new-tag`} className="sr-only">
                      افزودن برچسب تخصصی جدید
                    </label>
                    <input
                      id={`${baseId}-new-tag`}
                      type="text"
                      value={newTagInput}
                      onChange={(e) => setNewTagInput(e.target.value)}
                      placeholder="افزودن برچسب جدید..."
                      className="flex-1 min-h-[44px] px-3 rounded-xl border border-border-strong bg-surface text-base"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const t = newTagInput.trim();
                        if (t && !focusTags.includes(t) && focusTags.length < 8) {
                          setFocusTags((prev) => [...prev, t]);
                          setNewTagInput("");
                        }
                      }}
                      className="min-h-[44px] px-4 rounded-xl border border-border-strong bg-subtle text-sm font-medium text-ink"
                    >
                      افزودن
                    </button>
                  </div>
                ) : null}
              </div>

              {/* Opt-in toggle */}
              <div className="pt-2 border-t border-border flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <span className="block text-sm font-medium text-ink">
                    نمایش در فهرست عمومی درمانگران روان‌نما
                  </span>
                  <span className="block text-xs text-ink-muted">
                    در صورت غیرفعال بودن، صفحه شما فقط از طریق آدرس مستقیم در دسترس است.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDirectoryOptIn((v) => !v)}
                  aria-pressed={directoryOptIn}
                  aria-label="تغییر وضعیت نمایش در فهرست عمومی درمانگران"
                  className="shrink-0 min-h-[44px] min-w-[48px] inline-flex items-center justify-center"
                >
                  <span
                    className={`w-12 h-7 rounded-full p-0.5 transition-colors inline-flex items-center ${
                      directoryOptIn
                        ? "bg-accent justify-end"
                        : "bg-muted-surface justify-start"
                    }`}
                  >
                    <span className="w-6 h-6 rounded-full bg-white block" />
                  </span>
                </button>
              </div>
            </div>

            {/* CNAME Verifier & Payment Accounts */}
            <div className="lg:col-span-6 space-y-6">
              <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-ink">دامنه اختصاصی (CNAME)</h2>
                  <StatusBadge
                    variant={cnameStatus === "verified" ? "confirmed" : "pending"}
                    label={
                      cnameStatus === "verified"
                        ? "متصل و SSL فعال"
                        : cnameStatus === "checking"
                          ? "در حال بررسی..."
                          : "در انتظار تایید DNS"
                    }
                  />
                </div>

                <div className="space-y-2">
                  <label
                    htmlFor={`${baseId}-custom-domain`}
                    className="block text-sm font-medium text-ink"
                  >
                    دامنه شخصی شما
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      id={`${baseId}-custom-domain`}
                      type="text"
                      dir="ltr"
                      value={customDomainInput}
                      onChange={(e) => setCustomDomainInput(e.target.value)}
                      className="flex-1 min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCnameStatus("checking");
                        window.setTimeout(() => setCnameStatus("verified"), 450);
                      }}
                      className="min-h-[48px] px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                    >
                      بررسی رکورد CNAME
                    </button>
                  </div>
                  <p className="text-xs text-ink-muted">
                    مقدار CNAME را در پنل دامنه خود روی{" "}
                    <span dir="ltr" className="font-mono text-ink">
                      cname.ravannama.ir
                    </span>{" "}
                    تنظیم کنید.
                  </p>
                </div>
              </div>

              <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
                <h2 className="text-lg font-bold text-ink">
                  حساب‌های دریافت وجه (ایران و خارج از کشور)
                </h2>

                <div className="space-y-3">
                  <div className="space-y-1">
                    <label
                      htmlFor={`${baseId}-card-pan`}
                      className="block text-xs font-medium text-ink-secondary"
                    >
                      شماره کارت (مسیر داخل ایران)
                    </label>
                    <input
                      id={`${baseId}-card-pan`}
                      type="text"
                      dir="ltr"
                      value={cardPan}
                      onChange={(e) => setCardPan(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={`${baseId}-sheba`}
                      className="block text-xs font-medium text-ink-secondary"
                    >
                      شماره شبا{" "}
                      <span dir="ltr" className="inline-block">
                        (IR...)
                      </span>
                    </label>
                    <input
                      id={`${baseId}-sheba`}
                      type="text"
                      dir="ltr"
                      value={sheba}
                      onChange={(e) => setSheba(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={`${baseId}-paypal-email`}
                      className="block text-xs font-medium text-ink-secondary"
                    >
                      PayPal (خارج از ایران)
                    </label>
                    <input
                      id={`${baseId}-paypal-email`}
                      type="email"
                      dir="ltr"
                      value={paypalEmail}
                      onChange={(e) => setPaypalEmail(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={`${baseId}-iban`}
                      className="block text-xs font-medium text-ink-secondary"
                    >
                      IBAN (اروپا)
                    </label>
                    <input
                      id={`${baseId}-iban`}
                      type="text"
                      dir="ltr"
                      value={ibanValue}
                      onChange={(e) => setIbanValue(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor={`${baseId}-usdt`}
                      className="block text-xs font-medium text-ink-secondary"
                    >
                      کیف‌پول USDT (TRC-20)
                    </label>
                    <input
                      id={`${baseId}-usdt`}
                      type="text"
                      dir="ltr"
                      value={usdtValue}
                      onChange={(e) => setUsdtValue(e.target.value)}
                      className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-sm tabular-nums"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setSavedNotice("تغییرات پروفایل و حساب‌های دریافت وجه در پیش‌نمایش ذخیره شد.")
                  }
                  className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover transition-colors"
                >
                  ذخیره تنظیمات پروفایل و پرداخت
                </button>
              </div>
            </div>
          </div>

          {/* Distraction-free SEO Blog Editor */}
          <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-ink">ویرایشگر مقاله سئو وبلاگ</h2>
                <p className="text-sm text-ink-secondary">
                  نگارش یادداشت‌های تخصصی با پیش‌نمایش زنده راست‌به‌چپ
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBlogPreviewMode("edit")}
                  className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-medium ${
                    blogPreviewMode === "edit"
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-border bg-surface text-ink"
                  }`}
                >
                  ویرایش متن
                </button>
                <button
                  type="button"
                  onClick={() => setBlogPreviewMode("preview")}
                  className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-medium ${
                    blogPreviewMode === "preview"
                      ? "border-accent bg-accent-tint text-accent"
                      : "border-border bg-surface text-ink"
                  }`}
                >
                  پیش‌نمایش RTL
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-blog-title`}
                  className="block text-sm font-medium text-ink"
                >
                  عنوان مقاله
                </label>
                <input
                  id={`${baseId}-blog-title`}
                  type="text"
                  value={blogTitle}
                  onChange={(e) => setBlogTitle(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-blog-slug`}
                  className="block text-sm font-medium text-ink"
                >
                  نامک URL (Slug)
                </label>
                <input
                  id={`${baseId}-blog-slug`}
                  type="text"
                  dir="ltr"
                  value={blogSlug}
                  onChange={(e) => setBlogSlug(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-sm tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor={`${baseId}-blog-summary`}
                className="block text-sm font-medium text-ink"
              >
                چکیده مقاله
              </label>
              <input
                id={`${baseId}-blog-summary`}
                type="text"
                value={blogSummary}
                onChange={(e) => setBlogSummary(e.target.value)}
                className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base"
              />
            </div>

            {blogPreviewMode === "edit" ? (
              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-blog-markdown`}
                  className="block text-sm font-medium text-ink"
                >
                  متن مقاله (Markdown)
                </label>
                <textarea
                  id={`${baseId}-blog-markdown`}
                  rows={8}
                  value={blogMarkdown}
                  onChange={(e) => setBlogMarkdown(e.target.value)}
                  className="w-full px-3.5 py-3 rounded-xl border border-border-strong bg-surface text-base leading-[1.8]"
                />
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-canvas p-5 space-y-4 max-w-[65ch]">
                <h3 className="text-xl font-bold text-ink">{blogTitle}</h3>
                <p className="text-sm text-ink-secondary">{blogSummary}</p>
                <div className="space-y-4 text-[17px] leading-[1.85] text-ink">
                  {renderedMarkdownBlocks.map((block, idx) => {
                    if (block.startsWith("### ")) {
                      return (
                        <h5 key={idx} className="text-lg font-semibold text-ink pt-2">
                          {block.replace(/^###\s+/, "")}
                        </h5>
                      );
                    }
                    if (block.startsWith("## ")) {
                      return (
                        <h4 key={idx} className="text-xl font-bold text-ink pt-2">
                          {block.replace(/^##\s+/, "")}
                        </h4>
                      );
                    }
                    return (
                      <p key={idx} className="text-ink-secondary">
                        {block}
                      </p>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-blog-cover`}
                  className="block text-sm font-medium text-ink"
                >
                  تصویر شاخص (JPG/PNG/WEBP)
                </label>
                <input
                  id={`${baseId}-blog-cover`}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={(e) =>
                    setBlogCoverName(e.target.files?.[0]?.name ?? null)
                  }
                  className="w-full min-h-[48px] px-3 py-2.5 rounded-xl border border-border-strong bg-surface text-sm"
                />
                {blogCoverName ? (
                  <p className="text-xs text-ink-muted" dir="ltr">
                    {blogCoverName}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <span
                  id={`${baseId}-blog-status-label`}
                  className="block text-sm font-medium text-ink"
                >
                  وضعیت انتشار
                </span>
                <div
                  role="group"
                  aria-labelledby={`${baseId}-blog-status-label`}
                  className="grid grid-cols-2 gap-2"
                >
                  <button
                    type="button"
                    onClick={() => setBlogStatus("draft")}
                    className={`min-h-[48px] rounded-xl border text-sm font-medium ${
                      blogStatus === "draft"
                        ? "border-accent bg-accent-tint text-accent font-semibold"
                        : "border-border bg-surface text-ink"
                    }`}
                  >
                    پیش‌نویس
                  </button>
                  <button
                    type="button"
                    onClick={() => setBlogStatus("published")}
                    className={`min-h-[48px] rounded-xl border text-sm font-medium ${
                      blogStatus === "published"
                        ? "border-accent bg-accent-tint text-accent font-semibold"
                        : "border-border bg-surface text-ink"
                    }`}
                  >
                    منتشرشده
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-blog-seo-title`}
                  className="block text-xs font-medium text-ink-secondary"
                >
                  عنوان متا سئو (SEO Title)
                </label>
                <input
                  id={`${baseId}-blog-seo-title`}
                  type="text"
                  value={blogSeoTitle}
                  onChange={(e) => setBlogSeoTitle(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor={`${baseId}-blog-seo-desc`}
                  className="block text-xs font-medium text-ink-secondary"
                >
                  توضیحات متا سئو (Meta Description)
                </label>
                <input
                  id={`${baseId}-blog-seo-desc`}
                  type="text"
                  value={blogSeoDesc}
                  onChange={(e) => setBlogSeoDesc(e.target.value)}
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() =>
                  setSavedNotice(
                    `مقاله «${blogTitle}» با وضعیت ${
                      blogStatus === "published" ? "منتشرشده" : "پیش‌نویس"
                    } ذخیره شد.`,
                  )
                }
                className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover transition-colors"
              >
                ذخیره مقاله
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {/* Lightbox Zoom / Rotate Modal */}
      <ReceiptLightbox
        isOpen={Boolean(lightboxBooking)}
        onClose={() => setLightboxBooking(null)}
        imageUrl={lightboxBooking?.receiptImageUrl ?? "/images/sample-receipt-card.svg"}
        title={
          lightboxBooking
            ? `رسید پرداخت ${lightboxBooking.clientName}`
            : "بررسی تصویر رسید"
        }
        metadataLine={
          lightboxBooking
            ? `${lightboxBooking.referenceCode} · کد پیگیری ${lightboxBooking.trackingCode}`
            : undefined
        }
      />

      {/* Approve Modal */}
      <SheetModal
        isOpen={Boolean(approveTarget)}
        onClose={() => setApproveTarget(null)}
        title="تایید رسید و ارسال لینک جلسه"
        subtitle={
          approveTarget
            ? `${approveTarget.clientName} · ${approveTarget.slotLabelJalali}`
            : undefined
        }
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="approve-join-url" className="block text-sm font-medium text-ink">
              لینک اختصاصی جلسه (Google Meet / Skyroom)
            </label>
            <input
              id="approve-join-url"
              type="url"
              dir="ltr"
              value={approveJoinUrl}
              onChange={(e) => {
                setApproveJoinUrl(e.target.value);
                setApproveUrlError(null);
              }}
              placeholder="https://meet.google.com/..."
              className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
            />
            {approveUrlError ? (
              <p className="text-[13px] text-status-rejected-ink">{approveUrlError}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleConfirmApprove}
            className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
          >
            تایید نهایی و فعال‌سازی لینک جلسه
          </button>
        </div>
      </SheetModal>

      {/* Reject Modal */}
      <SheetModal
        isOpen={Boolean(rejectTarget)}
        onClose={() => setRejectTarget(null)}
        title="رد رسید و آزادسازی زمان"
        subtitle="با رد رسید، زمان انتخاب‌شده بلافاصله برای سایر مراجعان آزاد می‌شود."
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <span className="block text-xs font-medium text-ink-muted">
              انتخاب سریع دلیل:
            </span>
            <div className="flex flex-wrap gap-2">
              {PRESET_REJECTION_REASONS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => {
                    setRejectReason(preset);
                    setRejectError(null);
                  }}
                  className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm text-start transition-colors ${
                    rejectReason === preset
                      ? "border-accent bg-accent-tint text-accent font-medium"
                      : "border-border bg-subtle/50 text-ink hover:bg-subtle"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="reject-reason-text" className="block text-sm font-medium text-ink">
              متن توضیح برای مراجع
            </label>
            <textarea
              id="reject-reason-text"
              rows={3}
              value={rejectReason}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setRejectError(null);
              }}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-strong bg-surface text-base"
            />
            {rejectError ? (
              <p className="text-[13px] text-status-rejected-ink">{rejectError}</p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={handleConfirmReject}
            className="w-full min-h-[48px] rounded-xl bg-status-rejected-ink text-white text-base font-medium hover:opacity-90 transition-opacity"
          >
            ثبت رد رسید و ارسال پیام به مراجع
          </button>
        </div>
      </SheetModal>
    </div>
  );
}
