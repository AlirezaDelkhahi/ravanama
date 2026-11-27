import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRight,
  Award,
  Clock,
  Globe,
  Quote,
  ShieldCheck,
} from "lucide-react";
import { MobileStickyBookingBar } from "@/components/tenant/MobileStickyBookingBar";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatCurrency, toPersianDigits } from "@/lib/jalali";
import { getTherapistBySlug } from "@/lib/mock-data";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantCatalogPageProps {
  params: Promise<{ slug: string }>;
}

function getCanonicalOrigin(
  customDomain: string | null,
  customDomainVerified: boolean,
  hostHeader: string | null,
  protoHeader: string | null,
): { origin: string; isCustomPrimary: boolean } {
  if (customDomainVerified && customDomain) {
    return { origin: `https://${customDomain}`, isCustomPrimary: true };
  }
  const host = hostHeader ?? "ravannama.ir";
  const rawProto = (protoHeader ?? "").split(",")[0]?.trim().toLowerCase();
  const proto = rawProto === "http" ? "http" : "https";
  return { origin: `${proto}://${host}`, isCustomPrimary: false };
}

export async function generateMetadata({
  params,
}: TenantCatalogPageProps): Promise<Metadata> {
  const { slug } = await params;
  const therapist = getTherapistBySlug(slug);
  if (!therapist) {
    return { title: "درمانگر یافت نشد" };
  }

  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";
  const { origin, isCustomPrimary } = getCanonicalOrigin(
    therapist.customDomain,
    therapist.customDomainVerified,
    headerStore.get("host"),
    headerStore.get("x-forwarded-proto"),
  );
  const canonicalPath = buildTenantHref("/", {
    mode: isCustomPrimary ? "custom" : mode,
    slug,
  });

  return {
    title: `${therapist.displayName} | ${therapist.subtitle}`,
    description: therapist.bio,
    alternates: {
      canonical: `${origin}${canonicalPath}`,
    },
  };
}

export default async function TenantCatalogPage({
  params,
}: TenantCatalogPageProps) {
  const { slug } = await params;
  const therapist = getTherapistBySlug(slug);
  if (!therapist) {
    notFound();
  }

  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const bookHref = buildTenantHref("/book", { mode, slug });
  const blogHref = buildTenantHref("/blog", { mode, slug });

  const iranOffering = therapist.offerings.find((o) => o.track === "iran");
  const abroadOffering = therapist.offerings.find((o) => o.track === "abroad");
  const publishedPosts = therapist.blogPosts
    .filter((p) => p.status === "published")
    .slice(0, 3);

  const { origin, isCustomPrimary } = getCanonicalOrigin(
    therapist.customDomain,
    therapist.customDomainVerified,
    headerStore.get("host"),
    headerStore.get("x-forwarded-proto"),
  );
  const canonicalUrl = `${origin}${buildTenantHref("/", {
    mode: isCustomPrimary ? "custom" : mode,
    slug,
  })}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: therapist.displayName,
        jobTitle: therapist.subtitle,
        description: therapist.bio,
        url: canonicalUrl,
      },
      {
        "@type": "ProfessionalService",
        name: `${therapist.displayName} — مشاوره و روان‌درمانی آنلاین`,
        url: canonicalUrl,
        areaServed: ["IR", "Worldwide"],
        provider: {
          "@type": "Person",
          name: therapist.displayName,
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      <SiteHeader
        variant="tenant"
        slug={slug}
        mode={mode}
        therapistName={therapist.displayName}
        activeNav="profile"
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-12 pb-28 lg:pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Main Column */}
          <div className="lg:col-span-7 space-y-6">
            {/* Above-Fold Hero with Warm Sand / Sage-Tint Band */}
            <section className="bg-surface border border-border rounded-2xl overflow-hidden">
              <div className="bg-sand/45 border-b border-border px-5 sm:px-7 py-5">
                <div className="flex items-start gap-4">
                  <Image
                    src={therapist.avatarUrl}
                    alt={therapist.displayName}
                    width={84}
                    height={84}
                    priority
                    className="w-20 h-20 sm:w-[84px] sm:h-[84px] rounded-full object-cover border-2 border-surface shrink-0"
                  />
                  <div className="min-w-0 space-y-1.5">
                    <h1 className="text-[26px] sm:text-[32px] font-bold leading-[1.35] text-ink">
                      {therapist.displayName}
                    </h1>
                    <p className="text-sm sm:text-base text-ink-secondary">
                      {therapist.subtitle}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface border border-border px-3 py-1 text-xs font-medium text-accent tabular-nums">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>شماره پروانه: {therapist.licenseNumber}</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-5 sm:p-7 space-y-5">
                <p className="text-base leading-[1.85] text-ink-secondary">
                  {therapist.bio}
                </p>

                {/* Immediate Above-Fold CTA for Mobile + Below-Fold Sticky Bottom Bar */}
                <MobileStickyBookingBar
                  bookHref={bookHref}
                  startingPriceLabel={
                    iranOffering
                      ? formatCurrency(iranOffering.priceAmount, iranOffering.currency)
                      : abroadOffering
                        ? formatCurrency(abroadOffering.priceAmount, abroadOffering.currency)
                        : null
                  }
                  startingPriceIsLtr={!iranOffering && Boolean(abroadOffering)}
                />
              </div>
            </section>

            {/* 3-Column Trust Strip */}
            <section
              aria-label="شاخص‌های اعتبار حرفه‌ای"
              className="bg-subtle border border-border rounded-2xl p-4 grid grid-cols-3 gap-2 sm:gap-3 text-center"
            >
              <div className="space-y-1">
                <Award className="w-4 h-4 text-clay mx-auto" aria-hidden="true" />
                <span className="block text-base sm:text-lg font-bold text-ink tabular-nums">
                  {toPersianDigits(therapist.experienceYears)} سال سابقه
                </span>
                <span className="block text-xs text-ink-muted">تجربه بالینی</span>
              </div>
              <div className="space-y-1 border-s border-e border-border px-1.5">
                <ShieldCheck className="w-4 h-4 text-accent mx-auto" aria-hidden="true" />
                <span className="block text-sm sm:text-base font-bold text-ink">
                  پروانه رسمی
                </span>
                <span className="block text-xs text-ink-muted">سازمان نظام</span>
              </div>
              <div className="space-y-1">
                <Globe className="w-4 h-4 text-accent mx-auto" aria-hidden="true" />
                <span className="block text-base sm:text-lg font-bold text-ink tabular-nums">
                  {therapist.sessionsHeldLabel}
                </span>
                <span className="block text-xs text-ink-muted">
                  ایران و خارج از کشور
                </span>
              </div>
            </section>

            {/* Jalali Education & Resume Timeline */}
            <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-5">
              <h2 className="text-xl font-bold text-ink">
                تحصیلات و سوابق تخصصی
              </h2>

              <ol className="border-s-2 border-border ps-5 space-y-5">
                {therapist.educationTimeline.map((edu) => (
                  <li key={edu.id} className="relative space-y-1">
                    <span
                      className="absolute -start-[27px] top-1.5 w-3 h-3 rounded-full bg-accent border-2 border-surface"
                      aria-hidden="true"
                    />
                    <span className="inline-block text-xs font-semibold text-accent tabular-nums">
                      {edu.periodJalali}
                    </span>
                    <h3 className="text-base font-semibold text-ink">
                      {edu.degree}
                    </h3>
                    <p className="text-sm text-ink-secondary">{edu.institution}</p>
                    {edu.note ? (
                      <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                        {edu.note}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>

            {/* Approach & Monochrome Focus Areas (<= 8) */}
            <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <h2 className="text-xl font-bold text-ink">
                رویکرد درمانی و حوزه‌های تخصصی
              </h2>
              <p className="text-base leading-[1.8] text-ink-secondary">
                {therapist.approachSummary}
              </p>

              <ul className="flex flex-wrap gap-2 pt-1" aria-label="حوزه‌های تمرکز">
                {therapist.focusAreas.slice(0, 8).map((area) => (
                  <li
                    key={area}
                    className="rounded-full bg-subtle border border-border text-ink-secondary px-3 py-1.5 text-sm"
                  >
                    {area}
                  </li>
                ))}
              </ul>
            </section>

            {/* Verified Reflections */}
            {therapist.reviewsEnabled && therapist.reflections.length > 0 ? (
              <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl font-bold text-ink">
                    تجربه مراجعان تاییدشده
                  </h2>
                  <StatusBadge variant="confirmed" label="مراجع تاییدشده" />
                </div>

                <div className="space-y-3">
                  {therapist.reflections.map((item) => (
                    <blockquote
                      key={item.id}
                      className="rounded-xl bg-subtle/60 border border-border p-4 space-y-2.5"
                    >
                      <Quote className="w-4 h-4 text-clay" aria-hidden="true" />
                      <p className="text-sm sm:text-base leading-[1.8] text-ink-secondary">
                        «{item.comment}»
                      </p>
                      <footer className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                        <span>{item.clientLabel}</span>
                        <span className="tabular-nums">{item.dateJalali}</span>
                      </footer>
                    </blockquote>
                  ))}
                </div>
              </section>
            ) : null}

            {/* Latest Blog Posts with Real Cover Thumbnails */}
            {publishedPosts.length > 0 ? (
              <section className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-xl font-bold text-ink">
                    مقالات و یادداشت‌های آموزشی
                  </h2>
                  <Link
                    href={blogHref}
                    className="min-h-[44px] inline-flex items-center gap-1 text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    <span>مشاهده همه مقالات</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </div>

                <div className="space-y-3">
                  {publishedPosts.map((post) => {
                    const postHref = buildTenantHref(`/blog/${post.slug}`, {
                      mode,
                      slug,
                    });
                    return (
                      <article
                        key={post.slug}
                        className="rounded-xl border border-border bg-canvas/50 p-3.5 sm:p-4 hover:border-accent/60 transition-colors flex flex-col sm:flex-row gap-4 items-start"
                      >
                        <Link
                          href={postHref}
                          className="relative w-full sm:w-32 aspect-[16/9] sm:aspect-[4/3] rounded-lg overflow-hidden border border-border bg-subtle shrink-0"
                        >
                          <Image
                            src={post.coverImageUrl}
                            alt={post.title}
                            fill
                            sizes="(max-width: 640px) 100vw, 128px"
                            className="object-cover"
                          />
                        </Link>
                        <div className="min-w-0 space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted tabular-nums">
                            <span>{post.publishedAtJalali}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه</span>
                            </span>
                          </div>
                          <h3 className="text-base font-semibold text-ink">
                            <Link
                              href={postHref}
                              className="hover:text-accent transition-colors"
                            >
                              {post.title}
                            </Link>
                          </h3>
                          <p className="text-sm text-ink-secondary line-clamp-2">
                            {post.excerpt}
                          </p>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ) : null}
          </div>

          {/* Desktop Sticky Sidebar Summary & Booking Card */}
          <aside className="hidden lg:block lg:col-span-5 lg:sticky lg:top-24 bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="bg-subtle/60 border-b border-border px-6 py-4 space-y-1">
              <h2 className="text-lg font-bold text-ink">
                رزرو جلسه آنلاین با {therapist.displayName}
              </h2>
              <p className="text-xs sm:text-sm text-ink-secondary">
                انتخاب تقویم جلالی (داخل ایران) یا میلادی با ساعت محلی (خارج از کشور)
              </p>
            </div>

            <div className="p-6 space-y-5">
              <div className="space-y-2.5">
                {therapist.offerings.map((offering) => (
                  <div
                    key={offering.id}
                    className="rounded-xl border border-border bg-subtle/40 px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">
                        {offering.title}
                      </span>
                      <span className="block text-xs text-ink-muted tabular-nums">
                        {offering.track === "iran" ? "داخل ایران" : "خارج از ایران"} ·{" "}
                        {toPersianDigits(offering.durationMinutes)} دقیقه
                      </span>
                    </div>
                    <span
                      dir={offering.currency === "IRT" ? "rtl" : "ltr"}
                      className="shrink-0 text-sm sm:text-base font-bold text-accent tabular-nums"
                    >
                      {formatCurrency(offering.priceAmount, offering.currency)}
                    </span>
                  </div>
                ))}
              </div>

              <Link
                href={bookHref}
                className="w-full min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
              >
                انتخاب زمان و رزرو جلسه
              </Link>

              <p className="text-xs leading-relaxed text-ink-muted text-center">
                اطلاعات پرداخت و قفل موقت ۱۵ دقیقه‌ای بلافاصله پس از انتخاب زمان و تایید کد یک‌بارمصرف نمایش داده می‌شود.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </>
  );
}
