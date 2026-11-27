import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  FileSearch,
  Globe,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { BrandLogoMark } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "روان‌نما برای درمانگران و کلینیک‌ها",
  description:
    "ویترین اختصاصی بدون تبلیغ رقیب، وبلاگ سئو، دامنه شخصی و نوبت‌دهی دوزبانه جلالی و میلادی برای روانشناسان و کلینیک‌ها",
};

export default function ForTherapistsPage() {
  return (
    <>
      <header className="sticky top-0 z-30 h-16 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          <Link href="/" className="min-w-0 flex items-center gap-2 py-1">
            <BrandLogoMark />
            <span className="text-sm sm:text-base font-bold text-ink truncate">
              <span className="sm:hidden">روان‌نما</span>
              <span className="hidden sm:inline">روان‌نما برای درمانگران</span>
            </span>
          </Link>

          <nav
            aria-label="ناوبری صفحه معرفی درمانگران"
            className="shrink-0 flex items-center gap-1.5 sm:gap-2.5"
          >
            <Link
              href="/"
              className="min-h-[44px] inline-flex items-center px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-medium text-ink-secondary hover:bg-subtle hover:text-ink transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">مراجعان</span>
              <span className="hidden sm:inline">صفحه مراجعان</span>
            </Link>
            <Link
              href="/dashboard"
              className="min-h-[44px] inline-flex items-center gap-1.5 px-3 sm:px-4 rounded-xl bg-accent text-white text-xs sm:text-sm font-medium hover:bg-accent-hover transition-colors whitespace-nowrap"
            >
              <LayoutDashboard className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span className="sm:hidden">پنل پیش‌نمایش</span>
              <span className="hidden sm:inline">ورود به پنل پیش‌نمایش</span>
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Split Hero */}
        <section className="border-b border-border bg-canvas">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-clay-tint border border-border px-3.5 py-1.5 text-xs sm:text-sm font-medium text-clay">
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>ساخته‌شده برای روان‌شناسان مستقل و کلینیک‌ها</span>
                </div>

                <h1 className="text-[26px] sm:text-[34px] font-bold leading-[1.4] text-ink">
                  ویترین اختصاصی بدون تبلیغ رقیب، وبلاگ سئو و نوبت‌دهی دوزبانه
                </h1>

                <p className="text-base leading-[1.8] text-ink-secondary">
                  به جای هدایت مراجعان به دایرکتوری‌های شلوغ یا کلنجار با افزونه‌های پرخطای وردپرس، برند شخصی خود را روی دامنه اختصاصی بسازید و هم‌زمان نوبت‌های ریالی داخل ایران و ارزی خارج از کشور را با آرامش مدیریت کنید.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/dashboard"
                    className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
                  >
                    <span>مشاهده پنل مدیریت درمانگر</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                  <Link
                    href="/dr-sara-ahmadi"
                    className="min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl border border-border-strong bg-surface text-ink text-base font-medium hover:bg-subtle transition-colors"
                  >
                    مشاهده نمونه صفحه درمانگر
                  </Link>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="rounded-2xl border border-border bg-surface p-2 sm:p-2.5">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-subtle">
                    <Image
                      src="/images/therapist-landing-hero.jpg"
                      alt="میز کار حرفه‌ای درمانگر برای مدیریت جلسات آنلاین در روان‌نما"
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 420px"
                      className="object-cover"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Why RavanNama Features */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-8">
          <div className="space-y-2 max-w-2xl">
            <h2 className="text-2xl sm:text-3xl font-bold text-ink">
              چرا درمانگران روان‌نما را انتخاب می‌کنند؟
            </h2>
            <p className="text-sm sm:text-base text-ink-secondary">
              راه‌حل یکپارچه برای حذف هماهنگی دستی واتساپ، خطاهای تقویم دوزبانه و نشت ترافیک برند شخصی
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <article className="bg-surface border border-border rounded-2xl p-6 space-y-3">
              <span className="w-11 h-11 rounded-xl bg-accent-tint text-accent inline-flex items-center justify-center">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-ink">
                صفحه اختصاصی بدون نمایش رقیب
              </h3>
              <p className="text-sm leading-[1.8] text-ink-secondary">
                در صفحه شخصی و مقالات وبلاگ شما، هیچ درمانگر رقیبی معرفی نمی‌شود. تمام ورودی‌های جستجوی گوگل و شبکه‌های اجتماعی مستقیماً به تقویم رزرو خودتان هدایت می‌شوند.
              </p>
            </article>

            <article className="bg-surface border border-border rounded-2xl p-6 space-y-3">
              <span className="w-11 h-11 rounded-xl bg-clay-tint text-clay inline-flex items-center justify-center">
                <Globe className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-ink">
                دامنه شخصی با گواهی SSL خودکار
              </h3>
              <p className="text-sm leading-[1.8] text-ink-secondary">
                تنها با تنظیم یک رکورد CNAME، پروفایل، وبلاگ و مسیر رزرو روی دامنه اختصاصی خودتان فعال می‌شود؛ در حالی که ورود مراجع و کوکی‌ها کاملاً یکپارچه باقی می‌مانند.
              </p>
            </article>

            <article className="bg-surface border border-border rounded-2xl p-6 space-y-3">
              <span className="w-11 h-11 rounded-xl bg-accent-tint text-accent inline-flex items-center justify-center">
                <CalendarClock className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-ink">
                خداحافظی با ویجت‌های معیوب راست‌به‌چپ
              </h3>
              <p className="text-sm leading-[1.8] text-ink-secondary">
                تقویم خالص جلالی شنبه-آغاز برای داخل ایران، تقویم خالص میلادی به همراه تبدیل ساعت تهران برای مهاجران و ورودی موبایل بدون تداخل آیکون و پیش‌شماره.
              </p>
            </article>

            <article className="bg-surface border border-border rounded-2xl p-6 space-y-3">
              <span className="w-11 h-11 rounded-xl bg-status-confirmed-bg text-status-confirmed-ink inline-flex items-center justify-center">
                <FileSearch className="w-5 h-5" aria-hidden="true" />
              </span>
              <h3 className="text-lg font-bold text-ink">
                قفل ۱۵ دقیقه‌ای و بررسی بزرگ‌نمایی رسید
              </h3>
              <p className="text-sm leading-[1.8] text-ink-secondary">
                شماره کارت و اطلاعات حساب تنها پس از تایید کد یک‌بارمصرف نمایش داده می‌شود. رسیدهای ارسالی با ابزار بزرگ‌نمایی ۲۰۰٪ و چرخش ۹۰° بررسی و با یک کلیک تایید یا رد می‌شوند.
              </p>
            </article>
          </div>
        </section>

        {/* Comparison Summary Band */}
        <section className="bg-accent-deep text-canvas py-12">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <h2 className="text-xl sm:text-2xl font-bold">
                آماده بررسی تجربه واقعی پنل درمانگر و پروفایل عمومی هستید؟
              </h2>
              <ul className="space-y-2 text-sm text-canvas/90">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-clay shrink-0" aria-hidden="true" />
                  <span>برنامه هفتگی شنبه تا جمعه + تعریف مرخصی روزانه جلالی</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-clay shrink-0" aria-hidden="true" />
                  <span>مدیریت حساب‌های کارت‌به‌کارت، شبا، PayPal، IBAN و USDT</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-clay shrink-0" aria-hidden="true" />
                  <span>ویرایشگر مقاله وبلاگ سئو با پیش‌نمایش راست‌به‌چپ</span>
                </li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <Link
                href="/dashboard"
                className="min-h-[48px] inline-flex items-center justify-center px-6 rounded-xl bg-surface text-ink text-base font-semibold hover:bg-subtle transition-colors"
              >
                ورود به پیش‌نمایش پنل
              </Link>
              <Link
                href="/dr-sara-ahmadi"
                className="min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl border border-white/30 text-canvas text-base font-medium hover:bg-white/10 transition-colors"
              >
                نمونه پروفایل
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="bg-subtle/70 border-t border-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs sm:text-sm text-ink-muted">
          <span>روان‌نما — زیرساخت حرفه‌ای حضور آنلاین درمانگران</span>
          <div className="flex items-center gap-4">
            <Link href="/" className="min-h-[44px] inline-flex items-center text-ink-secondary hover:text-accent">
              بازگشت به صفحه مراجعان
            </Link>
            <Link href="/therapists" className="min-h-[44px] inline-flex items-center text-ink-secondary hover:text-accent">
              فهرست درمانگران
            </Link>
          </div>
        </div>
      </footer>
    </>
  );
}
