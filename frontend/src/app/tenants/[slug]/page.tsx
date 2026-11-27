import { headers } from "next/headers";
import Link from "next/link";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantCatalogPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantCatalogPage({ params }: TenantCatalogPageProps) {
  const { slug } = await params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const bookHref = buildTenantHref("/book", { mode, slug });
  const blogHref = buildTenantHref("/blog", { mode, slug });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink">پروفایل درمانگر</h1>
          <p className="text-sm text-ink-muted tabular-nums" dir="ltr">
            {slug}
          </p>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href={blogHref}
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
          >
            وبلاگ
          </Link>
          <Link
            href="/my-sessions"
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
          >
            پیگیری نوبت
          </Link>
        </nav>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
        <h2 className="text-lg font-semibold text-ink">صفحه اختصاصی معرفی و رزرو</h2>
        <p className="text-base text-ink-secondary">
          معرفی تخصصی درمانگر، سوابق تحصیلی، مقالات آموزشی و رزرو آنلاین جلسه در این بخش قرار می‌گیرد.
        </p>
        <div className="pt-2">
          <Link
            href={bookHref}
            className="min-h-[48px] inline-flex items-center px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
          >
            رزرو جلسه آنلاین
          </Link>
        </div>
      </section>
    </main>
  );
}
