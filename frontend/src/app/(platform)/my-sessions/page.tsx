import Link from "next/link";

export default function MySessionsPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-ink">پیگیری نوبت‌ها</h1>
        <Link
          href="/therapists"
          className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
        >
          فهرست درمانگران
        </Link>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink">پورتال مراجع</h2>
        <p className="text-base text-ink-secondary">
          برای مشاهده وضعیت نوبت‌ها، لینک ورود به جلسه یا بارگذاری مجدد رسید، از طریق کد تایید یک‌بارمصرف وارد شوید.
        </p>
      </section>
    </main>
  );
}
