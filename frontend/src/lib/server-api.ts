import {
  dateToTehranJalali,
  JALALI_MONTHS,
  toPersianDigits,
  type CurrencyCode,
} from "./jalali";
import { parseMarkdownSections } from "./markdown";
import type {
  BlogPost,
  BookingTrack,
  EducationTimelineItem,
  ServiceOffering,
  TherapistProfile,
  VerifiedReflection,
} from "./types";

interface ApiPublicTherapistDTO {
  id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio_markdown: string;
  license_number: string;
  years_experience: number;
  focus_tags?: string[];
  education_timeline?: Array<{
    degree: string;
    institution: string;
    start_jalali: string;
    end_jalali: string;
  }>;
  avatar_object_key?: string | null;
  reviews_enabled: boolean;
  timezone: string;
  cancellation_policy_fa: string;
  offerings_iran?: ApiOfferingDTO[];
  offerings_abroad?: ApiOfferingDTO[];
}

interface ApiOfferingDTO {
  id: string;
  therapist_id: string;
  track: string;
  title: string;
  description: string;
  duration_min: number;
  currency: string;
  price_amount: number;
  is_active: boolean;
  sort_order: number;
}

interface ApiReviewDTO {
  id: string;
  booking_id: string;
  therapist_id: string;
  client_label: string;
  rating: number;
  comment: string;
  is_published: boolean;
  created_at: string;
}

interface ApiBlogPostDTO {
  id: string;
  therapist_id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_object_key?: string | null;
  seo_title: string;
  seo_description: string;
  reading_min: number;
  status: string;
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

interface ApiCatalogResponse {
  therapist: ApiPublicTherapistDTO;
  offerings_iran: ApiOfferingDTO[];
  offerings_abroad: ApiOfferingDTO[];
  reviews: ApiReviewDTO[];
  blog_posts: ApiBlogPostDTO[];
  primary_custom_domain?: string | null;
}

function getInternalApiBase(): string {
  return (process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8080").replace(/\/+$/, "");
}

function resolvePublicImageUrl(key: string | null | undefined, fallback: string): string {
  if (!key) return fallback;
  const trimmed = key.trim();
  if (trimmed.startsWith("/") || trimmed.startsWith("https://") || trimmed.startsWith("http://")) {
    return trimmed;
  }
  return fallback;
}

function formatIsoToJalaliDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const { jy, jm, jd } = dateToTehranJalali(date);
  const monthName = JALALI_MONTHS[jm - 1] ?? "";
  return `${toPersianDigits(jd)} ${monthName} ${toPersianDigits(jy)}`;
}

function mapOffering(o: ApiOfferingDTO): ServiceOffering {
  const track: BookingTrack = o.track === "abroad" ? "abroad" : "iran";
  const currency: CurrencyCode =
    o.currency === "USD" || o.currency === "EUR" ? o.currency : "IRT";
  return {
    id: o.id,
    title: o.title,
    description: o.description,
    track,
    durationMinutes: o.duration_min,
    priceAmount: o.price_amount,
    currency,
  };
}

function mapReview(r: ApiReviewDTO): VerifiedReflection {
  return {
    id: r.id,
    clientLabel: r.client_label,
    rating: r.rating,
    comment: r.comment,
    dateJalali: formatIsoToJalaliDate(r.created_at),
  };
}

export function mapApiBlogPost(p: ApiBlogPostDTO): BlogPost {
  const publishedIso = p.published_at ?? p.created_at;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    bodyMarkdown: p.body_markdown,
    coverImageUrl: resolvePublicImageUrl(p.cover_object_key, "/images/blog-anxiety.jpg"),
    publishedAtJalali: formatIsoToJalaliDate(publishedIso),
    publishedAtIso: publishedIso,
    readingMinutes: p.reading_min > 0 ? p.reading_min : 4,
    status: p.status === "draft" ? "draft" : "published",
    seoTitle: p.seo_title || p.title,
    seoDescription: p.seo_description || p.excerpt,
    sections: parseMarkdownSections(p.body_markdown),
  };
}

function mapTherapistProfile(
  dto: ApiPublicTherapistDTO,
  offeringsIran: ApiOfferingDTO[],
  offeringsAbroad: ApiOfferingDTO[],
  reviews: ApiReviewDTO[],
  posts: ApiBlogPostDTO[],
  primaryCustomDomain?: string | null,
): TherapistProfile {
  const educationTimeline: EducationTimelineItem[] = (
    dto.education_timeline ?? []
  ).map((edu, idx) => ({
    id: `edu-${idx + 1}`,
    periodJalali: edu.end_jalali
      ? `${edu.start_jalali}–${edu.end_jalali}`
      : edu.start_jalali,
    degree: edu.degree,
    institution: edu.institution,
  }));

  return {
    id: dto.id,
    slug: dto.slug,
    displayName: dto.display_name,
    subtitle: dto.headline,
    licenseNumber: toPersianDigits(dto.license_number),
    licenseAuthority: "سازمان نظام روانشناسی و مشاوره",
    experienceYears: dto.years_experience,
    sessionsHeldLabel: "آنلاین و محرمانه",
    avatarUrl: resolvePublicImageUrl(dto.avatar_object_key, "/images/therapist-sara.jpg"),
    directoryOptIn: true,
    customDomain: primaryCustomDomain ?? null,
    customDomainVerified: Boolean(primaryCustomDomain),
    bio: dto.bio_markdown,
    approachSummary: dto.headline || dto.bio_markdown,
    focusAreas: dto.focus_tags ?? [],
    reviewsEnabled: dto.reviews_enabled,
    timezone: dto.timezone,
    cancellationPolicyFa: dto.cancellation_policy_fa,
    educationTimeline,
    reflections: reviews.map(mapReview),
    offerings: [...offeringsIran, ...offeringsAbroad].map(mapOffering),
    blogPosts: posts.map(mapApiBlogPost),
    weeklySchedule: [],
    jalaliOverrides: [],
  };
}

async function serverGetJson<T>(
  path: string,
  fetchInit?: RequestInit & { next?: { revalidate?: number } },
): Promise<T | null> {
  const url = `${getInternalApiBase()}${path}`;
  try {
    const res = await fetch(url, {
      ...fetchInit,
      headers: {
        Accept: "application/json",
        ...(fetchInit?.headers ?? {}),
      },
    });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      return null;
    }
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function fetchDirectoryTherapists(): Promise<TherapistProfile[]> {
  const data = await serverGetJson<{ therapists: ApiPublicTherapistDTO[] }>(
    "/api/v1/therapists",
    { next: { revalidate: 300 } },
  );
  if (!data?.therapists) return [];

  return data.therapists.map((t) =>
    mapTherapistProfile(
      t,
      t.offerings_iran ?? [],
      t.offerings_abroad ?? [],
      [],
      [],
      null,
    ),
  );
}

export async function fetchTherapistCatalog(
  slug: string,
  options?: { noStore?: boolean },
): Promise<TherapistProfile | null> {
  const init: RequestInit & { next?: { revalidate?: number } } = options?.noStore
    ? { cache: "no-store" }
    : { next: { revalidate: 300 } };

  const data = await serverGetJson<ApiCatalogResponse>(
    `/api/v1/therapists/${encodeURIComponent(slug)}`,
    init,
  );
  if (!data?.therapist) return null;

  return mapTherapistProfile(
    data.therapist,
    data.offerings_iran ?? [],
    data.offerings_abroad ?? [],
    data.reviews ?? [],
    data.blog_posts ?? [],
    data.primary_custom_domain ?? null,
  );
}

export async function fetchTherapistBlogPost(
  slug: string,
  postSlug: string,
): Promise<{ therapist: TherapistProfile; post: BlogPost } | null> {
  const [therapist, postData] = await Promise.all([
    fetchTherapistCatalog(slug),
    serverGetJson<{ post: ApiBlogPostDTO }>(
      `/api/v1/therapists/${encodeURIComponent(slug)}/blog/${encodeURIComponent(postSlug)}`,
      { next: { revalidate: 300 } },
    ),
  ]);

  if (!therapist || !postData?.post) {
    return null;
  }

  return {
    therapist,
    post: mapApiBlogPost(postData.post),
  };
}
