import Link from "next/link";

export default function PlatformHomePage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-8">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">روان‌نما</h1>
          <p className="text-sm text-ink-secondary">
            پلتفرم تخصصی رزرو جلسات آنلاین روان‌شناسی
          </p>
        </div>
        <nav className="flex items-center gap-3">
          <Link
            href="/therapists"
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
          >
            درمانگران
          </Link>
          <Link
            href="/my-sessions"
            className="min-h-[44px] inline-flex items-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
          >
            پیگیری نوبت
          </Link>
        </nav>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-4">
        <h2 className="text-xl font-semibold text-ink">
          آغاز ساختار روان‌نما (مرحله ۰)
        </h2>
        <p className="text-base leading-relaxed text-ink-secondary">
          زیرساخت چندمستاجری، تقویم دوزبانه جلالی و میلادی و درگاه‌های امن رزرو آنلاین در حال آماده‌سازی است.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/therapists"
            className="min-h-[48px] inline-flex items-center px-5 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
          >
            مشاهده فهرست درمانگران
          </Link>
          <Link
            href="/dashboard"
            className="min-h-[48px] inline-flex items-center px-5 rounded-xl border border-border-strong bg-surface text-ink text-base font-medium hover:bg-subtle transition-colors"
          >
            داشبورد درمانگر
          </Link>
        </div>
      </section>
    </main>
  );
}
