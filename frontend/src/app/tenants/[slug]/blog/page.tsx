import { headers } from "next/headers";
import Link from "next/link";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const revalidate = 300;

interface TenantBlogIndexPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantBlogIndexPage({ params }: TenantBlogIndexPageProps) {
  const { slug } = await params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const profileHref = buildTenantHref("/", { mode, slug });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-ink">مقالات آموزشی</h1>
        <div className="flex items-center gap-3">
          <Link
            href={profileHref}
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
          >
            بازگشت به پروفایل درمانگر
          </Link>
          <Link
            href="/my-sessions"
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
          >
            پیگیری نوبت
          </Link>
        </div>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink">فهرست یادداشت‌ها و مقالات</h2>
        <p className="text-base text-ink-secondary">
          مقالات منتشرشده توسط درمانگر با ساختار سئو و تاریخ جلالی در این صفحه نمایش داده می‌شوند.
        </p>
      </section>
    </main>
  );
}
