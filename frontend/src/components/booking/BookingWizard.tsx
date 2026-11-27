"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
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
  ApiError,
  confirmReceiptUpload,
  createBookingHold,
  fetchTherapistSlots,
  getAuthMe,
  getClientBooking,
  issueOtp,
  presignReceiptUpload,
  submitBookingReceipt,
  uploadFileToPresignedUrl,
  verifyOtp,
  type ApiPaymentDestinationDTO,
  type ApiSlotDTO,
  type ApiUserDTO,
} from "@/lib/api";
import { downloadIcsFile } from "@/lib/ics";
import {
  getTrackOfferings,
  resolveTrackOffering,
} from "@/lib/booking-selection";
import {
  dateToTehranJalali,
  formatCurrency,
  formatJalaliKey,
  formatJalaliLong,
  toPersianDigits,
  toWesternDigits,
} from "@/lib/jalali";
import type { TenantMode } from "@/lib/tenant-href";
import {
  detectBrowserTimezone,
  formatDualSlot,
  formatGregorianDateKeyInZone,
  formatTime24InZone,
  getTimezoneOffsetLabel,
} from "@/lib/timezone";
import {
  jalaliPartsFromKey,
  type BookingTrack,
  type TherapistProfile,
  type TimeSlotOption,
} from "@/lib/types";

interface BookingWizardProps {
  therapist: TherapistProfile;
  mode: TenantMode;
  slug: string;
  initialRebookId?: string;
}

type WizardStep = 1 | 2 | 3 | 4 | 5;
type TrackBMethod = "paypal" | "iban" | "usdt";

interface HeldBookingState {
  id: string;
  referenceCode: string;
  holdExpiresAtMs: number;
  slot: TimeSlotOption;
  track: BookingTrack;
  serviceId: string;
  paymentAccounts: ApiPaymentDestinationDTO[];
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

function mapApiSlotToOption(slot: ApiSlotDTO): TimeSlotOption {
  const d = new Date(slot.start_at);
  const jalali = dateToTehranJalali(d);
  const tehranTime24 = formatTime24InZone(d, "Asia/Tehran");
  const [hh, mm] = tehranTime24.split(":").map(Number);
  return {
    id: slot.start_at,
    isoUtc: slot.start_at,
    tehranJalaliKey: formatJalaliKey(jalali.jy, jalali.jm, jalali.jd),
    tehranTimeFa: toPersianDigits(tehranTime24),
    tehranHour: hh || 0,
    tehranMinute: mm || 0,
  };
}

function splitPhoneE164(phone: string): { dial: string; national: string } | null {
  const knownDials = ["+971", "+98", "+49", "+44", "+61", "+1"];
  for (const dial of knownDials) {
    if (phone.startsWith(dial)) {
      return { dial, national: phone.slice(dial.length) };
    }
  }
  return null;
}

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `hold-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function BookingWizard({
  therapist,
  slug,
  initialRebookId,
}: BookingWizardProps) {
  const initialTrack: BookingTrack = useMemo(() => {
    const hasIran = therapist.offerings.some((o) => o.track === "iran");
    return hasIran ? "iran" : "abroad";
  }, [therapist.offerings]);

  const initialOffering = useMemo(
    () => resolveTrackOffering(therapist.offerings, initialTrack, ""),
    [initialTrack, therapist.offerings],
  );

  const todayJalali = useMemo(() => dateToTehranJalali(new Date()), []);
  const todayJalaliKey = useMemo(
    () => formatJalaliKey(todayJalali.jy, todayJalali.jm, todayJalali.jd),
    [todayJalali],
  );

  const [step, setStep] = useState<WizardStep>(1);
  const [track, setTrack] = useState<BookingTrack>(initialTrack);
  const [selectedOfferingId, setSelectedOfferingId] = useState<string>(
    initialOffering?.id ?? "",
  );
  const [clientTimezone, setClientTimezone] = useState<string>("Europe/Berlin");

  const [allSlots, setAllSlots] = useState<TimeSlotOption[]>([]);
  const [slotsLoading, setSlotsLoading] = useState<boolean>(true);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [slotsRefreshSeq, setSlotsRefreshSeq] = useState<number>(0);

  const [selectedJalaliDateKey, setSelectedJalaliDateKey] = useState<string | null>(
    todayJalaliKey,
  );
  const [selectedGregorianDateKey, setSelectedGregorianDateKey] = useState<string | null>(
    () => formatGregorianDateKeyInZone(new Date(), "Europe/Berlin"),
  );
  const [selectedSlot, setSelectedSlot] = useState<TimeSlotOption | null>(null);

  // Rebook context banner
  const [rebookNotice, setRebookNotice] = useState<string | null>(null);

  // Step 3 form state
  const [clientName, setClientName] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState(
    initialTrack === "iran" ? "+98" : "+49",
  );
  const [phoneNational, setPhoneNational] = useState("");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [policyAccepted, setPolicyAccepted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [policyModalOpen, setPolicyModalOpen] = useState(false);

  // Mobile summary collapsible toggle
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);

  // Auth & OTP state
  const [authUser, setAuthUser] = useState<ApiUserDTO | null>(null);
  const [otpModalOpen, setOtpModalOpen] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [otpBusy, setOtpBusy] = useState(false);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(120);
  const [holdError, setHoldError] = useState<string | null>(null);
  const [holdBusy, setHoldBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(generateIdempotencyKey);

  // Step 4 Hold + Payment + Upload state
  const [heldBooking, setHeldBooking] = useState<HeldBookingState | null>(null);
  const [holdSecondsLeft, setHoldSecondsLeft] = useState(15 * 60);
  const [abroadMethod, setAbroadMethod] = useState<TrackBMethod>("paypal");

  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptFileName, setReceiptFileName] = useState<string | null>(null);
  const [receiptFileSize, setReceiptFileSize] = useState<number>(0);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState<boolean>(false);
  const [trackingCode, setTrackingCode] = useState("");

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const nameId = useId();
  const phoneId = useId();
  const emailId = useId();
  const noteId = useId();
  const trackingId = useId();

  // Detect browser timezone for Track B
  useEffect(() => {
    const detected = detectBrowserTimezone("Europe/Berlin");
    if (detected && detected !== "Asia/Tehran") {
      setClientTimezone(detected);
      setSelectedGregorianDateKey(
        formatGregorianDateKeyInZone(new Date(), detected),
      );
    }
  }, []);

  // Hydrate authenticated session & optional ?rebook=<id>
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const me = await getAuthMe();
        if (!active) return;
        setAuthUser(me.user);
        if (me.user.full_name) {
          setClientName((prev) => prev || me.user.full_name);
        }
        if (me.user.email) {
          setEmail((prev) => prev || me.user.email || "");
        }
        if (me.user.phone_e164) {
          const split = splitPhoneE164(me.user.phone_e164);
          if (split) {
            setPhoneDialCode(split.dial);
            setPhoneNational((prev) => prev || split.national);
          }
        }

        if (initialRebookId) {
          try {
            const { booking } = await getClientBooking(initialRebookId);
            if (!active) return;
            if (
              booking.therapist_slug === slug ||
              booking.therapist_id === therapist.id
            ) {
              setTrack(booking.track);
              if (booking.service_offering_id) {
                setSelectedOfferingId(booking.service_offering_id);
              }
              if (booking.client_note) {
                setNote(booking.client_note);
              }
              setPolicyAccepted(true);
              if (
                getTrackOfferings(therapist.offerings, booking.track).length > 0
              ) {
                setStep(2);
              }
              setRebookNotice(
                booking.rejection_reason
                  ? `اطلاعات پرونده قبلی شما جای‌گذاری شد (دلیل قبلی: ${booking.rejection_reason}). لطفاً زمان جدیدی انتخاب کرده و رسید اصلاح‌شده را بارگذاری کنید.`
                  : "اطلاعات پرونده قبلی شما جای‌گذاری شد. لطفاً یک زمان آزاد انتخاب کرده و رسید جدید را بارگذاری کنید.",
              );
            }
          } catch {
            // Ignore missing/unauthorized rebook id
          }
        }
      } catch {
        // Unauthenticated visitor — expected before Step 3 OTP
      }
    })();

    return () => {
      active = false;
    };
  }, [initialRebookId, slug, therapist.id, therapist.offerings]);

  // Regenerate Idempotency-Key whenever slot, offering, or track changes
  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey());
  }, [selectedSlot?.isoUtc, selectedOfferingId, track]);

  const trackOfferings = useMemo(
    () => getTrackOfferings(therapist.offerings, track),
    [therapist.offerings, track],
  );

  const selectedOffering = useMemo(
    () => resolveTrackOffering(therapist.offerings, track, selectedOfferingId),
    [selectedOfferingId, therapist.offerings, track],
  );

  // Fetch live slots whenever offering, track, or clientTimezone changes
  useEffect(() => {
    if (!selectedOffering?.id) {
      setAllSlots([]);
      setSlotsLoading(false);
      return;
    }

    let active = true;
    const effectiveTz = track === "iran" ? "Asia/Tehran" : clientTimezone;
    const now = new Date();
    const fromIso = now.toISOString();
    const toIso = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    setSlotsLoading(true);
    setSlotsError(null);

    fetchTherapistSlots(slug, selectedOffering.id, fromIso, toIso, effectiveTz)
      .then((res) => {
        if (!active) return;
        const mapped = (res.slots ?? []).map(mapApiSlotToOption);
        setAllSlots(mapped);

        if (mapped.length > 0) {
          const firstSlot = mapped[0];
          setSelectedJalaliDateKey((prev) =>
            prev && mapped.some((s) => s.tehranJalaliKey === prev)
              ? prev
              : firstSlot.tehranJalaliKey,
          );
          const firstGregKey = formatGregorianDateKeyInZone(
            new Date(firstSlot.isoUtc),
            effectiveTz,
          );
          setSelectedGregorianDateKey((prev) =>
            prev &&
            mapped.some(
              (s) =>
                formatGregorianDateKeyInZone(new Date(s.isoUtc), effectiveTz) ===
                prev,
            )
              ? prev
              : firstGregKey,
          );
        }
      })
      .catch(() => {
        if (!active) return;
        setSlotsError("دریافت زمان‌های آزاد با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
      })
      .finally(() => {
        if (active) setSlotsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [clientTimezone, selectedOffering?.id, slotsRefreshSeq, slug, track]);

  // Cleanup preview object URL
  useEffect(() => {
    return () => {
      if (receiptPreviewUrl) {
        URL.revokeObjectURL(receiptPreviewUrl);
      }
    };
  }, [receiptPreviewUrl]);

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
    const firstOfferingForTrack = getTrackOfferings(
      therapist.offerings,
      nextTrack,
    )[0];
    setSelectedOfferingId(firstOfferingForTrack?.id ?? "");
    setSelectedSlot(null);
    setHoldError(null);
    if (nextTrack === "iran") {
      setPhoneDialCode("+98");
    } else if (phoneDialCode === "+98") {
      setPhoneDialCode("+49");
    }
  };

  const handleContinueToStep2 = () => {
    if (!selectedOffering || trackOfferings.length === 0) return;
    setStep(2);
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
    if (track === "iran" && cleanPhoneDigits.length < 8) {
      errors.phone = "شماره تماس معتبر وارد کنید.";
    } else if (
      track === "abroad" &&
      cleanPhoneDigits.length > 0 &&
      cleanPhoneDigits.length < 7
    ) {
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

  const createHoldAndAdvanceToStep4 = useCallback(async () => {
    if (!selectedSlot || !selectedOffering) return;
    setHoldBusy(true);
    setHoldError(null);
    try {
      const res = await createBookingHold(
        {
          therapist_id: therapist.id,
          service_offering_id: selectedOffering.id,
          track,
          client_timezone: track === "iran" ? "Asia/Tehran" : clientTimezone,
          slot_start: selectedSlot.isoUtc,
          client_note: note.trim(),
        },
        idempotencyKey,
      );

      const expiresMs = res.booking.hold_expires_at
        ? new Date(res.booking.hold_expires_at).getTime()
        : Date.now() + 15 * 60 * 1000;

      setHeldBooking({
        id: res.booking.id,
        referenceCode: res.booking.reference_code,
        holdExpiresAtMs: expiresMs,
        slot: selectedSlot,
        track,
        serviceId: selectedOffering.id,
        paymentAccounts: res.payment_accounts ?? [],
      });
      setHoldSecondsLeft(Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000)));
      setStep(4);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 409) {
          setHoldError(
            "این زمان هم‌اکنون توسط مراجع دیگری رزرو شده است. لطفاً زمان دیگری انتخاب کنید.",
          );
          setSelectedSlot(null);
          setSlotsRefreshSeq((n) => n + 1);
          setStep(2);
          return;
        }
        if (err.status === 422) {
          setHoldError(
            "شما هم‌اکنون حداکثر تعداد رزرو موقت فعال را دارید. لطفاً ابتدا نوبت‌های قبلی خود را در «پیگیری نوبت» تکمیل یا لغو کنید.",
          );
          return;
        }
        if (err.status === 401) {
          setAuthUser(null);
          setOtpModalOpen(true);
          return;
        }
      }
      setHoldError("ایجاد رزرو موقت با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
    } finally {
      setHoldBusy(false);
    }
  }, [
    clientTimezone,
    idempotencyKey,
    note,
    selectedOffering,
    selectedSlot,
    therapist.id,
    track,
  ]);

  const expectedVerifyChannel: "sms" | "email" = track === "abroad" ? "email" : "sms";

  const isCurrentChannelVerified = useMemo(() => {
    if (!authUser) return false;
    if (track === "abroad") {
      return (
        typeof authUser.email === "string" &&
        authUser.email.toLowerCase() === primaryContactIdentifier
      );
    }
    return (
      typeof authUser.phone_e164 === "string" &&
      authUser.phone_e164 === primaryContactIdentifier
    );
  }, [authUser, primaryContactIdentifier, track]);

  const requestBookingOtp = async () => {
    setOtpBusy(true);
    setOtpError(null);
    try {
      await issueOtp({
        destination: primaryContactIdentifier,
        channel: expectedVerifyChannel,
        purpose: "booking_verify",
      });
      setOtpCode("");
      setOtpSecondsLeft(120);
      setOtpModalOpen(true);
    } catch (err) {
      if (err instanceof ApiError && err.status === 429) {
        setHoldError("تعداد درخواست کد تایید بیش از حد مجاز است. لطفاً کمی بعد تلاش کنید.");
      } else {
        setHoldError("ارسال کد تایید با خطا مواجه شد. لطفاً ورودی خود را بررسی کنید.");
      }
    } finally {
      setOtpBusy(false);
    }
  };

  const handleStep3Proceed = async () => {
    setHoldError(null);
    if (!validateStep3()) return;

    if (isCurrentChannelVerified) {
      await createHoldAndAdvanceToStep4();
      return;
    }

    await requestBookingOtp();
  };

  const handleVerifyOtp = async () => {
    const normalized = toWesternDigits(otpCode).replace(/\D/g, "");
    if (normalized.length !== 6) {
      setOtpError("لطفاً کد ۶ رقمی ارسال‌شده را به صورت کامل وارد کنید.");
      return;
    }

    setOtpBusy(true);
    setOtpError(null);
    try {
      const res = await verifyOtp({
        destination: primaryContactIdentifier,
        channel: expectedVerifyChannel,
        purpose: "booking_verify",
        code: normalized,
        full_name: clientName.trim(),
      });
      setAuthUser(res.user);
      setOtpModalOpen(false);
      await createHoldAndAdvanceToStep4();
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429) {
          setOtpError("تعداد تلاش‌های اشتباه بیش از حد مجاز است. لطفاً کمی بعد کد جدید بگیرید.");
        } else if (err.status === 401) {
          setOtpError("کد تایید نادرست یا منقضی شده است.");
        } else {
          setOtpError("خطا در تایید کد. لطفاً دوباره تلاش کنید.");
        }
      } else {
        setOtpError("خطا در برقراری ارتباط با سرور.");
      }
    } finally {
      setOtpBusy(false);
    }
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

    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }

    const preview = URL.createObjectURL(file);
    setUploadError(null);
    setReceiptFile(file);
    setReceiptFileName(file.name);
    setReceiptFileSize(file.size);
    setReceiptPreviewUrl(preview);
    setUploadProgress(0);
  };

  const handleClearReceipt = () => {
    if (receiptPreviewUrl) {
      URL.revokeObjectURL(receiptPreviewUrl);
    }
    setReceiptFile(null);
    setReceiptPreviewUrl(null);
    setReceiptFileName(null);
    setReceiptFileSize(0);
    setUploadProgress(0);
    setUploadError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmitReceipt = async () => {
    if (
      !heldBooking ||
      holdSecondsLeft <= 0 ||
      Date.now() >= heldBooking.holdExpiresAtMs
    ) {
      setHoldSecondsLeft(0);
      return;
    }
    if (!receiptFile || !receiptPreviewUrl) {
      setUploadError("لطفاً تصویر رسید پرداخت (JPG، PNG یا WEBP) را بارگذاری کنید.");
      return;
    }

    setSubmittingReceipt(true);
    setUploadError(null);
    setUploadProgress(20);

    try {
      const presigned = await presignReceiptUpload(
        heldBooking.id,
        receiptFile.type,
        receiptFile.size,
      );
      setUploadProgress(45);

      await uploadFileToPresignedUrl(
        presigned.upload_url,
        receiptFile,
        receiptFile.type,
      );
      setUploadProgress(75);

      await confirmReceiptUpload(presigned.media_object_id);
      setUploadProgress(90);

      await submitBookingReceipt(
        heldBooking.id,
        presigned.media_object_id,
        trackingCode.trim(),
      );
      setUploadProgress(100);

      setStep(5);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err) {
      setUploadProgress(0);
      if (err instanceof ApiError) {
        if (err.status === 410) {
          setHoldSecondsLeft(0);
          return;
        }
        if (err.status === 422) {
          setUploadError(
            "فایل ارسالی به‌عنوان تصویر معتبر تایید نشد. لطفاً تصویر سالم JPG، PNG یا WEBP انتخاب کنید.",
          );
          return;
        }
        if (err.status === 409) {
          setUploadError(
            "وضعیت این رزرو تغییر کرده است. لطفاً وضعیت نوبت خود را در پورتال پیگیری بررسی کنید.",
          );
          return;
        }
      }
      setUploadError("بارگذاری و ثبت رسید با خطا مواجه شد. لطفاً دوباره تلاش کنید.");
    } finally {
      setSubmittingReceipt(false);
    }
  };

  // Payment accounts come STRICTLY from the active held booking returned by POST /api/v1/bookings/hold
  const paymentAccounts = useMemo(
    () => (step === 4 && heldBooking ? heldBooking.paymentAccounts : []),
    [heldBooking, step],
  );

  const iranAccounts = useMemo(
    () => paymentAccounts.filter((a) => a.track === "iran"),
    [paymentAccounts],
  );
  const abroadAccounts = useMemo(
    () => paymentAccounts.filter((a) => a.track === "abroad"),
    [paymentAccounts],
  );

  const availableAbroadMethods = useMemo(
    () =>
      (["paypal", "iban", "usdt"] as const).filter((m) =>
        abroadAccounts.some((a) => a.method === m),
      ),
    [abroadAccounts],
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
      secondary: `معادل ${dual.tehranTimeFa} تهران`,
      timezoneLabel: clientTimezone,
    };
  }, [clientTimezone, selectedSlot, track]);

  const priceDisplay = selectedOffering
    ? formatCurrency(selectedOffering.priceAmount, selectedOffering.currency)
    : "";

  const selectedJalaliParts = useMemo(
    () =>
      selectedJalaliDateKey ? jalaliPartsFromKey(selectedJalaliDateKey) : null,
    [selectedJalaliDateKey],
  );

  const isHoldExpired = step === 4 && holdSecondsLeft <= 0;

  const renderPrimaryMobileCta = () => {
    if (step === 1) {
      const canContinue = Boolean(selectedOffering && trackOfferings.length > 0);
      return (
        <button
          type="button"
          disabled={!canContinue}
          onClick={handleContinueToStep2}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
        >
          {canContinue ? "ادامه و انتخاب زمان" : "خدمتی برای این مسیر فعال نیست"}
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
          disabled={otpBusy || holdBusy}
          onClick={handleStep3Proceed}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
        >
          {holdBusy || otpBusy
            ? "در حال بررسی..."
            : "رزرو موقت ۱۵ دقیقه‌ای و ادامه به پرداخت"}
        </button>
      );
    }
    if (step === 4) {
      return (
        <button
          type="button"
          disabled={isHoldExpired || !receiptFile || submittingReceipt}
          onClick={handleSubmitReceipt}
          className="w-full min-h-[48px] px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
        >
          {submittingReceipt
            ? "در حال ارسال و ثبت رسید..."
            : "ثبت رسید و ارسال برای تایید درمانگر"}
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
              <span
                dir={track === "abroad" ? "ltr" : undefined}
                className="inline-block font-medium text-ink text-end tabular-nums"
              >
                {selectedSlotDisplay.primary}
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
      {rebookNotice ? (
        <div className="rounded-2xl border border-status-info-border bg-status-info-bg px-4 py-3.5 text-sm text-status-info-ink flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <p>{rebookNotice}</p>
          <button
            type="button"
            onClick={() => setStep(1)}
            className="shrink-0 min-h-[44px] px-3 rounded-xl border border-status-info-border bg-surface text-ink text-xs font-medium hover:bg-subtle transition-colors"
          >
            تغییر نوع جلسه
          </button>
        </div>
      ) : null}

      {holdError ? (
        <div
          role="alert"
          className="rounded-2xl border border-status-rejected-border bg-status-rejected-bg px-4 py-3.5 text-sm text-status-rejected-ink"
        >
          {holdError}
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
                <span
                  dir={track === "abroad" ? "ltr" : undefined}
                  className="inline-block font-medium text-ink text-end tabular-nums"
                >
                  {selectedSlotDisplay.primary}
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
                    <div className="min-w-0 flex-1 text-start">
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
                    <div className="min-w-0 flex-1 text-start">
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
                {trackOfferings.length === 0 ? (
                  <p className="rounded-xl border border-border bg-subtle/50 p-4 text-sm text-ink-secondary">
                    برای این مسیر فعلاً خدمتی تعریف نشده است. لطفاً مسیر دیگر را بررسی کنید.
                  </p>
                ) : (
                  trackOfferings.map((offering) => {
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
                  })
                )}
              </div>

              <div className="hidden lg:flex justify-end pt-2">
                <button
                  type="button"
                  disabled={!selectedOffering || trackOfferings.length === 0}
                  onClick={handleContinueToStep2}
                  className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
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

              {slotsLoading ? (
                <div className="rounded-2xl border border-border bg-subtle/40 p-8 text-center text-sm text-ink-secondary">
                  در حال دریافت زمان‌های آزاد درمانگر...
                </div>
              ) : slotsError ? (
                <div className="rounded-2xl border border-status-rejected-border bg-status-rejected-bg p-5 text-center space-y-3">
                  <p className="text-sm text-status-rejected-ink">{slotsError}</p>
                  <button
                    type="button"
                    onClick={() => setSlotsRefreshSeq((n) => n + 1)}
                    className="min-h-[44px] px-4 rounded-xl bg-accent text-white text-sm font-medium"
                  >
                    تلاش مجدد
                  </button>
                </div>
              ) : track === "iran" ? (
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
                  initialYear={selectedJalaliParts?.jy ?? todayJalali.jy}
                  initialMonth={selectedJalaliParts?.jm ?? todayJalali.jm}
                  todayKey={todayJalaliKey}
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
                        formatGregorianDateKeyInZone(
                          new Date(allSlots[0].isoUtc),
                          nextTz,
                        ),
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
                  todayKeyEn={formatGregorianDateKeyInZone(
                    new Date(),
                    clientTimezone,
                  )}
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
                    شماره موبایل (واتساپ / تماس){" "}
                    {track === "iran" ? (
                      <span className="text-status-rejected-ink">*</span>
                    ) : (
                      <span className="text-ink-muted font-normal">(اختیاری)</span>
                    )}
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
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <label
                      htmlFor="booking-policy-check"
                      className="min-h-[44px] inline-flex items-center gap-3 text-sm text-ink-secondary leading-relaxed cursor-pointer"
                    >
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
                        className="w-5 h-5 shrink-0 accent-accent rounded border-border-strong cursor-pointer"
                      />
                      <span>قوانین لغو و تغییر زمان جلسه را مطالعه کردم و می‌پذیرم.</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setPolicyModalOpen(true)}
                      className="text-sm text-accent font-medium underline underline-offset-4 hover:text-accent-hover min-h-[44px] inline-flex items-center px-1"
                    >
                      مشاهده قوانین
                    </button>
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
                  disabled={otpBusy || holdBusy}
                  onClick={handleStep3Proceed}
                  className="min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
                >
                  {holdBusy || otpBusy
                    ? "در حال بررسی..."
                    : "رزرو موقت ۱۵ دقیقه‌ای و ادامه به پرداخت"}
                </button>
              </div>
            </div>
          ) : null}

          {/* STEP 4 (Strictly gated behind verified session + active hold from API) */}
          {step === 4 && heldBooking ? (
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
                      setSelectedSlot(null);
                      setSlotsRefreshSeq((n) => n + 1);
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

              {/* Payment Destinations (Strictly from POST /api/v1/bookings/hold) */}
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
                    {iranAccounts.length === 0 ? (
                      <p className="text-sm text-ink-secondary">
                        حساب بانکی فعالی برای مسیر داخل ایران ثبت نشده است.
                      </p>
                    ) : (
                      iranAccounts.map((acc) => (
                        <CopyField
                          key={acc.id}
                          label={acc.account_label}
                          value={acc.destination_val}
                          monospace={acc.method === "sheba"}
                          hint={`به نام: ${acc.holder_name}`}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-border bg-surface p-4 space-y-4">
                    {abroadAccounts.length === 0 ? (
                      <p className="text-sm text-ink-secondary">
                        حساب ارزی فعالی برای مسیر خارج از ایران ثبت نشده است.
                      </p>
                    ) : (
                      <>
                        <div className="grid grid-cols-3 gap-2">
                          {(
                            [
                              { id: "paypal", label: "PayPal" },
                              { id: "iban", label: "IBAN" },
                              { id: "usdt", label: "USDT" },
                            ] as const
                          ).map((tab) => {
                            const available = availableAbroadMethods.includes(tab.id);
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

                        {abroadAccounts
                          .filter((a) => a.method === activeAbroadMethod)
                          .map((acc) => (
                            <CopyField
                              key={acc.id}
                              label={acc.account_label}
                              value={acc.destination_val}
                              monospace={acc.method === "iban" || acc.method === "usdt"}
                              hint={acc.holder_name}
                            />
                          ))}
                      </>
                    )}

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
                        {submittingReceipt || uploadProgress > 0 ? (
                          <div className="w-full h-2 rounded-full bg-muted-surface overflow-hidden">
                            <div
                              className="h-full bg-accent transition-all duration-200"
                              style={{ width: `${uploadProgress}%` }}
                            />
                          </div>
                        ) : null}
                        {submittingReceipt ? (
                          <span className="block text-xs text-accent">
                            در حال آپلود امن تصویر رسید...
                          </span>
                        ) : !uploadError ? (
                          <span className="block text-xs text-status-confirmed-ink">
                            تصویر آماده ارسال و ثبت نهایی است
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={submittingReceipt}
                      onClick={handleClearReceipt}
                      className="min-h-[44px] px-3.5 rounded-xl border border-border-strong bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle disabled:opacity-50 transition-colors"
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
                  disabled={isHoldExpired || !receiptFile || submittingReceipt}
                  onClick={handleSubmitReceipt}
                  className="w-full min-h-[48px] px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted disabled:cursor-not-allowed transition-colors"
                >
                  {submittingReceipt
                    ? "در حال آپلود و ثبت رسید..."
                    : "ثبت رسید و ارسال برای تایید درمانگر"}
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
                    <span
                      dir={track === "abroad" ? "ltr" : undefined}
                      className="inline-block"
                    >
                      {selectedSlotDisplay.primary}
                    </span>
                    <span className="block text-xs text-ink-muted mt-0.5">
                      {selectedSlotDisplay.secondary}
                      {selectedSlotDisplay.timezoneLabel ? (
                        <>
                          {" "}
                          (
                          <span dir="ltr" className="inline-block tabular-nums">
                            {selectedSlotDisplay.timezoneLabel}
                          </span>
                          )
                        </>
                      ) : null}
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
              disabled={otpSecondsLeft > 0 || otpBusy}
              onClick={() => void requestBookingOtp()}
              className="min-h-[44px] px-2 text-accent font-medium disabled:text-ink-muted disabled:cursor-not-allowed"
            >
              ارسال مجدد کد
            </button>
          </div>

          <button
            type="button"
            disabled={otpBusy}
            onClick={handleVerifyOtp}
            className="w-full min-h-[48px] rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover disabled:bg-muted-surface disabled:text-ink-muted transition-colors"
          >
            {otpBusy ? "در حال تایید..." : "تایید کد و قفل ۱۵ دقیقه‌ای زمان"}
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
          {therapist.cancellationPolicyFa ? (
            <p>{therapist.cancellationPolicyFa}</p>
          ) : (
            <p>
              • تغییر زمان یا لغو جلسه تا ۲۴ ساعت پیش از ساعت مقرر با هماهنگی درمانگر بدون جریمه امکان‌پذیر است.
            </p>
          )}
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
