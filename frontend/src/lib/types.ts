import { jalaliToGregorian, type CurrencyCode } from "./jalali";

export type BookingTrack = "iran" | "abroad";

export type BookingStatus =
  | "held"
  | "pending_verification"
  | "confirmed"
  | "rejected"
  | "expired"
  | "cancelled"
  | "completed";

export interface ServiceOffering {
  id: string;
  title: string;
  description: string;
  track: BookingTrack;
  durationMinutes: number;
  priceAmount: number; // Integer: IRT in Toman, USD/EUR in minor cents
  currency: CurrencyCode;
}

export interface EducationTimelineItem {
  id: string;
  periodJalali: string;
  degree: string;
  institution: string;
  note?: string;
}

export interface VerifiedReflection {
  id: string;
  clientLabel: string;
  rating: number;
  comment: string;
  dateJalali: string;
}

export interface BlogHeading {
  id: string;
  text: string;
  level: 2 | 3;
}

export interface BlogSection {
  headingId: string;
  headingText: string;
  level: 2 | 3;
  paragraphs: string[];
}

export interface BlogPost {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  bodyMarkdown?: string;
  coverImageUrl: string;
  publishedAtJalali: string;
  publishedAtIso: string;
  readingMinutes: number;
  status: "published" | "draft";
  seoTitle: string;
  seoDescription: string;
  sections: BlogSection[];
}

export interface WeeklyWindow {
  id: string;
  startTime: string; // "HH:mm" in Asia/Tehran
  endTime: string; // "HH:mm" in Asia/Tehran
}

export interface WeeklyScheduleRule {
  weekdaySat0: number; // 0 = شنبه .. 6 = جمعه
  enabled: boolean;
  windows: WeeklyWindow[];
}

export interface JalaliOverride {
  id: string;
  jalaliKey: string; // "1405-09-10"
  jalaliLabel: string; // "۱۴۰۵/۰۹/۱۰"
  type: "closed" | "custom_hours";
  note: string;
  windows: WeeklyWindow[];
}

export interface TherapistPaymentAccountItem {
  id: string;
  track: BookingTrack;
  method: "card_to_card" | "sheba" | "paypal" | "iban" | "usdt";
  accountLabel: string;
  destinationVal: string;
  holderName: string;
  isActive?: boolean;
}

export interface TherapistPaymentAccounts {
  iran: {
    bankName: string;
    accountHolder: string;
    cardPan: string;
    sheba: string;
  };
  abroad: {
    paypal?: {
      email: string;
      holderName: string;
    };
    iban?: {
      bankName: string;
      iban: string;
      bic: string;
      holderName: string;
    };
    usdt?: {
      network: string;
      address: string;
    };
  };
}

export interface TherapistProfile {
  id: string;
  slug: string;
  displayName: string;
  subtitle: string;
  licenseNumber: string;
  licenseAuthority: string;
  experienceYears: number;
  sessionsHeldLabel: string;
  avatarUrl: string;
  directoryOptIn: boolean;
  customDomain: string | null;
  customDomainVerified: boolean;
  bio: string;
  approachSummary: string;
  focusAreas: string[]; // Max 8 monochrome chips
  reviewsEnabled: boolean;
  timezone?: string;
  cancellationPolicyFa?: string;
  educationTimeline: EducationTimelineItem[];
  reflections: VerifiedReflection[];
  offerings: ServiceOffering[];
  blogPosts: BlogPost[];
  weeklySchedule: WeeklyScheduleRule[];
  jalaliOverrides: JalaliOverride[];
}

export interface TimeSlotOption {
  id: string;
  isoUtc: string;
  tehranJalaliKey: string; // "1405-09-07"
  tehranTimeFa: string; // "۱۶:۰۰"
  tehranHour: number;
  tehranMinute: number;
}

export interface RebookPreset {
  bookingId: string;
  therapistSlug: string;
  track: BookingTrack;
  serviceId: string;
  note: string;
  rejectionReason: string;
}

export interface ClientSessionRecord {
  id: string;
  referenceCode: string;
  therapistSlug: string;
  therapistName: string;
  therapistSubtitle: string;
  therapistAvatarUrl: string;
  serviceOfferingId: string;
  serviceTitle: string;
  track: BookingTrack;
  clientTimezone: string;
  startIsoUtc: string;
  durationMinutes: number;
  dateTimeJalaliLabel: string;
  dateTimePrimaryLtr?: string;
  dateTimeSecondaryFa?: string;
  amount: number;
  currency: CurrencyCode;
  status: BookingStatus;
  callJoinUrl?: string; // Strictly present ONLY when confirmed or completed
  rejectionReason?: string;
  clientNote?: string;
  hasReview: boolean;
}

export interface DashboardBookingRecord {
  id: string;
  referenceCode: string;
  clientName: string;
  clientContactDisplay: string;
  track: BookingTrack;
  serviceTitle: string;
  durationMinutes: number;
  slotStartIso: string;
  slotEndIso: string;
  slotLabelJalali: string;
  slotLabelDual?: string;
  amount: number;
  currency: CurrencyCode;
  status: BookingStatus;
  hasReceipt: boolean;
  trackingCode: string;
  submittedAtJalali: string;
  callJoinUrl?: string;
  rejectionReason?: string;
  clientNote?: string;
}

export interface TherapistDomainRecord {
  id: string;
  hostname: string;
  isPrimary: boolean;
  status: "pending_dns" | "verified" | "disabled";
  txtToken: string;
  verifiedAt?: string | null;
  createdAt: string;
}

export function jalaliPartsFromKey(
  jalaliKey: string,
): { jy: number; jm: number; jd: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(jalaliKey);
  if (!match) return null;
  const jy = Number(match[1]);
  const jm = Number(match[2]);
  const jd = Number(match[3]);
  const g = jalaliToGregorian(jy, jm, jd);
  if (!g.gy) return null;
  return { jy, jm, jd };
}
