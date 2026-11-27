import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Calendar, ChevronLeft, Clock } from "lucide-react";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { toPersianDigits } from "@/lib/jalali";
import { getTherapistBySlug } from "@/lib/mock-data";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantBlogIndexPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: TenantBlogIndexPageProps): Promise<Metadata> {
  const { slug } = await params;
  const therapist = getTherapistBySlug(slug);
  if (!therapist) return { title: "وبلاگ" };

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
  const canonicalPath = buildTenantHref("/blog", {
    mode: isCustomPrimary ? "custom" : mode,
    slug,
  });

  return {
    title: `مقالات آموزشی ${therapist.displayName}`,
    description: `یادداشت‌ها و مقالات تخصصی ${therapist.displayName} درباره سلامت روان، رابطه زوجین و سازگاری مهاجرت`,
    alternates: {
      canonical: `${proto}://${host}${canonicalPath}`,
    },
  };
}

export default async function TenantBlogIndexPage({
  params,
}: TenantBlogIndexPageProps) {
  const { slug } = await params;
  const therapist = getTherapistBySlug(slug);
  if (!therapist) {
    notFound();
  }

  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const profileHref = buildTenantHref("/", { mode, slug });
  const bookHref = buildTenantHref("/book", { mode, slug });
  const posts = therapist.blogPosts.filter((p) => p.status === "published");

  return (
    <>
      <SiteHeader
        variant="tenant"
        slug={slug}
        mode={mode}
        therapistName={therapist.displayName}
        activeNav="blog"
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12 space-y-8">
        <div className="space-y-4">
          <Link
            href={profileHref}
            className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
          >
            <ChevronLeft className="w-4 h-4 rtl:rotate-180 shrink-0" aria-hidden="true" />
            <span>بازگشت به پروفایل درمانگر</span>
          </Link>

          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-border pb-6">
            <div className="space-y-1.5">
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-clay">
                <BookOpen className="w-4 h-4" aria-hidden="true" />
                <span>یادداشت‌های تخصصی</span>
              </span>
              <h1 className="text-2xl sm:text-3xl font-bold text-ink">
                یادداشت‌ها و مقالات آموزشی
              </h1>
              <p className="text-sm sm:text-base text-ink-secondary">
                نوشته {therapist.displayName} · {therapist.subtitle}
              </p>
            </div>
            <Link
              href={bookHref}
              className="min-h-[44px] inline-flex items-center justify-center px-5 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              رزرو جلسه آنلاین
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {posts.map((post) => {
            const postHref = buildTenantHref(`/blog/${post.slug}`, { mode, slug });
            return (
              <article
                key={post.slug}
                className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col justify-between"
              >
                <div>
                  <Link
                    href={postHref}
                    className="block relative aspect-[16/9] border-b border-border bg-subtle overflow-hidden"
                  >
                    <Image
                      src={post.coverImageUrl}
                      alt={post.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 480px"
                      className="object-cover"
                    />
                  </Link>
                  <div className="p-5 sm:p-6 space-y-3">
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{post.publishedAtJalali}</span>
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه</span>
                      </span>
                    </div>
                    <h2 className="text-lg sm:text-xl font-bold leading-[1.45] text-ink">
                      <Link
                        href={postHref}
                        className="hover:text-accent transition-colors"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <p className="text-sm sm:text-base leading-[1.75] text-ink-secondary">
                      {post.excerpt}
                    </p>
                  </div>
                </div>

                <div className="px-5 sm:px-6 pb-5">
                  <Link
                    href={postHref}
                    className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
                  >
                    <span>مطالعه مقاله</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </>
  );
}
