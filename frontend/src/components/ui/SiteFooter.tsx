import Link from "next/link";
import { Globe, Lock, ShieldCheck } from "lucide-react";
import { BrandLogoMark } from "./SiteHeader";

export function SiteFooter() {
  return (
    <footer className="bg-subtle/70 border-t border-border mt-12">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-start">
          {/* Brand Summary */}
          <div className="md:col-span-5 space-y-3">
            <div className="flex items-center gap-2">
              <BrandLogoMark />
              <span className="text-lg font-bold text-ink">روان‌نما</span>
            </div>
            <p className="text-sm leading-[1.8] text-ink-secondary max-w-sm">
              پلتفرم امن رزرو آنلاین جلسات روان‌درمانی و مشاوره با متخصصان دارای پروانه رسمی، طراحی‌شده برای مراجعان داخل ایران و ایرانیان سراسر جهان.
            </p>
            <div className="flex flex-wrap gap-3 pt-1 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" />
                <span>تاییدشده توسط نظام روانشناسی</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-accent" aria-hidden="true" />
                <span>ارتباط محرمانه</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-accent" aria-hidden="true" />
                <span>ایران و خارج از کشور</span>
              </span>
            </div>
          </div>

          {/* Client Links */}
          <div className="md:col-span-4 space-y-3">
            <h2 className="text-sm font-bold text-ink">مسیر مراجعان</h2>
            <ul className="space-y-1 text-sm">
              <li>
                <Link
                  href="/therapists"
                  className="min-h-[44px] inline-flex items-center text-ink-secondary hover:text-accent transition-colors"
                >
                  یافتن درمانگر مناسب
                </Link>
              </li>
              <li>
                <Link
                  href="/my-sessions"
                  className="min-h-[44px] inline-flex items-center text-ink-secondary hover:text-accent transition-colors"
                >
                  پیگیری نوبت و ورود به جلسه
                </Link>
              </li>
              <li>
                <Link
                  href="/dr-sara-ahmadi/book"
                  className="min-h-[44px] inline-flex items-center text-ink-secondary hover:text-accent transition-colors"
                >
                  رزرو آنلاین خارج از کشور و ایران
                </Link>
              </li>
            </ul>
          </div>

          {/* Secondary B2B Entry */}
          <div className="md:col-span-3 space-y-3">
            <h2 className="text-sm font-bold text-ink">ویژه متخصصان</h2>
            <div className="rounded-2xl border border-border bg-surface p-4 space-y-2">
              <p className="text-xs leading-[1.7] text-ink-secondary">
                درمانگر یا کلینیک هستید؟ صفحه اختصاصی بدون تبلیغ رقیب خود را بسازید.
              </p>
              <Link
                href="/for-therapists"
                className="min-h-[44px] inline-flex items-center text-sm font-semibold text-accent hover:text-accent-hover underline underline-offset-4"
              >
                آشنایی با روان‌نما برای درمانگران
              </Link>
            </div>
          </div>
        </div>

        <div className="pt-5 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-ink-muted">
          <span>© روان‌نما — آرامشِ گفت‌وگویی امن و حرفه‌ای</span>
          <span>تمامی جلسات آنلاین در بستر رمزنگاری‌شده برگزار می‌شوند</span>
        </div>
      </div>
    </footer>
  );
}
