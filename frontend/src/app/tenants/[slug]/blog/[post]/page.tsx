import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, Calendar, ChevronLeft, Clock } from "lucide-react";
import { toPersianDigits } from "@/lib/jalali";
import { getBlogPostForTherapist } from "@/lib/mock-data";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantBlogPostPageProps {
  params: Promise<{ slug: string; post: string }>;
}

export async function generateMetadata({
  params,
}: TenantBlogPostPageProps): Promise<Metadata> {
  const { slug, post: postSlug } = await params;
  const found = getBlogPostForTherapist(slug, postSlug);
  if (!found) {
    return { title: "مقاله یافت نشد" };
  }

  const { therapist, post } = found;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";
  const isCustomPrimary = Boolean(
    therapist.customDomainVerified && therapist.customDomain,
  );
  const host = isCustomPrimary
    ? therapist.customDomain
    : headerStore.get("host") ?? "ravannama.ir";
  const rawProto = (headerStore.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const proto = isCustomPrimary ? "https" : rawProto === "http" ? "http" : "https";

  const canonicalPath = buildTenantHref(`/blog/${post.slug}`, {
    mode: isCustomPrimary ? "custom" : mode,
    slug,
  });

  return {
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    alternates: {
      canonical: `${proto}://${host}${canonicalPath}`,
    },
  };
}

export default async function TenantBlogPostPage({
  params,
}: TenantBlogPostPageProps) {
  const { slug, post: postSlug } = await params;
  const found = getBlogPostForTherapist(slug, postSlug);

  if (!found) {
    notFound();
  }

  const { therapist, post } = found;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const profileHref = buildTenantHref("/", { mode, slug });
  const blogHref = buildTenantHref("/blog", { mode, slug });
  const bookHref = buildTenantHref("/book", { mode, slug });

  const relatedPosts = therapist.blogPosts
    .filter((p) => p.status === "published" && p.slug !== post.slug)
    .slice(0, 3);

  const inlineCtaAfterIndex = Math.max(
    0,
    Math.ceil(post.sections.length * 0.6) - 1,
  );

  const isCustomPrimary = Boolean(
    therapist.customDomainVerified && therapist.customDomain,
  );
  const host = isCustomPrimary
    ? therapist.customDomain
    : headerStore.get("host") ?? "ravannama.ir";
  const rawProto = (headerStore.get("x-forwarded-proto") ?? "")
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const proto = isCustomPrimary ? "https" : rawProto === "http" ? "http" : "https";
  const canonicalUrl = `${proto}://${host}${buildTenantHref(`/blog/${post.slug}`, {
    mode: isCustomPrimary ? "custom" : mode,
    slug,
  })}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.seoDescription || post.excerpt,
    datePublished: post.publishedAtIso,
    mainEntityOfPage: canonicalUrl,
    author: {
      "@type": "Person",
      name: therapist.displayName,
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c"),
        }}
      />

      {/* Minimal Distraction-Free Blog Navigation Header */}
      <header className="sticky top-0 z-30 h-16 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <Link
            href={profileHref}
            className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-ink hover:text-accent transition-colors min-w-0"
          >
            <ChevronLeft className="w-5 h-5 rtl:rotate-180 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">پروفایل درمانگر</span>
            <span className="hidden sm:inline truncate">بازگشت به پروفایل درمانگر</span>
          </Link>

          <nav className="shrink-0 flex items-center gap-2">
            <Link
              href={blogHref}
              className="min-h-[44px] inline-flex items-center px-3 rounded-xl text-xs sm:text-sm font-medium text-ink-secondary hover:bg-subtle hover:text-ink transition-colors"
            >
              همه مقالات
            </Link>
            <Link
              href="/my-sessions"
              className="min-h-[44px] inline-flex items-center px-3 rounded-xl border border-border bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle transition-colors"
            >
              پیگیری نوبت
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Prose Column */}
          <article className="lg:col-span-8 space-y-8">
            <div className="max-w-[65ch] space-y-5">
              <div className="flex flex-wrap items-center gap-3 text-xs sm:text-sm text-ink-muted tabular-nums">
                <span className="inline-flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-accent" aria-hidden="true" />
                  <span>{post.publishedAtJalali}</span>
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-clay" aria-hidden="true" />
                  <span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه</span>
                </span>
              </div>

              <h1 className="text-2xl sm:text-[32px] font-bold leading-[1.4] text-ink">
                {post.title}
              </h1>

              {/* Author mini-card */}
              <Link
                href={profileHref}
                className="inline-flex items-center gap-3 rounded-2xl border border-border bg-surface px-3.5 py-2.5 hover:border-accent transition-colors"
              >
                <Image
                  src={therapist.avatarUrl}
                  alt={therapist.displayName}
                  width={44}
                  height={44}
                  className="w-11 h-11 rounded-full object-cover border border-border shrink-0"
                />
                <div className="min-w-0">
                  <span className="block text-sm font-bold text-ink">
                    {therapist.displayName}
                  </span>
                  <span className="block text-xs text-ink-muted">
                    {therapist.subtitle}
                  </span>
                </div>
              </Link>

              {/* Hero Cover Image */}
              <div className="relative aspect-[16/9] rounded-2xl overflow-hidden border border-border bg-subtle">
                <Image
                  src={post.coverImageUrl}
                  alt={post.title}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 640px"
                  className="object-cover"
                />
              </div>

              {/* Mobile Collapsible TOC */}
              {post.sections.length > 0 ? (
                <details className="lg:hidden rounded-2xl border border-border bg-surface overflow-hidden">
                  <summary className="min-h-[48px] px-4 py-3 flex items-center justify-between cursor-pointer text-sm font-semibold text-ink list-none">
                    <span className="inline-flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-accent" aria-hidden="true" />
                      <span>فهرست مطالب مقاله</span>
                    </span>
                    <span className="text-xs text-ink-muted">مشاهده</span>
                  </summary>
                  <nav
                    aria-label="فهرست بخش‌های مقاله"
                    className="px-4 pb-4 pt-1 border-t border-border"
                  >
                    <ul className="space-y-2 text-sm">
                      {post.sections.map((section) => (
                        <li
                          key={section.headingId}
                          className={section.level === 3 ? "ps-4" : ""}
                        >
                          <a
                            href={`#${section.headingId}`}
                            className="min-h-[44px] inline-flex items-center text-ink-secondary hover:text-accent transition-colors"
                          >
                            {section.headingText}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </nav>
                </details>
              ) : null}

              {/* Article Sections with Inline Clay-Tint CTA at ~60% Depth */}
              <div className="space-y-7">
                {post.sections.map((section, idx) => (
                  <div key={section.headingId} className="space-y-5">
                    <section className="space-y-4">
                      {section.level === 2 ? (
                        <h2
                          id={section.headingId}
                          className="scroll-mt-24 text-xl sm:text-2xl font-bold leading-[1.45] text-ink pt-2"
                        >
                          {section.headingText}
                        </h2>
                      ) : (
                        <h3
                          id={section.headingId}
                          className="scroll-mt-24 text-lg sm:text-xl font-semibold leading-[1.5] text-ink pt-1"
                        >
                          {section.headingText}
                        </h3>
                      )}

                      <div className="space-y-5 text-[17px] leading-[1.85] text-ink-secondary">
                        {section.paragraphs.map((paragraph, pIdx) => (
                          <p key={pIdx}>{paragraph}</p>
                        ))}
                      </div>
                    </section>

                    {idx === inlineCtaAfterIndex ? (
                      <aside className="rounded-2xl border border-border bg-clay-tint p-5 space-y-4">
                        <div className="flex items-center gap-3">
                          <Image
                            src={therapist.avatarUrl}
                            alt={therapist.displayName}
                            width={48}
                            height={48}
                            className="w-12 h-12 rounded-full object-cover border border-surface shrink-0"
                          />
                          <div>
                            <h3 className="text-base sm:text-lg font-bold text-ink">
                              نیاز به گفتگوی اختصاصی با {therapist.displayName} دارید؟
                            </h3>
                            <span className="text-xs text-ink-muted">
                              {therapist.subtitle}
                            </span>
                          </div>
                        </div>
                        <p className="text-sm leading-[1.75] text-ink-secondary">
                          می‌توانید زمان مناسب خود را در تقویم جلالی (داخل ایران) یا تقویم میلادی با ساعت محلی (خارج از کشور) انتخاب کنید.
                        </p>
                        <Link
                          href={bookHref}
                          className="min-h-[44px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                        >
                          رزرو جلسه آنلاین
                        </Link>
                      </aside>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Bottom Author Bio & Soft CTA */}
            <section className="max-w-[65ch] bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-start gap-4">
                <Image
                  src={therapist.avatarUrl}
                  alt={therapist.displayName}
                  width={64}
                  height={64}
                  className="w-16 h-16 rounded-full object-cover border border-border shrink-0"
                />
                <div className="space-y-1">
                  <h2 className="text-base sm:text-lg font-bold text-ink">
                    درباره نویسنده: {therapist.displayName}
                  </h2>
                  <p className="text-sm text-ink-secondary leading-[1.7]">
                    {therapist.approachSummary}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  href={bookHref}
                  className="min-h-[44px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  رزرو جلسه آنلاین
                </Link>
                <Link
                  href={profileHref}
                  className="min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl border border-border-strong bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
                >
                  مشاهده پروفایل کامل
                </Link>
              </div>
            </section>

            {/* Related Articles */}
            {relatedPosts.length > 0 ? (
              <section className="max-w-[65ch] space-y-3 pt-2">
                <h2 className="text-lg font-bold text-ink">مقالات مرتبط</h2>
                <div className="space-y-3">
                  {relatedPosts.map((related) => (
                    <Link
                      key={related.slug}
                      href={buildTenantHref(`/blog/${related.slug}`, {
                        mode,
                        slug,
                      })}
                      className="flex items-center gap-3.5 rounded-2xl border border-border bg-surface p-3.5 hover:border-accent transition-colors"
                    >
                      <div className="relative w-24 aspect-[16/9] rounded-lg overflow-hidden border border-border bg-subtle shrink-0">
                        <Image
                          src={related.coverImageUrl}
                          alt={related.title}
                          fill
                          sizes="96px"
                          className="object-cover"
                        />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <span className="block text-xs text-ink-muted tabular-nums">
                          {related.publishedAtJalali} ·{" "}
                          {toPersianDigits(related.readingMinutes)} دقیقه مطالعه
                        </span>
                        <span className="block text-sm sm:text-base font-semibold text-ink line-clamp-2">
                          {related.title}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}
          </article>

          {/* Desktop Sticky TOC */}
          {post.sections.length > 0 ? (
            <aside className="hidden lg:block lg:col-span-4 lg:sticky lg:top-24 bg-surface border border-border rounded-2xl p-5 space-y-4">
              <h2 className="text-base font-bold text-ink inline-flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-accent" aria-hidden="true" />
                <span>فهرست مطالب مقاله</span>
              </h2>
              <nav aria-label="فهرست مطالب">
                <ul className="space-y-2.5 text-sm border-s-2 border-border ps-3.5">
                  {post.sections.map((section) => (
                    <li
                      key={section.headingId}
                      className={section.level === 3 ? "ps-3" : ""}
                    >
                      <a
                        href={`#${section.headingId}`}
                        className="block py-1 text-ink-secondary hover:text-accent transition-colors leading-relaxed"
                      >
                        {section.headingText}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>

              <div className="pt-3 border-t border-border">
                <Link
                  href={bookHref}
                  className="w-full min-h-[44px] inline-flex items-center justify-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  رزرو جلسه با {therapist.displayName}
                </Link>
              </div>
            </aside>
          ) : null}
        </div>
      </main>
    </>
  );
}
