import { headers } from "next/headers";
import Link from "next/link";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const dynamic = "force-dynamic";

interface TenantBookPageProps {
  params: Promise<{ slug: string }>;
}

export default async function TenantBookPage({ params }: TenantBookPageProps) {
  const { slug } = await params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const profileHref = buildTenantHref("/", { mode, slug });

  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-ink">رزرو آنلاین جلسه</h1>
        <Link
          href={profileHref}
          className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
        >
          بازگشت به پروفایل
        </Link>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink">ویزارد ۴ مرحله‌ای رزرو نوبت</h2>
        <p className="text-base text-ink-secondary">
          انتخاب مسیر داخل ایران یا خارج از ایران، تقویم جلالی یا میلادی، تایید کد یک‌بارمصرف و بارگذاری رسید در مرحله ۱ پیاده‌سازی می‌شود.
        </p>
      </section>
    </main>
  );
}
