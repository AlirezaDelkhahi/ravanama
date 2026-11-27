import { headers } from "next/headers";
import Link from "next/link";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantBlogPostPageProps {
  params: Promise<{ slug: string; post: string }>;
}

export default async function TenantBlogPostPage({ params }: TenantBlogPostPageProps) {
  const { slug, post } = await params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const blogHref = buildTenantHref("/blog", { mode, slug });
  const bookHref = buildTenantHref("/book", { mode, slug });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <Link
          href={blogHref}
          className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
        >
          بازگشت به فهرست مقالات
        </Link>
        <Link
          href={bookHref}
          className="min-h-[44px] inline-flex items-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          رزرو جلسه
        </Link>
      </header>

      <article className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4 max-w-[65ch]">
        <h1 className="text-2xl font-bold text-ink">مقاله آموزشی</h1>
        <p className="text-sm text-ink-muted tabular-nums" dir="ltr">
          {slug}/{post}
        </p>
        <p className="text-[17px] leading-[1.85] text-ink-secondary">
          محتوای مقاله تخصصی درمانگر به همراه فهرست مطالب و داده‌های ساختاریافته سئو در این بخش نمایش داده می‌شود.
        </p>
      </article>
    </main>
  );
}
