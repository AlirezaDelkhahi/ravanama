import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, BookOpen, Calendar, ChevronLeft, Clock } from "lucide-react";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { toPersianDigits } from "@/lib/jalali";
import { buildTenantCanonicalUrl } from "@/lib/seo";
import { fetchTherapistCatalog } from "@/lib/server-api";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantBlogIndexPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: TenantBlogIndexPageProps): Promise<Metadata> {
  const { slug } = await params;
  const therapist = await fetchTherapistCatalog(slug);
  if (!therapist) return { title: "وبلاگ" };

  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";
  const canonicalUrl = buildTenantCanonicalUrl({
    path: "/blog",
    slug,
    mode,
    customDomain: therapist.customDomain,
    customDomainVerified: therapist.customDomainVerified,
    hostHeader: headerStore.get("host"),
    protoHeader: headerStore.get("x-forwarded-proto"),
  });

  return {
    title: `مقالات آموزشی ${therapist.displayName}`,
    description: `یادداشت‌ها و مقالات تخصصی ${therapist.displayName} درباره سلامت روان، رابطه زوجین و سازگاری مهاجرت`,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function TenantBlogIndexPage({
  params,
}: TenantBlogIndexPageProps) {
  const { slug } = await params;
  const therapist = await fetchTherapistCatalog(slug);
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
            <div className="space-y-1.5 text-start">
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
                className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col justify-between items-stretch text-start"
              >
                <div className="w-full text-start">
                  <Link
                    href={postHref}
                    className="block w-full relative aspect-[16/9] border-b border-border bg-subtle overflow-hidden"
                  >
                    <Image
                      src={post.coverImageUrl}
                      alt={post.title}
                      fill
                      sizes="(max-width: 768px) 100vw, 480px"
                      className="object-cover"
                    />
                  </Link>
                  <div className="w-full p-5 sm:p-6 space-y-3 text-start">
                    <div className="w-full flex flex-wrap items-center justify-start gap-3 text-xs text-ink-muted tabular-nums text-start">
                      <span className="inline-flex items-center gap-1 text-start">
                        <Calendar className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{post.publishedAtJalali}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-start">
                        <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{toPersianDigits(post.readingMinutes)} دقیقه مطالعه</span>
                      </span>
                    </div>
                    <h2 className="w-full text-lg sm:text-xl font-bold leading-[1.45] text-ink text-start">
                      <Link
                        href={postHref}
                        className="block w-full text-start hover:text-accent transition-colors"
                      >
                        {post.title}
                      </Link>
                    </h2>
                    <p className="w-full text-sm sm:text-base leading-[1.75] text-ink-secondary text-start">
                      {post.excerpt}
                    </p>
                  </div>
                </div>

                <div className="w-full px-5 sm:px-6 pb-5 flex justify-start text-start">
                  <Link
                    href={postHref}
                    className="min-h-[44px] inline-flex items-center justify-start gap-1.5 text-sm font-medium text-accent hover:text-accent-hover text-start"
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
