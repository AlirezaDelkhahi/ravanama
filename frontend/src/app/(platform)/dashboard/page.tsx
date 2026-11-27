import Link from "next/link";

export default function TherapistDashboardPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-ink">داشبورد درمانگر</h1>
        <Link
          href="/"
          className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
        >
          صفحه اصلی
        </Link>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink">مدیریت نوبت‌ها و برنامه هفتگی</h2>
        <p className="text-base text-ink-secondary">
          بخش‌های بررسی رسیدهای واریز، تنظیم ساعات هفتگی شنبه تا جمعه، مرخصی‌های جلالی و مدیریت وبلاگ در این پنل قرار می‌گیرند.
        </p>
      </section>
    </main>
  );
}
