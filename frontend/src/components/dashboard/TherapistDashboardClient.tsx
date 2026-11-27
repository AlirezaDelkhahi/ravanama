"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Inbox,
  LogOut,
  Mail,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
} from "lucide-react";
import { CopyField } from "@/components/ui/CopyField";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { ReceiptLightbox } from "@/components/ui/ReceiptLightbox";
import { SheetModal } from "@/components/ui/SheetModal";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { StatusBadge, statusVariantFromBooking } from "@/components/ui/StatusBadge";
import {
  ApiError,
  dashboardApproveBooking,
  dashboardGetProfile,
  dashboardGetSchedule,
  dashboardListBlog,
  dashboardListBookings,
  dashboardRegisterDomain,
  dashboardRejectBooking,
  dashboardSetWeeklyRules,
  dashboardUpdateProfile,
  dashboardUpsertBlog,
  dashboardUpsertOverride,
  dashboardUpsertPaymentAccount,
  dashboardVerifyDomain,
  getAuthMe,
  getBookingReceiptUrl,
  issueOtp,
  logout,
  verifyOtp,
  type ApiDashboardBlogPostDTO,
  type ApiDashboardBookingDTO,
  type ApiDashboardTherapistDTO,
  type ApiOverrideDTO,
  type ApiPaymentDestinationDTO,
  type ApiRuleDTO,
  type ApiUserDTO,
} from "@/lib/api";
import {
  dateToTehranJalali,
  formatCurrency,
  formatJalaliKey,
  formatJalaliLong,
  formatJalaliMonthYear,
  formatJalaliNumeric,
  getJalaliMonthFirstWeekdaySat0,
  getJalaliMonthLength,
  gregorianToJalali,
  JALALI_WEEKDAYS_FULL,
  JALALI_WEEKDAYS_SHORT,
  jalaliToGregorian,
  toPersianDigits,
  toWesternDigits,
} from "@/lib/jalali";
import { formatDualSlot, formatTime24InZone } from "@/lib/timezone";
import type {
  DashboardBookingRecord,
  JalaliOverride,
  TherapistDomainRecord,
  WeeklyScheduleRule,
} from "@/lib/types";

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

function minutesToHHmm(totalMinutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.trunc(totalMinutes)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

function hhmmToMinutes(val: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(toWesternDigits(val).trim());
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (hh < 0 || hh > 24 || mm < 0 || mm > 59 || (hh === 24 && mm > 0)) {
    return null;
  }
  return hh * 60 + mm;
}

function mapApiRulesToWeekly(rules: ApiRuleDTO[]): WeeklyScheduleRule[] {
  const byDay = new Map<number, WeeklyScheduleRule>();
  for (let d = 0; d <= 6; d++) {
    byDay.set(d, { weekdaySat0: d, enabled: false, windows: [] });
  }
  for (const r of rules) {
    const entry = byDay.get(r.weekday_sat0);
    if (!entry) continue;
    if (r.is_active) {
      entry.enabled = true;
    }
    entry.windows.push({
      id: r.id || `w-${r.weekday_sat0}-${entry.windows.length}`,
      startTime: minutesToHHmm(r.start_minute),
      endTime: minutesToHHmm(r.end_minute),
    });
  }
  return Array.from(byDay.values());
}

function mapApiOverride(ov: ApiOverrideDTO): JalaliOverride {
  const [gy, gm, gd] = ov.override_date.split("-").map(Number);
  const j = gy && gm && gd ? gregorianToJalali(gy, gm, gd) : { jy: 1405, jm: 9, jd: 1 };
  const jalaliKey = formatJalaliKey(j.jy, j.jm, j.jd);
  const jalaliLabel = formatJalaliNumeric(j.jy, j.jm, j.jd);
  const windows =
    !ov.is_closed &&
    typeof ov.start_minute === "number" &&
    typeof ov.end_minute === "number"
      ? [
          {
            id: ov.id || `ovw-${ov.override_date}`,
            startTime: minutesToHHmm(ov.start_minute),
            endTime: minutesToHHmm(ov.end_minute),
          },
        ]
      : [];
  return {
    id: ov.id || ov.override_date,
    jalaliKey,
    jalaliLabel,
    type: ov.is_closed ? "closed" : "custom_hours",
    note:
      ov.reason ||
      (ov.is_closed
        ? "مرخصی روزانه (عدم پذیرش جلسه)"
        : `ساعت اختصاصی (${toPersianDigits(windows[0]?.startTime ?? "")} تا ${toPersianDigits(windows[0]?.endTime ?? "")})`),
    windows,
  };
}

function mapApiDashboardBooking(b: ApiDashboardBookingDTO): DashboardBookingRecord {
  const start = new Date(b.slot_start);
  const end = new Date(b.slot_end);
  const durationMinutes =
    !Number.isNaN(start.getTime()) && !Number.isNaN(end.getTime())
      ? Math.max(15, Math.round((end.getTime() - start.getTime()) / 60_000))
      : 50;

  const jStart = dateToTehranJalali(start);
  const tehranTime = toPersianDigits(formatTime24InZone(start, "Asia/Tehran"));
  const slotLabelJalali = `${formatJalaliLong(jStart.jy, jStart.jm, jStart.jd)} · ${tehranTime} تهران`;

  let slotLabelDual: string | undefined;
  if (b.track === "abroad") {
    const dual = formatDualSlot(b.slot_start, b.client_timezone || "Europe/Berlin");
    slotLabelDual = `${dual.dateLabelEn} · ${dual.localTime24h} ${b.client_timezone}`;
  }

  const created = new Date(b.updated_at || b.created_at);
  const jCreated = dateToTehranJalali(created);
  const createdTime = toPersianDigits(formatTime24InZone(created, "Asia/Tehran"));

  return {
    id: b.id,
    referenceCode: b.reference_code,
    clientName: b.client_name || "مراجع روان‌نما",
    clientContactDisplay: b.client_phone_e164 || b.client_email || "ثبت‌شده",
    track: b.track,
    serviceTitle:
      b.service_title ||
      (b.track === "iran" ? "جلسه مشاوره آنلاین" : "Online Session"),
    durationMinutes,
    slotStartIso: b.slot_start,
    slotEndIso: b.slot_end,
    slotLabelJalali,
    slotLabelDual,
    amount: b.amount_expected,
    currency: b.currency,
    status: b.status,
    hasReceipt: Boolean(b.has_receipt),
    trackingCode: b.tracking_code || "—",
    submittedAtJalali: `${formatJalaliNumeric(jCreated.jy, jCreated.jm, jCreated.jd)} · ${createdTime}`,
    callJoinUrl: b.call_join_url ?? undefined,
    rejectionReason: b.rejection_reason ?? undefined,
    clientNote: b.client_note || undefined,
  };
}

export function TherapistDashboardClient() {
  const baseId = useId();
  const todayJalali = useMemo(() => dateToTehranJalali(new Date()), []);

  // Auth gate state
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [authUser, setAuthUser] = useState<ApiUserDTO | null>(null);
  const [authChannel, setAuthChannel] = useState<"phone" | "email">("phone");
  const [dialCode, setDialCode] = useState("+98");
  const [phoneNational, setPhoneNational] = useState("");
  const [emailInput, setEmailInput] = useState("");
  const [otpRequested, setOtpRequested] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(120);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  // Dashboard data state
  const [loadingDashboard, setLoadingDashboard] = useState(false);
  const [dashboardLoadError, setDashboardLoadError] = useState<string | null>(null);
  const [therapistMeta, setTherapistMeta] = useState<ApiDashboardTherapistDTO | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<DashboardTab>("bookings");

  // Tab 1 state
  const [bookings, setBookings] = useState<DashboardBookingRecord[]>([]);
  const [bookingFilter, setBookingFilter] =
    useState<BookingFilterTab>("pending_verification");
  const [lightboxData, setLightboxData] = useState<{
    booking: DashboardBookingRecord;
    url: string;
    trackingCode: string;
  } | null>(null);
  const [receiptLoadingId, setReceiptLoadingId] = useState<string | null>(null);

  const [approveTarget, setApproveTarget] =
    useState<DashboardBookingRecord | null>(null);
  const [approveJoinUrl, setApproveJoinUrl] = useState("");
  const [approveUrlError, setApproveUrlError] = useState<string | null>(null);
  const [approveBusy, setApproveBusy] = useState(false);

  const [rejectTarget, setRejectTarget] =
    useState<DashboardBookingRecord | null>(null);
  const [rejectReason, setRejectReason] = useState<string>(
    PRESET_REJECTION_REASONS[0],
  );
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Tab 2 state
  const [weeklyRules, setWeeklyRules] = useState<WeeklyScheduleRule[]>(() =>
    mapApiRulesToWeekly([]),
  );
  const [bufferMinutes, setBufferMinutes] = useState<number>(10);
  const [minNoticeHours, setMinNoticeHours] = useState<number>(12);
  const [overrides, setOverrides] = useState<JalaliOverride[]>([]);
  const [pickerYear, setPickerYear] = useState(todayJalali.jy);
  const [pickerMonth, setPickerMonth] = useState(todayJalali.jm);
  const [pickedJalaliDay, setPickedJalaliDay] = useState<number>(todayJalali.jd);
  const [overrideType, setOverrideType] = useState<"closed" | "custom_hours">(
    "closed",
  );
  const [overrideStart, setOverrideStart] = useState("16:00");
  const [overrideEnd, setOverrideEnd] = useState("19:00");
  const [scheduleSaving, setScheduleSaving] = useState(false);
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [scheduleNotice, setScheduleNotice] = useState<string | null>(null);

  // Tab 3 state
  const [displayName, setDisplayName] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [bio, setBio] = useState("");
  const [licenseNo, setLicenseNo] = useState("");
  const [focusTags, setFocusTags] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState("");
  const [directoryOptIn, setDirectoryOptIn] = useState(true);
  const [defaultJoinUrl, setDefaultJoinUrl] = useState("");

  // Custom domains
  const [domains, setDomains] = useState<TherapistDomainRecord[]>([]);
  const [customDomainInput, setCustomDomainInput] = useState("");
  const [domainBusy, setDomainBusy] = useState(false);

  // Payment accounts (keeping IDs for upserts)
  const [iranAccounts, setIranAccounts] = useState<ApiPaymentDestinationDTO[]>([]);
  const [abroadAccounts, setAbroadAccounts] = useState<ApiPaymentDestinationDTO[]>([]);
  const [cardPan, setCardPan] = useState("");
  const [sheba, setSheba] = useState("");
  const [paypalEmail, setPaypalEmail] = useState("");
  const [ibanValue, setIbanValue] = useState("");
  const [usdtValue, setUsdtValue] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);

  // Blog editor + list state
  const [blogPosts, setBlogPosts] = useState<ApiDashboardBlogPostDTO[]>([]);
  const [editingPostId, setEditingPostId] = useState<string>("");
  const [blogTitle, setBlogTitle] = useState("");
  const [blogSlug, setBlogSlug] = useState("");
  const [blogSummary, setBlogSummary] = useState("");
  const [blogMarkdown, setBlogMarkdown] = useState("");
  const [blogPreviewMode, setBlogPreviewMode] = useState<"edit" | "preview">(
    "edit",
  );
  const [blogStatus, setBlogStatus] = useState<"draft" | "published">(
    "published",
  );
  const [blogSeoTitle, setBlogSeoTitle] = useState("");
  const [blogSeoDesc, setBlogSeoDesc] = useState("");
  const [blogSaving, setBlogSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const hydrateFromProfile = useCallback(
    (profRes: Awaited<ReturnType<typeof dashboardGetProfile>>) => {
      const th = profRes.therapist;
      setTherapistMeta(th);
      setDisplayName(th.display_name);
      setSubtitle(th.headline);
      setBio(th.bio_markdown);
      setLicenseNo(th.license_number);
      setFocusTags(th.focus_tags ?? []);
      setDirectoryOptIn(th.directory_opt_in);
      setDefaultJoinUrl(th.default_call_url ?? "");
      setApproveJoinUrl(th.default_call_url ?? "");

      const mappedDomains: TherapistDomainRecord[] = (profRes.domains ?? []).map(
        (d) => ({
          id: d.id,
          hostname: d.hostname,
          isPrimary: d.is_primary,
          status: d.status,
          txtToken: d.txt_token,
          verifiedAt: d.verified_at,
          createdAt: d.created_at,
        }),
      );
      setDomains(mappedDomains);

      const irAccs = profRes.payment_accounts_iran ?? [];
      const abAccs = profRes.payment_accounts_abroad ?? [];
      setIranAccounts(irAccs);
      setAbroadAccounts(abAccs);

      setCardPan(
        irAccs.find((a) => a.method === "card_to_card")?.destination_val ?? "",
      );
      setSheba(irAccs.find((a) => a.method === "sheba")?.destination_val ?? "");
      setPaypalEmail(
        abAccs.find((a) => a.method === "paypal")?.destination_val ?? "",
      );
      setIbanValue(abAccs.find((a) => a.method === "iban")?.destination_val ?? "");
      setUsdtValue(abAccs.find((a) => a.method === "usdt")?.destination_val ?? "");
    },
    [],
  );

  const loadDashboardData = useCallback(async () => {
    setLoadingDashboard(true);
    setDashboardLoadError(null);
    try {
      const [bookingsRes, scheduleRes, profileRes, blogRes] = await Promise.all([
        dashboardListBookings(),
        dashboardGetSchedule(),
        dashboardGetProfile(),
        dashboardListBlog(),
      ]);

      setBookings((bookingsRes.bookings ?? []).map(mapApiDashboardBooking));

      const rules = scheduleRes.weekly_rules ?? [];
      setWeeklyRules(mapApiRulesToWeekly(rules));
      if (rules.length > 0) {
        setBufferMinutes(rules[0].buffer_min);
        setMinNoticeHours(rules[0].min_notice_hr);
      }
      setOverrides((scheduleRes.overrides ?? []).map(mapApiOverride));

      hydrateFromProfile(profileRes);

      const posts = blogRes.posts ?? [];
      setBlogPosts(posts);
      if (posts.length > 0) {
        const first = posts[0];
        setEditingPostId(first.id);
        setBlogTitle(first.title);
        setBlogSlug(first.slug);
        setBlogSummary(first.excerpt);
        setBlogMarkdown(first.body_markdown);
        setBlogStatus(first.status);
        setBlogSeoTitle(first.seo_title);
        setBlogSeoDesc(first.seo_description);
      }
    } catch {
      setDashboardLoadError("بارگذاری اطلاعات داشبورد با خطا مواجه شد.");
    } finally {
      setLoadingDashboard(false);
    }
  }, [hydrateFromProfile]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getAuthMe();
        if (!active) return;
        setAuthUser(me.user);
        if (me.user.role === "therapist" || me.user.role === "admin") {
          await loadDashboardData();
        }
      } catch {
        if (active) setAuthUser(null);
      } finally {
        if (active) setCheckingAuth(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [loadDashboardData]);

  useEffect(() => {
    if (!otpRequested || otpSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setOtpSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpRequested, otpSecondsLeft]);

  const targetDestination =
    authChannel === "phone"
      ? `${dialCode}${toWesternDigits(phoneNational).replace(/\D/g, "").replace(/^0/, "")}`
      : emailInput.trim().toLowerCase();

  const handleRequestOtp = async () => {
    if (authChannel === "phone") {
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
        channel: authChannel === "phone" ? "sms" : "email",
        purpose: "login",
      });
      setOtpRequested(true);
      setOtpSecondsLeft(120);
      setOtpCode("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setAuthError("تعداد درخواست کد تایید بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.");
      } else {
        setAuthError("ارسال کد تایید با خطا مواجه شد.");
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
        channel: authChannel === "phone" ? "sms" : "email",
        purpose: "login",
        code: normalized,
      });
      setAuthUser(res.user);
      setOtpRequested(false);
      setOtpCode("");
      if (res.user.role === "therapist" || res.user.role === "admin") {
        await loadDashboardData();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setAuthError("تعداد تلاش‌های اشتباه بیش از حد مجاز است.");
      } else if (err instanceof ApiError && err.status === 401) {
        setAuthError("کد تایید نادرست یا منقضی شده است.");
      } else {
        setAuthError("خطا در ورود به داشبورد.");
      }
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // Ignore
    }
    setAuthUser(null);
    setTherapistMeta(null);
    setBookings([]);
    setOtpRequested(false);
  };

  const pendingCount = useMemo(
    () => bookings.filter((b) => b.status === "pending_verification").length,
    [bookings],
  );
  const confirmedCount = useMemo(
    () => bookings.filter((b) => b.status === "confirmed").length,
    [bookings],
  );
  const activeWeeklyDaysCount = useMemo(
    () => weeklyRules.filter((r) => r.enabled && r.windows.length > 0).length,
    [weeklyRules],
  );

  const filteredBookings = useMemo(
    () => bookings.filter((b) => b.status === bookingFilter),
    [bookings, bookingFilter],
  );

  const handleOpenReceipt = async (booking: DashboardBookingRecord) => {
    setReceiptLoadingId(booking.id);
    setActionError(null);
    try {
      const res = await getBookingReceiptUrl(booking.id);
      setLightboxData({
        booking,
        url: res.url,
        trackingCode: res.tracking_code || booking.trackingCode,
      });
    } catch {
      setActionError("دریافت لینک امن تصویر رسید با خطا مواجه شد.");
    } finally {
      setReceiptLoadingId(null);
    }
  };

  const handleConfirmApprove = async () => {
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

    setApproveBusy(true);
    setApproveUrlError(null);
    setActionError(null);
    try {
      await dashboardApproveBooking(approveTarget.id, trimmed);
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
    } catch {
      setApproveUrlError("ثبت تایید با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
    } finally {
      setApproveBusy(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectTarget) return;
    const trimmed = rejectReason.trim();
    if (trimmed.length < 4) {
      setRejectError("لطفاً دلیل رد رسید را برای اطلاع مراجع بنویسید.");
      return;
    }

    setRejectBusy(true);
    setRejectError(null);
    setActionError(null);
    try {
      await dashboardRejectBooking(rejectTarget.id, trimmed);
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
    } catch {
      setRejectError("ثبت رد رسید با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
    } finally {
      setRejectBusy(false);
    }
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

  const handleUpdateWindow = (
    weekdaySat0: number,
    windowId: string,
    field: "startTime" | "endTime",
    value: string,
  ) => {
    setWeeklyRules((prev) =>
      prev.map((rule) =>
        rule.weekdaySat0 === weekdaySat0
          ? {
              ...rule,
              windows: rule.windows.map((w) =>
                w.id === windowId ? { ...w, [field]: value } : w,
              ),
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

  const handleSaveWeeklyRules = async () => {
    const payload: ApiRuleDTO[] = [];
    for (const dayRule of weeklyRules) {
      if (!dayRule.enabled) continue;
      for (const win of dayRule.windows) {
        const startMin = hhmmToMinutes(win.startTime);
        const endMin = hhmmToMinutes(win.endTime);
        if (startMin === null || endMin === null || endMin <= startMin) {
          setScheduleNotice(
            `بازه زمانی ${JALALI_WEEKDAYS_FULL[dayRule.weekdaySat0]} معتبر نیست (ساعت پایان باید بعد از ساعت شروع باشد).`,
          );
          return;
        }
        payload.push({
          weekday_sat0: dayRule.weekdaySat0,
          start_minute: startMin,
          end_minute: endMin,
          buffer_min: bufferMinutes,
          min_notice_hr: Math.max(1, minNoticeHours),
          is_active: true,
        });
      }
    }

    setScheduleSaving(true);
    setScheduleNotice(null);
    try {
      const res = await dashboardSetWeeklyRules(payload);
      setWeeklyRules(mapApiRulesToWeekly(res.weekly_rules ?? []));
      setScheduleNotice("برنامه هفتگی و تنظیمات فاصله جلسات در سرور ذخیره شد.");
    } catch {
      setScheduleNotice("ذخیره برنامه هفتگی با خطا مواجه شد.");
    } finally {
      setScheduleSaving(false);
    }
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

  const handleAddJalaliOverride = async () => {
    const safeDay = Math.min(
      pickedJalaliDay,
      getJalaliMonthLength(pickerYear, pickerMonth),
    );
    const { gy, gm, gd } = jalaliToGregorian(pickerYear, pickerMonth, safeDay);
    const overrideDateIso = `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;

    let startMin: number | null = null;
    let endMin: number | null = null;
    if (overrideType === "custom_hours") {
      startMin = hhmmToMinutes(overrideStart);
      endMin = hhmmToMinutes(overrideEnd);
      if (startMin === null || endMin === null || endMin <= startMin) {
        setScheduleNotice("ساعت شروع و پایان استثنا معتبر نیست.");
        return;
      }
    }

    setOverrideSaving(true);
    setScheduleNotice(null);
    try {
      const res = await dashboardUpsertOverride({
        override_date: overrideDateIso,
        is_closed: overrideType === "closed",
        start_minute: startMin,
        end_minute: endMin,
        reason:
          overrideType === "closed"
            ? "مرخصی روزانه (عدم پذیرش جلسه)"
            : `ساعت اختصاصی (${toPersianDigits(overrideStart)} تا ${toPersianDigits(overrideEnd)})`,
      });
      const mapped = mapApiOverride(res.override);
      setOverrides((prev) => [
        mapped,
        ...prev.filter((o) => o.jalaliKey !== mapped.jalaliKey),
      ]);
      setScheduleNotice(`استثنای تاریخ ${mapped.jalaliLabel} ثبت شد.`);
    } catch {
      setScheduleNotice("ثبت استثنای تاریخ با خطا مواجه شد.");
    } finally {
      setOverrideSaving(false);
    }
  };

  const handleSaveProfileAndPayments = async () => {
    if (!therapistMeta) return;
    setProfileSaving(true);
    setSavedNotice(null);
    try {
      const trimmedCall = defaultJoinUrl.trim();
      const updatedProf = await dashboardUpdateProfile({
        display_name: displayName.trim(),
        headline: subtitle.trim(),
        bio_markdown: bio.trim(),
        license_number: toWesternDigits(licenseNo).trim(),
        years_experience: therapistMeta.years_experience,
        focus_tags: focusTags,
        education_timeline: therapistMeta.education_timeline ?? [],
        avatar_object_key: therapistMeta.avatar_object_key ?? null,
        default_call_url: trimmedCall ? trimmedCall : null,
        directory_opt_in: directoryOptIn,
        reviews_enabled: therapistMeta.reviews_enabled,
        timezone: therapistMeta.timezone || "Asia/Tehran",
        cancellation_policy_fa: therapistMeta.cancellation_policy_fa || "",
      });
      setTherapistMeta(updatedProf.therapist);

      const upsertEntries: Array<{
        existing?: ApiPaymentDestinationDTO;
        track: "iran" | "abroad";
        method: "card_to_card" | "sheba" | "paypal" | "iban" | "usdt";
        account_label: string;
        destination_val: string;
        holder_name: string;
      }> = [
        {
          existing: iranAccounts.find((a) => a.method === "card_to_card"),
          track: "iran",
          method: "card_to_card",
          account_label: "کارت بانکی",
          destination_val: cardPan.trim(),
          holder_name: displayName.trim() || therapistMeta.display_name,
        },
        {
          existing: iranAccounts.find((a) => a.method === "sheba"),
          track: "iran",
          method: "sheba",
          account_label: "شماره شبا",
          destination_val: sheba.trim(),
          holder_name: displayName.trim() || therapistMeta.display_name,
        },
        {
          existing: abroadAccounts.find((a) => a.method === "paypal"),
          track: "abroad",
          method: "paypal",
          account_label: "PayPal",
          destination_val: paypalEmail.trim(),
          holder_name: displayName.trim() || therapistMeta.display_name,
        },
        {
          existing: abroadAccounts.find((a) => a.method === "iban"),
          track: "abroad",
          method: "iban",
          account_label: "IBAN (SEPA)",
          destination_val: ibanValue.trim(),
          holder_name: displayName.trim() || therapistMeta.display_name,
        },
        {
          existing: abroadAccounts.find((a) => a.method === "usdt"),
          track: "abroad",
          method: "usdt",
          account_label: "USDT (TRC-20)",
          destination_val: usdtValue.trim(),
          holder_name: displayName.trim() || therapistMeta.display_name,
        },
      ];

      for (const entry of upsertEntries) {
        if (!entry.destination_val) continue;
        await dashboardUpsertPaymentAccount({
          id: entry.existing?.id,
          track: entry.track,
          method: entry.method,
          account_label: entry.existing?.account_label || entry.account_label,
          destination_val: entry.destination_val,
          holder_name: entry.existing?.holder_name || entry.holder_name,
          is_active: true,
        });
      }

      const refreshed = await dashboardGetProfile();
      hydrateFromProfile(refreshed);
      setSavedNotice("تغییرات پروفایل و حساب‌های دریافت وجه با موفقیت ذخیره شد.");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setSavedNotice(
          "لطفاً مقادیر واردشده (از جمله لینک https:// جلسه و حداکثر ۸ برچسب) را بررسی کنید.",
        );
      } else {
        setSavedNotice("ذخیره تنظیمات با خطا مواجه شد.");
      }
    } finally {
      setProfileSaving(false);
    }
  };

  const handleRegisterDomain = async () => {
    const clean = customDomainInput.trim().toLowerCase();
    if (!clean) return;
    setDomainBusy(true);
    setSavedNotice(null);
    try {
      const res = await dashboardRegisterDomain(clean);
      setDomains((prev) => [
        {
          id: res.domain.id,
          hostname: res.domain.hostname,
          isPrimary: res.domain.is_primary,
          status: res.domain.status,
          txtToken: res.domain.txt_token,
          verifiedAt: res.domain.verified_at,
          createdAt: res.domain.created_at,
        },
        ...prev,
      ]);
      setCustomDomainInput("");
      setSavedNotice("دامنه ثبت شد. رکورد TXT زیر را روی DNS خود قرار دهید و سپس تایید کنید.");
    } catch {
      setSavedNotice("ثبت دامنه با خطا مواجه شد (ممکن است نام دامنه نامعتبر یا قبلاً ثبت شده باشد).");
    } finally {
      setDomainBusy(false);
    }
  };

  const handleVerifyDomain = async (domainId: string) => {
    setDomainBusy(true);
    setSavedNotice(null);
    try {
      const res = await dashboardVerifyDomain(domainId);
      setDomains((prev) =>
        prev.map((d) =>
          d.id === domainId
            ? {
                ...d,
                isPrimary: res.domain.is_primary,
                status: res.domain.status,
                verifiedAt: res.domain.verified_at,
              }
            : d,
        ),
      );
      setSavedNotice("دامنه اختصاصی با موفقیت تایید و متصل شد.");
    } catch {
      setSavedNotice("رکورد TXT هنوز روی DNS دامنه یافت نشد.");
    } finally {
      setDomainBusy(false);
    }
  };

  const handleSaveBlogPost = async () => {
    if (!blogTitle.trim() || !blogSlug.trim() || !blogMarkdown.trim()) {
      setSavedNotice("عنوان، نامک URL و متن مقاله الزامی است.");
      return;
    }
    setBlogSaving(true);
    setSavedNotice(null);
    try {
      const res = await dashboardUpsertBlog({
        id: editingPostId || undefined,
        slug: blogSlug.trim().toLowerCase(),
        title: blogTitle.trim(),
        excerpt: blogSummary.trim(),
        body_markdown: blogMarkdown.trim(),
        seo_title: blogSeoTitle.trim() || blogTitle.trim(),
        seo_description: blogSeoDesc.trim() || blogSummary.trim(),
        reading_min: Math.max(2, Math.ceil(blogMarkdown.split(/\s+/).length / 180)),
        status: blogStatus,
      });
      setEditingPostId(res.post.id);
      const listRes = await dashboardListBlog();
      setBlogPosts(listRes.posts ?? []);
      setSavedNotice(
        `مقاله «${res.post.title}» با وضعیت ${
          res.post.status === "published" ? "منتشرشده" : "پیش‌نویس"
        } در دیتابیس ذخیره شد.`,
      );
    } catch {
      setSavedNotice("ذخیره مقاله با خطا مواجه شد (فرمت نامک انگلیسی را بررسی کنید).");
    } finally {
      setBlogSaving(false);
    }
  };

  const pickerMonthLength = getJalaliMonthLength(pickerYear, pickerMonth);
  const pickerFirstWeekday = getJalaliMonthFirstWeekdaySat0(pickerYear, pickerMonth);

  const renderedMarkdownBlocks = useMemo(() => {
    return blogMarkdown
      .split(/\n{2,}/)
      .map((b) => b.trim())
      .filter(Boolean);
  }, [blogMarkdown]);

  // --- Auth & Role Guards ---
  if (checkingAuth) {
    return (
      <>
        <SiteHeader variant="platform" />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12">
          <div className="max-w-md mx-auto bg-surface border border-border rounded-2xl p-8 text-center text-sm text-ink-secondary">
            در حال بررسی نشست درمانگر...
          </div>
        </main>
      </>
    );
  }

  if (!authUser || (authUser.role !== "therapist" && authUser.role !== "admin")) {
    return (
      <>
        <SiteHeader variant="platform" />
        <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
          <section className="w-full max-w-full sm:max-w-lg mx-auto min-w-0 bg-surface border border-border rounded-2xl p-5 sm:p-8 space-y-6">
            <div className="space-y-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-tint border border-border px-3 py-1 text-xs font-medium text-accent">
                <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>پنل اختصاصی درمانگران</span>
              </span>
              <h1 className="text-xl sm:text-2xl font-bold text-ink">
                ورود به داشبورد درمانگر
              </h1>
              <p className="text-sm sm:text-base text-ink-secondary leading-[1.7]">
                برای بررسی رسیدها، مدیریت تقویم هفتگی، تنظیم حساب‌های دریافت وجه و انتشار مقالات، با حساب درمانگر خود وارد شوید.
              </p>
            </div>

            {authUser && authUser.role === "client" ? (
              <div
                role="alert"
                className="rounded-xl border border-status-rejected-border bg-status-rejected-bg px-4 py-3 text-sm text-status-rejected-ink space-y-2"
              >
                <p>حساب فعلی شما از نوع مراجع است و دسترسی به پنل درمانگر ندارد.</p>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="underline font-medium"
                >
                  خروج و ورود با حساب درمانگر
                </button>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setAuthChannel("phone");
                  setOtpRequested(false);
                  setAuthError(null);
                }}
                className={`min-h-[48px] rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                  authChannel === "phone"
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
                  setAuthChannel("email");
                  setOtpRequested(false);
                  setAuthError(null);
                }}
                className={`min-h-[48px] rounded-xl border text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors ${
                  authChannel === "email"
                    ? "border-accent bg-accent-tint text-accent font-semibold"
                    : "border-border bg-surface text-ink hover:bg-subtle"
                }`}
              >
                <Mail className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>ایمیل</span>
              </button>
            </div>

            {!otpRequested ? (
              <div className="space-y-4">
                {authChannel === "phone" ? (
                  <div className="space-y-1.5">
                    <label htmlFor="dash-login-phone" className="block text-sm font-medium text-ink">
                      شماره موبایل درمانگر
                    </label>
                    <PhoneInput
                      id="dash-login-phone"
                      dialCode={dialCode}
                      nationalNumber={phoneNational}
                      onDialCodeChange={setDialCode}
                      onNationalNumberChange={setPhoneNational}
                      hasError={Boolean(authError)}
                    />
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <label htmlFor="dash-login-email" className="block text-sm font-medium text-ink">
                      ایمیل درمانگر
                    </label>
                    <input
                      id="dash-login-email"
                      type="email"
                      dir="ltr"
                      value={emailInput}
                      onChange={(e) => setEmailInput(e.target.value)}
                      placeholder="sara.ahmadi@ravannama.ir"
                      className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
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
                  {authBusy ? "در حال ارسال کد..." : "دریافت کد تایید ورود"}
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
                  <label htmlFor="dash-otp-input" className="block text-sm font-medium text-ink">
                    کد تایید ۶ رقمی
                  </label>
                  <input
                    id="dash-otp-input"
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
                    className="w-full min-h-[48px] px-4 rounded-xl border border-border-strong bg-surface text-center text-lg font-bold tracking-[0.25em] text-ink placeholder:text-ink-muted tabular-nums"
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
                    بازگشت
                  </button>
                  <button
                    type="button"
                    disabled={authBusy}
                    onClick={handleVerifyOtp}
                    className="flex-1 min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                  >
                    {authBusy ? "در حال ورود..." : "ورود به پنل درمانگر"}
                  </button>
                </div>
              </div>
            )}
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <SiteHeader
        variant="dashboard"
        therapistName={displayName || therapistMeta?.display_name || "درمانگر"}
        therapistSlug={therapistMeta?.slug || "dr-sara-ahmadi"}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        {loadingDashboard ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center text-sm text-ink-secondary">
            در حال بارگذاری اطلاعات پنل درمانگر...
          </div>
        ) : dashboardLoadError ? (
          <div className="bg-surface border border-border rounded-2xl p-8 text-center space-y-4">
            <p className="text-sm text-status-rejected-ink">{dashboardLoadError}</p>
            <button
              type="button"
              onClick={() => void loadDashboardData()}
              className="min-h-[44px] px-5 rounded-xl bg-accent text-white text-sm font-medium"
            >
              تلاش مجدد
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Therapist Top Strip */}
            <div className="bg-surface border border-border rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h1 className="text-xl sm:text-2xl font-bold text-ink">
                  پنل مدیریت {displayName}
                </h1>
                <p className="text-sm text-ink-secondary">
                  بررسی رسیدها، تنظیم تقویم شنبه تا جمعه و مدیریت صفحه شخصی و مقالات
                </p>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                className="min-h-[44px] inline-flex items-center gap-1.5 px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>خروج</span>
              </button>
            </div>

            {/* 3-Tab Navigation Shell */}
            <div
              role="tablist"
              aria-label="بخش‌های پنل درمانگر"
              className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-surface border border-border rounded-2xl p-2"
            >
              <button
                id={`${baseId}-tab-bookings`}
                type="button"
                role="tab"
                aria-selected={activeTab === "bookings"}
                aria-controls={`${baseId}-panel-bookings`}
                onClick={() => setActiveTab("bookings")}
                className={`min-h-[48px] px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
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
                id={`${baseId}-tab-schedule`}
                type="button"
                role="tab"
                aria-selected={activeTab === "schedule"}
                aria-controls={`${baseId}-panel-schedule`}
                onClick={() => setActiveTab("schedule")}
                className={`min-h-[48px] px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
                  activeTab === "schedule"
                    ? "bg-accent text-white"
                    : "text-ink-secondary hover:bg-subtle hover:text-ink"
                }`}
              >
                <CalendarDays className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>برنامه هفتگی و مرخصی</span>
              </button>

              <button
                id={`${baseId}-tab-profile`}
                type="button"
                role="tab"
                aria-selected={activeTab === "profile"}
                aria-controls={`${baseId}-panel-profile`}
                onClick={() => setActiveTab("profile")}
                className={`min-h-[48px] px-4 rounded-xl text-sm font-medium flex items-center justify-center gap-2 ${
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

            {actionError ? (
              <div
                role="alert"
                className="rounded-2xl border border-status-rejected-border bg-status-rejected-bg px-4 py-3 text-sm text-status-rejected-ink"
              >
                {actionError}
              </div>
            ) : null}

            {/* TAB 1: Bookings & Receipt Verification Queue */}
            {activeTab === "bookings" ? (
              <section
                id={`${baseId}-panel-bookings`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-bookings`}
                className="space-y-5"
              >
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
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
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

                            <div className="flex items-center justify-between gap-2 pt-2.5 border-t border-border sm:border-t-0 sm:pt-0 sm:block sm:text-end sm:space-y-0.5 shrink-0">
                              <span
                                dir={booking.currency === "IRT" ? "rtl" : "ltr"}
                                className="inline-block sm:block text-base font-bold text-accent tabular-nums"
                              >
                                {formatCurrency(booking.amount, booking.currency)}
                              </span>
                              <span className="inline-block sm:block text-xs font-mono text-ink-muted">
                                <span dir="ltr" className="inline-block tabular-nums">
                                  {booking.referenceCode}
                                </span>
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                            <dl className="md:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl bg-subtle/50 border border-border p-3.5 text-sm text-start">
                              <div className="text-start">
                                <dt className="text-xs text-ink-muted text-start">زمان جلسه</dt>
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

                              <div className="text-start">
                                <dt className="text-xs text-ink-muted text-start">اطلاعات تماس مراجع</dt>
                                <dd className="font-medium text-ink mt-0.5 text-start break-all">
                                  <span dir="ltr" className="inline-block tabular-nums">
                                    {booking.clientContactDisplay}
                                  </span>
                                </dd>
                              </div>

                              <div className="text-start">
                                <dt className="text-xs text-ink-muted text-start">کد پیگیری تراکنش</dt>
                                <dd className="font-mono font-semibold text-ink mt-0.5 text-start">
                                  <span dir="ltr" className="inline-block tabular-nums">
                                    {booking.trackingCode}
                                  </span>
                                </dd>
                              </div>

                              <div className="text-start">
                                <dt className="text-xs text-ink-muted text-start">زمان ثبت</dt>
                                <dd className="text-ink-secondary mt-0.5 tabular-nums text-start">
                                  {booking.submittedAtJalali}
                                </dd>
                              </div>

                              {booking.clientNote ? (
                                <div className="sm:col-span-2 pt-2 border-t border-border text-start">
                                  <dt className="text-xs text-ink-muted text-start">یادداشت مراجع</dt>
                                  <dd className="text-ink-secondary mt-0.5 text-start">
                                    {booking.clientNote}
                                  </dd>
                                </div>
                              ) : null}
                            </dl>

                            <div className="md:col-span-4 flex flex-col items-stretch gap-2">
                              {booking.hasReceipt ? (
                                <button
                                  type="button"
                                  disabled={receiptLoadingId === booking.id}
                                  onClick={() => void handleOpenReceipt(booking)}
                                  className="w-full min-h-[112px] rounded-xl border border-border bg-subtle/40 hover:border-accent p-4 block text-start transition-colors group"
                                >
                                  <div dir="rtl" className="w-full space-y-1.5 text-start">
                                    <span className="block w-full text-start text-sm font-semibold text-ink group-hover:text-accent">
                                      {receiptLoadingId === booking.id
                                        ? "در حال دریافت لینک امن..."
                                        : "بررسی رسید و بزرگ‌نمایی"}
                                    </span>
                                    <span className="block w-full text-start text-xs text-ink-muted">
                                      لینک امن ۶۰ ثانیه‌ای · بزرگ‌نمایی ۲۰۰٪ و چرخش ۹۰°
                                    </span>
                                  </div>
                                </button>
                              ) : (
                                <div className="w-full rounded-xl border border-border bg-subtle/30 p-4 text-xs text-ink-muted text-start">
                                  هنوز تصویر رسیدی برای این نوبت ثبت نشده است.
                                </div>
                              )}
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
              <section
                id={`${baseId}-panel-schedule`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-schedule`}
                className="space-y-4"
              >
                {scheduleNotice ? (
                  <div
                    role="status"
                    aria-live="polite"
                    className="rounded-2xl border border-status-confirmed-border bg-status-confirmed-bg px-4 py-3 text-sm text-status-confirmed-ink"
                  >
                    {scheduleNotice}
                  </div>
                ) : null}

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
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
                                  className="min-h-[44px] inline-flex items-center gap-1.5 rounded-xl border border-border bg-subtle/60 ps-2.5 pe-1 text-xs sm:text-sm tabular-nums"
                                >
                                  <input
                                    type="text"
                                    dir="ltr"
                                    aria-label="ساعت شروع"
                                    value={win.startTime}
                                    onChange={(e) =>
                                      handleUpdateWindow(
                                        rule.weekdaySat0,
                                        win.id,
                                        "startTime",
                                        e.target.value,
                                      )
                                    }
                                    className="w-16 md:w-14 bg-surface border border-border rounded-lg px-1.5 py-1 text-center text-base md:text-xs tabular-nums"
                                  />
                                  <span>تا</span>
                                  <input
                                    type="text"
                                    dir="ltr"
                                    aria-label="ساعت پایان"
                                    value={win.endTime}
                                    onChange={(e) =>
                                      handleUpdateWindow(
                                        rule.weekdaySat0,
                                        win.id,
                                        "endTime",
                                        e.target.value,
                                      )
                                    }
                                    className="w-16 md:w-14 bg-surface border border-border rounded-lg px-1.5 py-1 text-center text-base md:text-xs tabular-nums"
                                  />
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

                    <button
                      type="button"
                      disabled={scheduleSaving}
                      onClick={handleSaveWeeklyRules}
                      className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                    >
                      {scheduleSaving ? "در حال ذخیره..." : "ذخیره برنامه هفتگی"}
                    </button>
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
                        disabled={overrideSaving}
                        onClick={handleAddJalaliOverride}
                        className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                      >
                        {overrideSaving ? (
                          "در حال ثبت..."
                        ) : (
                          <>
                            ثبت برای تاریخ{" "}
                            <span className="tabular-nums">
                              {formatJalaliNumeric(pickerYear, pickerMonth, pickedJalaliDay)}
                            </span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="space-y-2 pt-2 border-t border-border">
                      <h3 className="text-sm font-semibold text-ink">استثناهای ثبت‌شده</h3>
                      {overrides.length === 0 ? (
                        <p className="text-xs text-ink-muted">استثنایی ثبت نشده است.</p>
                      ) : (
                        overrides.map((ovr) => (
                          <div
                            key={ovr.id}
                            className="rounded-xl border border-border bg-subtle/50 px-3.5 py-2.5 text-xs sm:text-sm"
                          >
                            <span className="font-semibold text-ink tabular-nums">
                              {ovr.jalaliLabel}
                            </span>
                            <span className="block text-xs text-ink-secondary">{ovr.note}</span>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {/* TAB 3: Profile, Custom Domain, Payouts & Markdown Blog Editor */}
            {activeTab === "profile" ? (
              <section
                id={`${baseId}-panel-profile`}
                role="tabpanel"
                aria-labelledby={`${baseId}-tab-profile`}
                className="space-y-6"
              >
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
                        className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink text-start"
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
                        className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink text-start"
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
                        className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink text-start tabular-nums"
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
                        className="w-full px-3.5 py-3 rounded-xl border border-border-strong bg-surface text-base leading-[1.75] text-ink text-start"
                      />
                    </div>

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

                  {/* Custom Domain Verifier & Payment Accounts */}
                  <div className="lg:col-span-6 space-y-6">
                    <div className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
                      <h2 className="text-lg font-bold text-ink">دامنه اختصاصی (DNS / SSL)</h2>

                      <div className="flex flex-col sm:flex-row gap-2">
                        <input
                          id={`${baseId}-custom-domain`}
                          type="text"
                          dir="ltr"
                          placeholder="dr-example.ir"
                          value={customDomainInput}
                          onChange={(e) => setCustomDomainInput(e.target.value)}
                          className="flex-1 min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base tabular-nums"
                        />
                        <button
                          type="button"
                          disabled={domainBusy || !customDomainInput.trim()}
                          onClick={handleRegisterDomain}
                          className="min-h-[48px] px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                        >
                          ثبت دامنه
                        </button>
                      </div>

                      {domains.length > 0 ? (
                        <div className="space-y-3 pt-2 border-t border-border">
                          {domains.map((dom) => (
                            <div
                              key={dom.id}
                              className="rounded-xl border border-border bg-subtle/40 p-3.5 space-y-2.5"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span dir="ltr" className="text-sm font-semibold text-ink tabular-nums">
                                  {dom.hostname}
                                </span>
                                <StatusBadge
                                  variant={dom.status === "verified" ? "confirmed" : "pending"}
                                  label={
                                    dom.status === "verified"
                                      ? "متصل و SSL فعال"
                                      : "در انتظار تایید DNS"
                                  }
                                />
                              </div>

                              {dom.status !== "verified" ? (
                                <>
                                  <CopyField
                                    label="رکورد TXT تایید مالکیت"
                                    value={dom.txtToken}
                                    monospace
                                  />
                                  <button
                                    type="button"
                                    disabled={domainBusy}
                                    onClick={() => void handleVerifyDomain(dom.id)}
                                    className="min-h-[44px] px-4 rounded-xl border border-border-strong bg-surface text-xs sm:text-sm font-medium text-ink hover:bg-subtle"
                                  >
                                    بررسی و تایید DNS
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
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
                            className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-base md:text-sm tabular-nums"
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
                            className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-base md:text-sm tabular-nums"
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
                            className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-base md:text-sm tabular-nums"
                          />
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={profileSaving}
                        onClick={handleSaveProfileAndPayments}
                        className="w-full min-h-[48px] rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                      >
                        {profileSaving
                          ? "در حال ذخیره..."
                          : "ذخیره تنظیمات پروفایل و پرداخت"}
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
                        نگارش و انتشار یادداشت‌های تخصصی در دیتابیس
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPostId("");
                          setBlogTitle("");
                          setBlogSlug("");
                          setBlogSummary("");
                          setBlogMarkdown("");
                          setBlogSeoTitle("");
                          setBlogSeoDesc("");
                          setBlogStatus("draft");
                        }}
                        className="min-h-[44px] px-3.5 rounded-xl border border-border bg-subtle text-xs sm:text-sm font-medium text-ink"
                      >
                        + مقاله جدید
                      </button>
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

                  {blogPosts.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {blogPosts.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setEditingPostId(p.id);
                            setBlogTitle(p.title);
                            setBlogSlug(p.slug);
                            setBlogSummary(p.excerpt);
                            setBlogMarkdown(p.body_markdown);
                            setBlogStatus(p.status);
                            setBlogSeoTitle(p.seo_title);
                            setBlogSeoDesc(p.seo_description);
                          }}
                          className={`min-h-[44px] px-3 rounded-xl border text-xs sm:text-sm transition-colors ${
                            editingPostId === p.id
                              ? "border-accent bg-accent-tint text-accent font-medium"
                              : "border-border bg-subtle/50 text-ink-secondary hover:bg-subtle"
                          }`}
                        >
                          {p.title}
                        </button>
                      ))}
                    </div>
                  ) : null}

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
                        className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface font-mono text-base md:text-sm tabular-nums"
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

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                      disabled={blogSaving}
                      onClick={handleSaveBlogPost}
                      className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-sm sm:text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                    >
                      {blogSaving ? "در حال ذخیره..." : "ذخیره مقاله"}
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {/* Lightbox Zoom / Rotate Modal */}
            <ReceiptLightbox
              isOpen={Boolean(lightboxData)}
              onClose={() => setLightboxData(null)}
              imageUrl={lightboxData?.url ?? ""}
              title={
                lightboxData
                  ? `رسید پرداخت ${lightboxData.booking.clientName}`
                  : "بررسی تصویر رسید"
              }
              metadataLine={
                lightboxData ? (
                  <span className="inline-flex flex-wrap items-center gap-1.5">
                    <span dir="ltr" className="inline-block font-mono tabular-nums">
                      {lightboxData.booking.referenceCode}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>کد پیگیری</span>
                    <span dir="ltr" className="inline-block font-mono tabular-nums">
                      {lightboxData.trackingCode}
                    </span>
                  </span>
                ) : undefined
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
                  disabled={approveBusy}
                  onClick={handleConfirmApprove}
                  className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                >
                  {approveBusy ? "در حال تایید..." : "تایید نهایی و فعال‌سازی لینک جلسه"}
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
                  disabled={rejectBusy}
                  onClick={handleConfirmReject}
                  className="w-full min-h-[48px] rounded-xl bg-status-rejected-ink text-white text-base font-medium hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {rejectBusy ? "در حال ثبت..." : "ثبت رد رسید و ارسال پیام به مراجع"}
                </button>
              </div>
            </SheetModal>
          </div>
        )}
      </main>
    </>
  );
}
