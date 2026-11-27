import Link from "next/link";

export default function TherapistsDirectoryPage() {
  return (
    <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-16 space-y-6">
      <header className="flex items-center justify-between gap-4 border-b border-border pb-4">
        <h1 className="text-2xl font-bold text-ink">فهرست درمانگران روان‌نما</h1>
        <Link
          href="/my-sessions"
          className="min-h-[44px] inline-flex items-center px-4 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
        >
          پیگیری نوبت
        </Link>
      </header>

      <section className="bg-surface border border-border rounded-2xl p-4 sm:p-6 space-y-3">
        <h2 className="text-lg font-semibold text-ink">معرفی درمانگران عضو دایرکتوری</h2>
        <p className="text-base text-ink-secondary">
          درمانگرانی که نمایش عمومی در فهرست روان‌نما را فعال کرده باشند، در این بخش نمایش داده می‌شوند.
        </p>
      </section>
    </main>
  );
}
