"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  Download,
  Globe,
  Layers,
  MapPin,
  ShieldCheck,
  Timer,
  UploadCloud,
  UserCheck,
} from "lucide-react";
import { GregorianCalendar } from "@/components/calendar/GregorianCalendar";
import { JalaliCalendar } from "@/components/calendar/JalaliCalendar";
import { CopyField } from "@/components/ui/CopyField";
import { PhoneInput } from "@/components/ui/PhoneInput";
import { SheetModal } from "@/components/ui/SheetModal";
import { StatusBadge } from "@/components/ui/StatusBadge";
import {
  readVerifiedClientSession,
  writeVerifiedClientSession,
} from "@/lib/client-session";
import { downloadIcsFile } from "@/lib/ics";
import {
  formatCurrency,
  formatJalaliLong,
  toPersianDigits,
  toWesternDigits,
} from "@/lib/jalali";
import {
  generateMockSlotsForTherapist,
  getPaymentAccountsForHeldBooking,
  getRebookPresetById,
  jalaliPartsFromKey,
  type BookingTrack,
  type TherapistProfile,
  type TimeSlotOption,
} from "@/lib/mock-data";
import type { TenantMode } from "@/lib/tenant-href";
import {
  detectBrowserTimezone,
  formatDualSlot,
  formatGregorianDateKeyInZone,
  getTimezoneOffsetLabel,
} from "@/lib/timezone";

interface BookingWizardProps {
  therapist: TherapistProfile;
  mode: TenantMode;
  slug: string;
  initialRebookId?: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5; // 5 = Post-submit Pending Confirmation
type TrackBMethod = "paypal" | "iban" | "usdt";

interface HeldBookingState {
  id: string;
  referenceCode: string;
  holdExpiresAtMs: number;
  slot: TimeSlotOption;
  track: BookingTrack;
  serviceId: string;
}

interface FieldErrors {
  clientName?: string;
  phone?: string;
  email?: string;
  policy?: string;
}

const ALLOWED_RECEIPT_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024; // 5 MiB

function getStepLabels() {
  return [
    { step: 1 as const, label: "۱. نوع جلسه", icon: Layers },
    { step: 2 as const, label: "۲. انتخاب زمان", icon: Calendar },
    { step: 3 as const, label: "۳. اطلاعات و تایید", icon: UserCheck },
    { step: 4 as const, label: "۴. پرداخت و رسید", icon: CreditCard },
  ];
}

function formatCountdownMmSs(secondsRemaining: number, usePersianDigits: boolean): string {
  const safe = Math.max(0, Math.floor(secondsRemaining));
  const mm = String(Math.floor(safe / 60)).padStart(2, "0");
  const ss = String(safe % 60).padStart(2, "0");
  const raw = `${mm}:${ss}`;
  return usePersianDigits ? toPersianDigits(raw) : raw;
}

export function BookingWizard({
  therapist,
  initialRebookId,
}: BookingWizardProps) {
  const rebookPreset = useMemo(() => {
    if (!initialRebookId) return undefined;
    const preset = getRebookPresetById(initialRebookId);
    if (preset && preset.therapistSlug === therapist.slug) {
      return preset;
    }
    return undefined;
  }, [initialRebookId, therapist.slug]);

  const allSlots = useMemo(
    () => generateMockSlotsForTherapist(therapist.slug),
    [therapist.slug],
  );

  const initialTrack: BookingTrack = rebookPreset?.track ?? "iran";
  const initialOffering = useMemo(() => {
    const byPreset = rebookPreset
      ? therapist.offerings.find((o) => o.id === rebookPreset.serviceId)
      : undefined;
    return (
      byPreset ??
      therapist.offerings.find((o) => o.track === initialTrack) ??
      therapist.offerings[0]
    );
  }, [initialTrack, rebookPreset, therapist.offerings]);

  const [step, setStep] = useState<WizardStep>(rebookPreset ? 2 : 1);
  const [track, setTrack] = useState<BookingTrack>(initialTrack);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string>(
    initialOffering?.id ?? "",
  );
  const [clientTimezone, setClientTimezone] = useState<string>("Europe/Berlin");

  const [selectedJalaliDateKey, setSelectedJalaliDateKey] = useState<string | null>(
    () => allSlots[0]?.tehranJalaliKey ?? "1405-09-07",
  );
  const [selectedGregorianDateKey, setSelectedGregorianDateKey] = useState<string | null>(
    () =>
      allSlots[0]
        ? formatGregorianDateKeyInZone(new Date(allSlots[0].isoUtc), "Europe/Berlin")
        : "2026-12-01",
  );
  const [selectedSlot, setSelectedSlot] = useState<TimeSlotOption | null>(null);

  // Step 3 form state
  const [clientName, setClientName] = useState(rebookPreset?.clientName ?? "");
  const [phoneDialCode, setPhoneDialCode] = useState(
    rebookPreset?.phoneDialCode ?? (initialTrack === "iran" ? "+98" : "+49"),
  );
  const [phoneNational, setPhoneNational] = useState(
    rebookPreset?.phoneNational ?? "",
  );
  const [email, setEmail] = useState(rebookPreset?.email ?? "");
  const [note, setNote] = useState(rebookPreset?.note ?? "");
  const [policyAccepted, setPolicyAccepted] = useState(Boolean(rebookPreset));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  // Mobile summary collapsible toggle
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  // OTP Drawer state
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(120);
  const [isOtpVerified, setIsOtpVerified] = useState(false);

  // Step 4 Hold + Payment + Upload state
  const [heldBooking, setHeldBooking] = useState<HeldBookingState | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(15 * 60);
  const [abroadMethod, setAbroadMethod] = useState<TrackBMethod>("paypal");

  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptFileSize, setReceiptFileSize] = useState<number>(0);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [trackingCode, setTrackingCode] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTimersRef = useRef<number[]>([]);
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const noteId = useId();
  const trackingId = useId();

  useEffect(() => {
    const detected = detectBrowserTimezone("Europe/Berlin");
    if (detected && detected !== "Asia/Tehran") {
      setClientTimezone(detected);
      if (allSlots[0]) {
        setSelectedGregorianDateKey(
          formatGregorianDateKeyInZone(new Date(allSlots[0].isoUtc), detected),
        );
      }
    }
  }, [allSlots]);

  // Cleanup preview object URL & simulated upload timers on unmount / replace
  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

  useEffect(() => {
    return () => {
      for (const timerId of uploadTimersRef.current) {
        window.clearTimeout(timerId);
      }
      uploadTimersRef.current = [];
    };
  }, []);

  // OTP 120s timer
  useEffect(() => {
    if (!otpModalOpen || otpSecondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setOtpSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpModalOpen, otpSecondsLeft]);

  // Step 4 15-minute Hold countdown
  useEffect(() => {
    if (step !== 4 || !heldBooking) return;
    const updateRemaining = () => {
      const diff = Math.max(
        0,
        Math.ceil((heldBooking.holdExpiresAtMs - Date.now()) / 1000),
      );
      setHoldSecondsLeft(diff);
    };
    updateRemaining();
    const timer = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(timer);
  }, [step, heldBooking]);

  const trackOfferings = useMemo(
    () => therapist.offerings.filter((o) => o.track === track),
    [therapist.offerings, track],
  );

  const selectedOffering = useMemo(
    () =>
      trackOfferings.find((o) => o.id === selectedOfferingId) ??
      trackOfferings[0] ??
      therapist.offerings[0],
    [selectedOfferingId, therapist.offerings, trackOfferings],
  );

  // Jalali slot grouping
  const jalaliAvailableDates = useMemo(
    () => new Set(allSlots.map((s) => s.tehranJalaliKey)),
    [allSlots],
  );

  const slotsForSelectedJalaliDate = useMemo(() => {
    if (!selectedJalaliDateKey) return [];
    return allSlots.filter((s) => s.tehranJalaliKey === selectedJalaliDateKey);
  }, [allSlots, selectedJalaliDateKey]);

  const handleTrackChange = (nextTrack: BookingTrack) => {
    setTrack(nextTrack);
    const firstOfferingForTrack = therapist.offerings.find(
      (o) => o.track === nextTrack,
    );
    if (firstOfferingForTrack) {
      setSelectedOfferingId(firstOfferingForTrack.id);
    }
    setSelectedSlot(null);
    if (nextTrack === "iran") {
      setPhoneDialCode("+98");
    } else if (phoneDialCode === "+98") {
      setPhoneDialCode("+49");
    }
  };

  const handleJumpNearestJalali = () => {
    const firstSlot = allSlots[0];
    if (firstSlot) {
      setSelectedJalaliDateKey(firstSlot.tehranJalaliKey);
      setSelectedSlot(null);
    }
  };

  const primaryContactIdentifier = useMemo(() => {
    if (track === "abroad") {
      return email.trim().toLowerCase();
    }
    const digits = toWesternDigits(phoneNational).replace(/\D/g, "");
    const stripped = digits.startsWith("0") ? digits.slice(1) : digits;
    return `${phoneDialCode}${stripped}`;
  }, [email, phoneDialCode, phoneNational, track]);

  const validateStep3 = (): boolean => {
    const errors: FieldErrors = {};
    if (clientName.trim().length < 2) {
      errors.clientName = "لطفاً نام و نام خانوادگی خود را وارد کنید.";
    }
    const cleanPhoneDigits = toWesternDigits(phoneNational).replace(/\D/g, "");
    if (cleanPhoneDigits.length < 8) {
      errors.phone = "شماره تماس معتبر وارد کنید.";
    }
    const cleanEmail = email.trim();
    if (track === "abroad") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        errors.email =
          "برای مراجعان خارج از کشور وارد کردن ایمیل معتبر جهت دریافت کد تایید الزامی است.";
      }
    } else if (cleanEmail.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      errors.email = "فرمت ایمیل واردشده معتبر نیست.";
    }
    if (!policyAccepted) {
      errors.policy = "پذیرش قوانین لغو و تغییر زمان جلسه الزامی است.";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const createHoldAndAdvanceToStep4 = () => {
    if (!selectedSlot || !selectedOffering) return;
    const randomSuffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    setHeldBooking({
      id: `hold-${Date.now()}`,
      referenceCode: `RN-${randomSuffix}`,
      holdExpiresAtMs: Date.now() + 15 * 60 * 1000,
      slot: selectedSlot,
      track,
      serviceId: selectedOffering.id,
    });
    setHoldSecondsLeft(15 * 60);
    setStep(4);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const expectedVerifyChannel = track === "abroad" ? "email" : "phone";

  const handleStep3Proceed = () => {
    if (!validateStep3()) return;

    // Check if an existing OTP-verified session matches the same channel & identifier
    const existing = readVerifiedClientSession();
    const matchedExisting = Boolean(
      existing &&
        existing.channel === expectedVerifyChannel &&
        existing.identifier === primaryContactIdentifier,
    );

    if (matchedExisting) {
      setIsOtpVerified(true);
      createHoldAndAdvanceToStep4();
      return;
    }

    setOtpCode("");
    setOtpError(null);
    setOtpSecondsLeft(120);
    setOtpModalOpen(true);
  };

  const handleVerifyOtp = () => {
    const normalized = toWesternDigits(otpCode).replace(/\D/g, "");
    if (normalized.length !== 6) {
      setOtpError("لطفاً کد ۶ رقمی ارسال‌شده را به صورت کامل وارد کنید.");
      return;
    }
    if (normalized !== "123456") {
      setOtpError("کد واردشده نادرست است. در محیط پیش‌نمایش از کد 123456 استفاده کنید.");
      return;
    }

    writeVerifiedClientSession(expectedVerifyChannel, primaryContactIdentifier);

    setOtpError(null);
    setOtpModalOpen(false);
    setIsOtpVerified(true);
    createHoldAndAdvanceToStep4();
  };

  const clearUploadTimers = () => {
    for (const timerId of uploadTimersRef.current) {
      window.clearTimeout(timerId);
    }
    uploadTimersRef.current = [];
  };

  const handleReceiptFileSelection = (file: File | undefined) => {
    if (!file) return;

    if (!ALLOWED_RECEIPT_MIME.has(file.type)) {
      setUploadError("تنها تصاویر JPG، PNG یا WEBP با حجم حداکثر ۵ مگابایت مجاز است.");
      return;
    }
    if (file.size <= 0 || file.size > MAX_RECEIPT_BYTES) {
      setUploadError("تنها تصاویر JPG، PNG یا WEBP با حجم حداکثر ۵ مگابایت مجاز است.");
      return;
    }

    clearUploadTimers();
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setUploadError(null);
    setReceiptFileName(file.name);
    setReceiptFileSize(file.size);
    setReceiptPreviewUrl(preview);
    setUploadProgress(25);

    const t1 = window.setTimeout(() => setUploadProgress(65), 140);
    const t2 = window.setTimeout(() => setUploadProgress(100), 320);
    uploadTimersRef.current = [t1, t2];
  };

  const handleClearReceipt = () => {
    clearUploadTimers();
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptPreviewUrl(null);
    setReceiptFileName(null);
    setReceiptFileSize(0);
    setUploadProgress(0);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmitReceipt = () => {
    if (
      !heldBooking ||
      holdSecondsLeft <= 0 ||
      Date.now() >= heldBooking.holdExpiresAtMs
    ) {
      setHoldSecondsLeft(0);
      return;
    }
    if (!receiptPreviewUrl || uploadProgress < 100) {
      setUploadError("لطفاً تصویر رسید پرداخت (JPG، PNG یا WEBP) را بارگذاری کنید.");
      return;
    }
    setStep(5);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Payment accounts are retrieved ONLY in Step 4 when verified & held!
  const paymentAccounts =
    step === 4 && isOtpVerified && heldBooking
      ? getPaymentAccountsForHeldBooking(therapist.slug)
      : null;

  const availableAbroadMethods = (["paypal", "iban", "usdt"] as const).filter(
    (m) => Boolean(paymentAccounts?.abroad[m]),
  );
  const activeAbroadMethod: TrackBMethod = availableAbroadMethods.includes(
    abroadMethod,
  )
    ? abroadMethod
    : (availableAbroadMethods[0] ?? "paypal");

  const selectedSlotDisplay = useMemo(() => {
    if (!selectedSlot) return null;
    if (track === "iran") {
      const parts = jalaliPartsFromKey(selectedSlot.tehranJalaliKey);
      const dateFa = parts
        ? formatJalaliLong(parts.jy, parts.jm, parts.jd)
        : selectedSlot.tehranJalaliKey;
      return {
        primary: `${dateFa} · ساعت ${selectedSlot.tehranTimeFa}`,
        secondary: "به وقت رسمی تهران",
      };
    }
    const dual = formatDualSlot(selectedSlot.isoUtc, clientTimezone);
    return {
      primary: `${dual.dateLabelEn} · ${dual.localTime24h}`,
      secondary: `معادل ${dual.tehranTimeFa} تهران (${clientTimezone})`,
    };
  }, [clientTimezone, selectedSlot, track]);

  const priceDisplay = selectedOffering
    ? formatCurrency(selectedOffering.priceAmount, selectedOffering.currency)
    : "";

  const isHoldExpired = step === 4 && holdSecondsLeft <= 0;

  const renderPrimaryMobileCta = () => {
    if (step === 1) {
      return (
        <button
          type="button"
          onClick={() => setStep(2)}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
        >
          ادامه و انتخاب زمان
        </button>
      );
    }
    if (step === 2) {
      return (
        <button
          type="button"
          disabled={!selectedSlot}
          onClick={() => setStep(3)}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
        >
          {selectedSlot ? "ادامه به اطلاعات مراجع" : "ابتدا زمان جلسه را انتخاب کنید"}
        </button>
      );
    }
    if (step === 3) {
      return (
        <button
          type="button"
          onClick={handleStep3Proceed}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
        >
          رزرو موقت ۱۵ دقیقه‌ای و ادامه به پرداخت
        </button>
      );
    }
    if (step === 4) {
      return (
        <button
          type="button"
          disabled={isHoldExpired || !receiptPreviewUrl || uploadProgress < 100}
          onClick={handleSubmitReceipt}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
        >
          ثبت رسید و ارسال برای تایید درمانگر
        </button>
      );
    }
    return null;
  };

  if (step === 5 && heldBooking && selectedOffering) {
    return (
      <section className="max-w-2xl mx-auto bg-surface border border-border rounded-2xl p-6 sm:p-8 space-y-6">
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-full bg-status-confirmed-bg border border-status-confirmed-border text-status-confirmed-ink inline-flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
            </span>
            <StatusBadge variant="pending" label="در انتظار تایید درمانگر" />
          </div>
          <h2 className="text-2xl font-bold text-ink">
            رسید شما با موفقیت ثبت شد
          </h2>
          <p className="text-base leading-[1.8] text-ink-secondary">
            درخواست نوبت شما برای {therapist.displayName} ارسال شد. پس از بررسی تصویر رسید توسط درمانگر، تاییدیه و لینک اختصاصی جلسه آنلاین برای شما فعال و از طریق پورتال «پیگیری نوبت» قابل دسترسی خواهد بود.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-subtle/50 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-muted">کد پیگیری نوبت</span>
            <span dir="ltr" className="font-mono font-bold text-ink tabular-nums">
              {heldBooking.referenceCode}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-muted">نوع جلسه</span>
            <span className="font-medium text-ink">
              <bdi dir="auto">{selectedOffering.title}</bdi>
            </span>
          </div>
          {selectedSlotDisplay ? (
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink-muted">زمان انتخاب‌شده</span>
              <span className="font-medium text-ink text-end tabular-nums">
                <bdi dir="auto">{selectedSlotDisplay.primary}</bdi>
              </span>
            </div>
          ) : null}
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="text-ink-muted">مبلغ</span>
            <span className="font-semibold text-ink tabular-nums">{priceDisplay}</span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/my-sessions"
            className="flex-1 min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
          >
            پیگیری وضعیت نوبت
          </Link>
          <button
            type="button"
            onClick={() =>
              downloadIcsFile(`ravannama-${heldBooking.referenceCode}.ics`, {
                uid: heldBooking.referenceCode,
                title: `جلسه مشاوره آنلاین با ${therapist.displayName}`,
                description: `کد پیگیری: ${heldBooking.referenceCode} — ${selectedOffering.title}`,
                startIsoUtc: heldBooking.slot.isoUtc,
                durationMinutes: selectedOffering.durationMinutes,
              })
            }
            className="min-h-[48px] inline-flex items-center justify-center gap-2 px-5 rounded-xl border border-border-strong bg-surface text-ink text-sm sm:text-base font-medium hover:bg-subtle transition-colors"
          >
            <Download className="w-4 h-4 shrink-0 text-ink-muted" aria-hidden="true" />
            <span>افزودن به تقویم (.ics)</span>
          </button>
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-6 pb-28 lg:pb-0">
      {/* Rebook context notice */}
      {rebookPreset ? (
        <div className="rounded-2xl border border-status-info-border bg-status-info-bg px-4 py-3.5 text-sm text-status-info-ink flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p>
            اطلاعات پرونده قبلی شما جای‌گذاری شد. لطفاً یک زمان آزاد انتخاب کرده و رسید اصلاح‌شده را بارگذاری کنید.
          </p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="shrink-0 min-h-[44px] px-3 rounded-xl border border-status-info-border bg-surface text-ink text-xs font-medium hover:bg-subtle transition-colors"
          >
            تغییر نوع جلسه
          </button>
        </div>
      ) : null}

      {/* Step Indicator */}
      <nav aria-label="مراحل رزرو جلسه" className="bg-surface border border-border rounded-2xl p-3 sm:p-4">
        <ol className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {getStepLabels().map((item) => {
            const isCurrent = step === item.step;
            const isCompleted = step > item.step;
            const canClickBack = item.step < step && step < 4;
            const StepIcon = item.icon;

            return (
              <li key={item.step}>
                <button
                  type="button"
                  disabled={!canClickBack}
                  onClick={() => {
                    if (canClickBack) setStep(item.step);
                  }}
                  aria-current={isCurrent ? "step" : undefined}
                  className={`w-full min-h-[44px] px-3 py-2 rounded-xl text-xs sm:text-sm font-medium text-start flex items-center gap-2 tabular-nums transition-colors ${
                    isCurrent
                      ? "bg-accent text-white"
                      : isCompleted
                        ? "bg-accent-tint text-accent"
                        : "bg-subtle/60 text-ink-muted"
                  } ${canClickBack ? "cursor-pointer hover:opacity-90" : "cursor-default"}`}
                >
                  <StepIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Mobile Collapsible Summary Pill */}
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileSummaryOpen((o) => !o)}
          aria-expanded={mobileSummaryOpen}
          className="w-full min-h-[48px] px-4 py-3 rounded-2xl border border-border bg-surface flex items-center justify-between gap-3 text-sm"
        >
          <span className="font-semibold text-ink">خلاصه انتخاب شما</span>
          <span className="flex items-center gap-2 text-accent font-semibold tabular-nums">
            <span>{priceDisplay}</span>
            <svg
              className={`w-4 h-4 transition-transform ${mobileSummaryOpen ? "rotate-180" : ""}`}
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
          </span>
        </button>

        {mobileSummaryOpen ? (
          <div className="mt-2 rounded-2xl border border-border bg-surface p-4 space-y-2.5 text-sm">
            <div className="flex justify-between gap-2">
              <span className="text-ink-muted">درمانگر</span>
              <span className="font-medium text-ink">{therapist.displayName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-ink-muted">مسیر</span>
              <span className="font-medium text-ink">
                {track === "iran" ? "داخل ایران (ریالی)" : "خارج از ایران (ارزی)"}
              </span>
            </div>
            {selectedOffering ? (
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted">جلسه</span>
                <span className="font-medium text-ink">
                  <bdi dir="auto">{selectedOffering.title}</bdi>
                </span>
              </div>
            ) : null}
            {selectedSlotDisplay ? (
              <div className="flex justify-between gap-2">
                <span className="text-ink-muted">زمان</span>
                <span className="font-medium text-ink text-end tabular-nums">
                  <bdi dir="auto">{selectedSlotDisplay.primary}</bdi>
                </span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Desktop 12-Col Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Step Area */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-6">
          {/* STEP 1 */}
          {step === 1 ? (
            <div className="space-y-6">
              <div className="space-y-2">
                <h2 className="text-lg sm:text-xl font-bold text-ink">
                  ۱. انتخاب مسیر اقامت و نوع جلسه
                </h2>
                <p className="text-sm text-ink-secondary">
                  تقویم، واحد مبلغ و روش پرداخت متناسب با موقعیت شما تنظیم می‌شود.
                </p>
              </div>

              <div className="space-y-2.5">
                <span className="block text-sm font-medium text-ink">
                  موقعیت فعلی شما
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => handleTrackChange("iran")}
                    aria-pressed={track === "iran"}
                    className={`min-h-[52px] px-4 py-3 rounded-xl border text-start transition-colors flex items-start gap-3 ${
                      track === "iran"
                        ? "border-accent bg-accent-tint text-accent font-semibold"
                        : "border-border-strong bg-surface text-ink hover:bg-subtle"
                    }`}
                  >
                    <MapPin className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <span className="block text-sm sm:text-base">داخل ایران</span>
                      <span className="block text-xs text-ink-muted mt-0.5">
                        پرداخت ریالی · ساعت تهران
                      </span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTrackChange("abroad")}
                    aria-pressed={track === "abroad"}
                    className={`min-h-[52px] px-4 py-3 rounded-xl border text-start transition-colors flex items-start gap-3 ${
                      track === "abroad"
                        ? "border-accent bg-accent-tint text-accent font-semibold"
                        : "border-border-strong bg-surface text-ink hover:bg-subtle"
                    }`}
                  >
                    <Globe className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <div>
                      <span className="block text-sm sm:text-base">خارج از ایران</span>
                      <span className="block text-xs text-ink-muted mt-0.5">
                        پرداخت ارزی · ساعت محلی شما
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              <div className="space-y-3" role="radiogroup" aria-label="نوع جلسه">
                <span className="block text-sm font-medium text-ink">
                  انتخاب نوع جلسه آنلاین
                </span>
                {trackOfferings.map((offering) => {
                  const isSelected = selectedOffering?.id === offering.id;
                  return (
                    <button
                      key={offering.id}
                      type="button"
                      role="radio"
                      aria-checked={isSelected}
                      onClick={() => setSelectedOfferingId(offering.id)}
                      className={`w-full text-start rounded-2xl border p-4 cursor-pointer transition-colors space-y-2 ${
                        isSelected
                          ? "border-accent bg-accent-tint"
                          : "border-border bg-surface hover:border-border-strong hover:bg-subtle/40"
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-base font-semibold text-ink">
                          {offering.title}
                        </span>
                        <span
                          dir={offering.currency === "IRT" ? "rtl" : "ltr"}
                          className="text-base font-bold text-accent tabular-nums"
                        >
                          {formatCurrency(offering.priceAmount, offering.currency)}
                        </span>
                      </div>
                      <p className="text-sm text-ink-secondary">
                        {offering.description}
                      </p>
                      <span className="inline-flex items-center rounded-full bg-surface border border-border px-2.5 py-0.5 text-xs text-ink-muted tabular-nums">
                        مدت جلسه: {toPersianDigits(offering.durationMinutes)} دقیقه
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="hidden lg:flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
                >
                  ادامه و انتخاب زمان
                </button>
              </div>
            </div>
          ) : null}

          {/* STEP 2 */}
          {step === 2 ? (
            <div className="space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-bold text-ink">
                    ۲. انتخاب روز و ساعت جلسه
                  </h2>
                  <p className="text-sm text-ink-secondary">
                    {track === "iran"
                      ? "تقویم رسمی جلالی با ساعت تهران"
                      : "تقویم میلادی همگام با منطقه زمانی شما"}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[44px] px-3.5 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
                >
                  بازگشت به نوع جلسه
                </button>
              </div>

              {track === "iran" ? (
                <JalaliCalendar
                  availableDates={jalaliAvailableDates}
                  selectedDateKey={selectedJalaliDateKey}
                  onSelectDate={(key) => {
                    setSelectedJalaliDateKey(key);
                    setSelectedSlot(null);
                  }}
                  slotsForSelectedDate={slotsForSelectedJalaliDate}
                  selectedSlotId={selectedSlot?.id ?? null}
                  onSelectSlot={setSelectedSlot}
                  onJumpToNearestAvailable={handleJumpNearestJalali}
                />
              ) : (
                <GregorianCalendar
                  allSlots={allSlots}
                  clientTimezone={clientTimezone}
                  onChangeTimezone={(nextTz) => {
                    setClientTimezone(nextTz);
                    setSelectedSlot(null);
                    if (allSlots[0]) {
                      setSelectedGregorianDateKey(
                        formatGregorianDateKeyInZone(new Date(allSlots[0].isoUtc), nextTz),
                      );
                    }
                  }}
                  selectedDateKeyEn={selectedGregorianDateKey}
                  onSelectDateKeyEn={(key) => {
                    setSelectedGregorianDateKey(key);
                    setSelectedSlot(null);
                  }}
                  selectedSlotId={selectedSlot?.id ?? null}
                  onSelectSlot={setSelectedSlot}
                />
              )}

              <div className="hidden lg:flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="min-h-[48px] px-5 rounded-xl border border-border-strong bg-surface text-ink text-base font-medium hover:bg-subtle transition-colors"
                >
                  مرحله قبل
                </button>
                <button
                  type="button"
                  disabled={!selectedSlot}
                  onClick={() => setStep(3)}
                  className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
                >
                  ادامه به اطلاعات مراجع
                </button>
              </div>
            </div>
          ) : null}

          {/* STEP 3 */}
          {step === 3 ? (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <h2 className="text-lg sm:text-xl font-bold text-ink">
                    ۳. اطلاعات مراجع و تایید شماره/ایمیل
                  </h2>
                  <p className="text-sm text-ink-secondary">
                    نیازی به ساخت حساب قبلی نیست؛ اطلاعات پرداخت بلافاصله پس از تایید کد یک‌بارمصرف نمایش داده می‌شود.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[44px] px-3.5 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
                >
                  تغییر زمان
                </button>
              </div>

              <div className="space-y-4">
                {/* Full Name */}
                <div className="space-y-1.5">
                  <label htmlFor={nameId} className="block text-sm font-medium text-ink">
                    نام و نام خانوادگی <span className="text-status-rejected-ink">*</span>
                  </label>
                  <input
                    id={nameId}
                    type="text"
                    value={clientName}
                    onChange={(e) => {
                      setClientName(e.target.value);
                      if (fieldErrors.clientName) {
                        setFieldErrors((prev) => ({ ...prev, clientName: undefined }));
                      }
                    }}
                    placeholder="مثلاً سارا بهرامی"
                    aria-invalid={Boolean(fieldErrors.clientName)}
                    aria-describedby={fieldErrors.clientName ? `${nameId}-err` : undefined}
                    className={`w-full min-h-[48px] px-3.5 rounded-xl border bg-surface text-base text-ink placeholder:text-ink-muted ${
                      fieldErrors.clientName
                        ? "border-status-rejected-ink"
                        : "border-border-strong focus:border-accent"
                    }`}
                  />
                  {fieldErrors.clientName ? (
                    <p
                      id={`${nameId}-err`}
                      className="text-[13px] text-status-rejected-ink"
                    >
                      {fieldErrors.clientName}
                    </p>
                  ) : null}
                </div>

                {/* Collision-free Flex PhoneInput */}
                <div className="space-y-1.5">
                  <label htmlFor={phoneId} className="block text-sm font-medium text-ink">
                    شماره موبایل (واتساپ / تماس) <span className="text-status-rejected-ink">*</span>
                  </label>
                  <PhoneInput
                    id={phoneId}
                    dialCode={phoneDialCode}
                    nationalNumber={phoneNational}
                    onDialCodeChange={setPhoneDialCode}
                    onNationalNumberChange={(val) => {
                      setPhoneNational(val);
                      if (fieldErrors.phone) {
                        setFieldErrors((prev) => ({ ...prev, phone: undefined }));
                      }
                    }}
                    hasError={Boolean(fieldErrors.phone)}
                    describedBy={fieldErrors.phone ? `${phoneId}-err` : undefined}
                  />
                  {fieldErrors.phone ? (
                    <p
                      id={`${phoneId}-err`}
                      className="text-[13px] text-status-rejected-ink"
                    >
                      {fieldErrors.phone}
                    </p>
                  ) : null}
                </div>

                {/* Email */}
                <div className="space-y-1.5">
                  <label htmlFor={emailId} className="block text-sm font-medium text-ink">
                    ایمیل{" "}
                    {track === "abroad" ? (
                      <span className="text-status-rejected-ink">* (الزامی برای کد تایید)</span>
                    ) : (
                      <span className="text-ink-muted font-normal">(اختیاری)</span>
                    )}
                  </label>
                  <input
                    id={emailId}
                    type="email"
                    dir="ltr"
                    inputMode="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (fieldErrors.email) {
                        setFieldErrors((prev) => ({ ...prev, email: undefined }));
                      }
                    }}
                    placeholder="name@example.com"
                    aria-invalid={Boolean(fieldErrors.email)}
                    aria-describedby={fieldErrors.email ? `${emailId}-err` : undefined}
                    className={`w-full min-h-[48px] px-3.5 rounded-xl border bg-surface text-base text-ink tabular-nums placeholder:text-ink-muted ${
                      fieldErrors.email
                        ? "border-status-rejected-ink"
                        : "border-border-strong focus:border-accent"
                    }`}
                  />
                  {fieldErrors.email ? (
                    <p
                      id={`${emailId}-err`}
                      className="text-[13px] text-status-rejected-ink"
                    >
                      {fieldErrors.email}
                    </p>
                  ) : null}
                </div>

                {/* Confidential Short Note */}
                <div className="space-y-1.5">
                  <label htmlFor={noteId} className="block text-sm font-medium text-ink">
                    توضیح کوتاه برای درمانگر{" "}
                    <span className="text-ink-muted font-normal">(اختیاری · محرمانه)</span>
                  </label>
                  <textarea
                    id={noteId}
                    rows={3}
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="در صورت تمایل، موضوع اصلی جلسه را در چند خط کوتاه بنویسید..."
                    className="w-full px-3.5 py-3 rounded-xl border border-border-strong bg-surface text-base text-ink placeholder:text-ink-muted focus:border-accent"
                  />
                </div>

                {/* Policy Checkbox */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-start gap-3">
                    <input
                      id="booking-policy-check"
                      type="checkbox"
                      checked={policyAccepted}
                      onChange={(e) => {
                        setPolicyAccepted(e.target.checked);
                        if (fieldErrors.policy) {
                          setFieldErrors((prev) => ({ ...prev, policy: undefined }));
                        }
                      }}
                      aria-invalid={Boolean(fieldErrors.policy)}
                      className="mt-1 w-5 h-5 shrink-0 accent-accent rounded border-border-strong cursor-pointer"
                    />
                    <div className="text-sm text-ink-secondary leading-relaxed">
                      <label htmlFor="booking-policy-check" className="cursor-pointer">
                        قوانین لغو و تغییر زمان جلسه را مطالعه کردم و می‌پذیرم.
                      </label>{" "}
                      <button
                        type="button"
                        onClick={() => setPolicyModalOpen(true)}
                        className="text-accent font-medium underline underline-offset-4 hover:text-accent-hover min-h-[44px] inline-flex items-center"
                      >
                        مشاهده قوانین
                      </button>
                    </div>
                  </div>
                  {fieldErrors.policy ? (
                    <p className="text-[13px] text-status-rejected-ink">
                      {fieldErrors.policy}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="hidden lg:flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="min-h-[48px] px-5 rounded-xl border border-border-strong bg-surface text-ink text-base font-medium hover:bg-subtle transition-colors"
                >
                  مرحله قبل
                </button>
                <button
                  type="button"
                  onClick={handleStep3Proceed}
                  className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
                >
                  رزرو موقت ۱۵ دقیقه‌ای و ادامه به پرداخت
                </button>
              </div>
            </div>
          ) : null}

          {/* STEP 4 (Strictly gated behind OTP verification + active hold!) */}
          {step === 4 && isOtpVerified && heldBooking && paymentAccounts ? (
            <div className="space-y-6">
              {/* 15-min Hold Countdown Banner */}
              {isHoldExpired ? (
                <div
                  role="alert"
                  className="rounded-2xl border border-status-rejected-border bg-status-rejected-bg p-4 sm:p-5 space-y-3 text-status-rejected-ink"
                >
                  <p className="text-base font-semibold">
                    مهلت ۱۵ دقیقه‌ای رزرو موقت به پایان رسید
                  </p>
                  <p className="text-sm">
                    برای جلوگیری از تداخل نوبت‌ها، زمان انتخاب‌شده آزاد شده است. اطلاعات فرم شما محفوظ مانده است و می‌توانید زمان دیگری انتخاب کنید.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setHeldBooking(null);
                      setStep(2);
                    }}
                    className="min-h-[44px] px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                  >
                    انتخاب مجدد زمان
                  </button>
                </div>
              ) : (
                <div
                  aria-live="polite"
                  className="rounded-2xl border border-status-pending-border bg-status-pending-bg px-4 py-3.5 text-status-pending-ink flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-2.5">
                    <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
                    <div className="space-y-0.5">
                      <span className="block text-sm font-semibold">
                        نوبت شما موقتاً به نام شما قفل شده است
                      </span>
                      <span className="block text-xs">
                        لطفاً پیش از پایان مهلت، واریز را انجام داده و تصویر رسید را ارسال کنید.
                      </span>
                    </div>
                  </div>
                  <div className="rounded-xl bg-surface/85 border border-status-pending-border px-3 py-1.5 text-sm sm:text-base font-bold tabular-nums inline-flex items-center gap-1.5">
                    <Timer className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>
                      {formatCountdownMmSs(holdSecondsLeft, true)} باقی‌مانده تا حفظ نوبت
                    </span>
                  </div>
                </div>
              )}

              {/* Payment Destinations */}
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg sm:text-xl font-bold text-ink">
                    ۴. اطلاعات واریز و ارسال رسید
                  </h2>
                  <span className="text-base sm:text-lg font-bold text-accent">
                    مبلغ دقیق:{" "}
                    <span
                      dir={selectedOffering?.currency === "IRT" ? "rtl" : "ltr"}
                      className="inline-block tabular-nums"
                    >
                      {priceDisplay}
                    </span>
                  </span>
                </div>

                {track === "iran" ? (
                  <div className="rounded-2xl border border-border bg-surface p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-sm border-b border-border pb-3">
                      <span className="text-ink-secondary">
                        بانک مقصد:{" "}
                        <strong className="text-ink">{paymentAccounts.iran.bankName}</strong>
                      </span>
                      <span className="text-ink-secondary">
                        به نام:{" "}
                        <strong className="text-ink">
                          {paymentAccounts.iran.accountHolder}
                        </strong>
                      </span>
                    </div>

                    <CopyField
                      label="شماره کارت (کارت‌به‌کارت)"
                      value={paymentAccounts.iran.cardPan}
                    />
                    <CopyField
                      label="شماره شبا"
                      value={paymentAccounts.iran.sheba}
                      monospace
                    />
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          { id: "paypal", label: "PayPal" },
                          { id: "iban", label: "IBAN" },
                          { id: "usdt", label: "USDT" },
                        ] as const
                      ).map((tab) => {
                        const available = Boolean(paymentAccounts.abroad[tab.id]);
                        if (!available) return null;
                        const active = activeAbroadMethod === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setAbroadMethod(tab.id)}
                            className={`min-h-[44px] rounded-xl border text-sm font-medium transition-colors ${
                              active
                                ? "border-accent bg-accent-tint text-accent font-semibold"
                                : "border-border bg-subtle/50 text-ink hover:bg-subtle"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>

                    {activeAbroadMethod === "paypal" && paymentAccounts.abroad.paypal ? (
                      <div className="space-y-3">
                        <CopyField
                          label="آدرس PayPal"
                          value={paymentAccounts.abroad.paypal.email}
                          hint={paymentAccounts.abroad.paypal.holderName}
                        />
                      </div>
                    ) : null}

                    {activeAbroadMethod === "iban" && paymentAccounts.abroad.iban ? (
                      <div className="space-y-3">
                        <CopyField
                          label={`شماره IBAN (${paymentAccounts.abroad.iban.bankName})`}
                          value={paymentAccounts.abroad.iban.iban}
                          monospace
                          hint={`BIC: ${paymentAccounts.abroad.iban.bic}`}
                        />
                      </div>
                    ) : null}

                    {activeAbroadMethod === "usdt" && paymentAccounts.abroad.usdt ? (
                      <div className="space-y-3">
                        <CopyField
                          label="آدرس کیف‌پول USDT"
                          value={paymentAccounts.abroad.usdt.address}
                          monospace
                          hint={paymentAccounts.abroad.usdt.network}
                        />
                      </div>
                    ) : null}

                    <CopyField
                      label="کد مرجع محرمانه (در شرح واریز بنویسید)"
                      value={heldBooking.referenceCode}
                      monospace
                      hint="از درج واژه‌های درمانی در شرح تراکنش خودداری کنید"
                    />
                  </div>
                )}
              </div>

              {/* Strict Image-Only Receipt Upload Dropzone */}
              <div className="space-y-2.5">
                <span className="block text-sm font-semibold text-ink">
                  بارگذاری تصویر رسید پرداخت
                </span>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  id="receipt-file-input"
                  onChange={(e) => handleReceiptFileSelection(e.target.files?.[0])}
                />

                {!receiptPreviewUrl ? (
                  <label
                    htmlFor="receipt-file-input"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      handleReceiptFileSelection(e.dataTransfer.files?.[0]);
                    }}
                    className="min-h-[140px] rounded-2xl border-2 border-dashed border-border-strong bg-subtle/40 hover:bg-subtle/80 transition-colors p-5 flex flex-col items-center justify-center text-center gap-2 cursor-pointer"
                  >
                    <UploadCloud className="w-8 h-8 text-accent" aria-hidden="true" />
                    <span className="text-sm sm:text-base font-medium text-ink">
                      تصویر رسید بانکی را اینجا رها کنید یا لمس کنید
                    </span>
                    <span className="text-xs sm:text-sm text-ink-muted tabular-nums">
                      JPG, PNG, WEBP · حداکثر ۵ مگابایت
                    </span>
                  </label>
                ) : (
                  <div className="rounded-2xl border border-border bg-subtle/40 p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={receiptPreviewUrl}
                        alt="پیش‌نمایش تصویر رسید انتخاب‌شده"
                        className="w-20 h-24 object-cover rounded-xl border border-border bg-surface shrink-0"
                      />
                      <div className="flex-1 min-w-0 space-y-2">
                        <p className="text-sm font-medium text-ink truncate" dir="ltr">
                          {receiptFileName}
                        </p>
                        <p className="text-xs text-ink-muted tabular-nums">
                          حجم فایل:{" "}
                          {toPersianDigits(
                            Math.max(1, Math.round(receiptFileSize / 1024)),
                          )}{" "}
                          کیلوبایت
                        </p>
                        <div className="w-full h-2 rounded-full bg-muted-surface overflow-hidden">
                          <div
                            className="h-full bg-accent transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <span className="block text-xs text-status-confirmed-ink">
                          {uploadProgress >= 100
                            ? "تصویر آماده ثبت نهایی است"
                            : "در حال آماده‌سازی تصویر..."}
                        </span>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleClearReceipt}
                      className="min-h-[44px] px-3.5 rounded-xl border border-border-strong bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle transition-colors"
                    >
                      حذف و انتخاب تصویر دیگر
                    </button>
                  </div>
                )}

                {uploadError ? (
                  <p
                    role="alert"
                    className="text-[13px] text-status-rejected-ink font-medium"
                  >
                    {uploadError}
                  </p>
                ) : null}
              </div>

              {/* Optional Tracking Code */}
              <div className="space-y-1.5">
                <label htmlFor={trackingId} className="block text-sm font-medium text-ink">
                  شماره پیگیری / مرجع تراکنش (اختیاری)
                </label>
                <input
                  id={trackingId}
                  type="text"
                  dir="ltr"
                  inputMode="text"
                  value={trackingCode}
                  onChange={(e) => setTrackingCode(e.target.value)}
                  placeholder="482910374"
                  className="w-full min-h-[48px] px-3.5 rounded-xl border border-border-strong bg-surface text-base text-ink tabular-nums placeholder:text-ink-muted focus:border-accent"
                />
              </div>

              <div className="hidden lg:block pt-2">
                <button
                  type="button"
                  disabled={isHoldExpired || !receiptPreviewUrl || uploadProgress < 100}
                  onClick={handleSubmitReceipt}
                  className="w-full min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
                >
                  ثبت رسید و ارسال برای تایید درمانگر
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {/* Desktop Sticky Live Summary Card */}
        <aside className="hidden lg:block lg:col-span-5 lg:sticky lg:top-24 bg-surface border border-border rounded-2xl p-6 space-y-5">
          <div className="flex items-center gap-3 pb-4 border-b border-border">
            <Image
              src={therapist.avatarUrl}
              alt={therapist.displayName}
              width={56}
              height={56}
              className="w-14 h-14 rounded-full object-cover border border-border shrink-0"
            />
            <div className="min-w-0">
              <h3 className="text-base font-bold text-ink truncate">
                {therapist.displayName}
              </h3>
              <p className="text-xs text-ink-secondary truncate">
                {therapist.subtitle}
              </p>
            </div>
          </div>

          <dl className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-2">
              <dt className="text-ink-muted">مسیر انتخاب‌شده</dt>
              <dd className="font-medium text-ink">
                {track === "iran" ? "داخل ایران (ریالی)" : "خارج از ایران (ارزی)"}
              </dd>
            </div>

            {selectedOffering ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-ink-muted">نوع جلسه</dt>
                  <dd className="font-medium text-ink">
                    <bdi dir="auto">{selectedOffering.title}</bdi>
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt className="text-ink-muted">مدت زمان</dt>
                  <dd className="font-medium text-ink tabular-nums">
                    {toPersianDigits(selectedOffering.durationMinutes)} دقیقه
                  </dd>
                </div>
              </>
            ) : null}

            <div className="flex items-start justify-between gap-2">
              <dt className="text-ink-muted shrink-0">زمان جلسه</dt>
              <dd className="text-end font-medium text-ink tabular-nums">
                {selectedSlotDisplay ? (
                  <>
                    <span className="block">
                      <bdi dir="auto">{selectedSlotDisplay.primary}</bdi>
                    </span>
                    <span className="block text-xs text-ink-muted mt-0.5">
                      {selectedSlotDisplay.secondary}
                    </span>
                  </>
                ) : (
                  <span className="text-ink-muted">هنوز انتخاب نشده</span>
                )}
              </dd>
            </div>

            {track === "abroad" ? (
              <div className="flex items-center justify-between gap-2">
                <dt className="text-ink-muted">منطقه زمانی</dt>
                <dd className="text-xs font-medium text-ink-secondary text-end">
                  <span dir="ltr" className="inline-block tabular-nums">
                    {clientTimezone} ({getTimezoneOffsetLabel(clientTimezone)})
                  </span>
                </dd>
              </div>
            ) : null}
          </dl>

          <div className="pt-4 border-t border-border flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-ink-secondary">
              مبلغ قابل پرداخت
            </span>
            <span
              dir={selectedOffering?.currency === "IRT" ? "rtl" : "ltr"}
              className="text-lg font-bold text-accent tabular-nums"
            >
              {priceDisplay}
            </span>
          </div>
        </aside>
      </div>

      {/* Mobile Sticky Bottom Bar */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[var(--shadow-sticky)]">
        {renderPrimaryMobileCta()}
      </div>

      {/* Inline OTP Verification SheetModal */}
      <SheetModal
        isOpen={otpModalOpen}
        onClose={() => setOtpModalOpen(false)}
        title="تایید شماره تماس / ایمیل"
        subtitle="برای جلوگیری از رزروهای جعلی و نمایش امن اطلاعات واریز، کد ۶ رقمی را وارد کنید"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          <div className="rounded-xl bg-subtle p-3.5 text-sm space-y-1 text-start">
            <span className="block text-xs text-ink-muted">کد تایید به این نشانی ارسال شد:</span>
            <p className="text-start">
              <span dir="ltr" className="inline-block font-semibold text-ink tabular-nums">
                {primaryContactIdentifier}
              </span>
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="booking-otp-input" className="block text-sm font-medium text-ink">
              کد تایید ۶ رقمی
            </label>
            <input
              id="booking-otp-input"
              type="text"
              dir="ltr"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={otpCode}
              onChange={(e) => {
                setOtpCode(toWesternDigits(e.target.value).replace(/\D/g, "").slice(0, 6));
                setOtpError(null);
              }}
              placeholder="123456"
              className="w-full min-h-[48px] px-4 rounded-xl border border-border-strong bg-surface text-center text-lg font-bold tracking-[0.25em] text-ink tabular-nums focus:border-accent"
            />
            <p className="text-xs text-ink-muted text-center">
              (کد آزمایشی پیش‌نمایش:{" "}
              <span dir="ltr" className="font-mono font-semibold text-ink">
                123456
              </span>
              )
            </p>
            {otpError ? (
              <p role="alert" className="text-[13px] text-status-rejected-ink text-center">
                {otpError}
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between text-xs sm:text-sm" aria-live="polite">
            <span className="text-ink-muted tabular-nums">
              {otpSecondsLeft > 0
                ? `اعتبار کد: ${formatCountdownMmSs(otpSecondsLeft, true)}`
                : "مهلت کد به پایان رسید"}
            </span>
            <button
              type="button"
              disabled={otpSecondsLeft > 0}
              onClick={() => {
                setOtpSecondsLeft(120);
                setOtpError(null);
              }}
              className="min-h-[44px] px-2 text-accent font-medium disabled:text-ink-muted disabled:cursor-not-allowed"
            >
              ارسال مجدد کد
            </button>
          </div>

          <button
            type="button"
            onClick={handleVerifyOtp}
            className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
          >
            تایید کد و قفل ۱۵ دقیقه‌ای زمان
          </button>
        </div>
      </SheetModal>

      {/* Cancellation Policy Modal */}
      <SheetModal
        isOpen={policyModalOpen}
        onClose={() => setPolicyModalOpen(false)}
        title="قوانین لغو و تغییر زمان جلسه"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3 text-sm leading-[1.8] text-ink-secondary">
          <p>
            • تغییر زمان یا لغو جلسه تا ۲۴ ساعت پیش از ساعت مقرر با هماهنگی درمانگر بدون جریمه امکان‌پذیر است.
          </p>
          <p>
            • در صورت تاخیر مراجع در ورود به اتاق آنلاین، زمان جلسه صرفاً در بازه باقیمانده انجام می‌شود.
          </p>
          <p>
            • پس از بارگذاری تصویر رسید، تایید نهایی و لینک اختصاصی جلسه توسط درمانگر ثبت می‌شود.
          </p>
        </div>
      </SheetModal>
    </div>
  );
}
