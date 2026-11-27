import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Globe,
  Lock,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Video,
} from "lucide-react";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { formatCurrency, toPersianDigits } from "@/lib/jalali";
import { getDirectoryTherapists, getTherapistBySlug } from "@/lib/mock-data";

const QUICK_TOPIC_PILLS = [
  { label: "اضطراب و استرس", topic: "اضطراب" },
  { label: "زوج‌درمانی", topic: "زوج‌درمانی" },
  { label: "مهاجرت و غربت", topic: "مهاجرت" },
  { label: "افسردگی", topic: "افسردگی" },
  { label: "طرحواره‌درمانی", topic: "طرحواره‌درمانی" },
] as const;

const FAQ_ITEMS = [
  {
    question: "آیا پیش از انتخاب زمان باید حساب کاربری و رمز عبور بسازم؟",
    answer:
      "خیر؛ برای دیدن زمان‌های آزاد و انتخاب جلسه نیازی به ثبت‌نام قبلی نیست. تنها پس از انتخاب زمان، کد تایید ۶ رقمی به موبایل یا ایمیل شما ارسال می‌شود تا نوبت به مدت ۱۵ دقیقه به نام شما قفل بماند.",
  },
  {
    question: "تفاوت مسیر داخل ایران و خارج از کشور در چیست؟",
    answer:
      "در مسیر داخل ایران، تقویم کاملاً جلالی (شروع هفته از شنبه) با ساعت رسمی تهران و پرداخت ریالی کارت‌به‌کارت یا شبا نمایش داده می‌شود. در مسیر خارج از کشور، تقویم میلادی با تبدیل خودکار منطقه زمانی محل سکونت شما (به همراه معادل ساعت تهران) و روش‌های PayPal، IBAN و USDT فعال است.",
  },
  {
    question: "لینک ورود به جلسه آنلاین چه زمانی فعال می‌شود؟",
    answer:
      "پس از بارگذاری تصویر رسید (JPG، PNG یا WEBP)، درمانگر رسید را بررسی و تایید می‌کند. بلافاصله پس از تایید، لینک اختصاصی جلسه (Google Meet یا Skyroom) در بخش «پیگیری نوبت» فعال شده و از طریق تقویم (.ics) قابل ذخیره است.",
  },
  {
    question: "اگر تصویر رسید ناخوانا باشد یا رد شود چه اتفاقی می‌افتد؟",
    answer:
      "درمانگر دلیل دقیق را ثبت می‌کند و همان لحظه در پورتال «پیگیری نوبت» با یک کلیک «رزرو و آپلود مجدد»، تمام اطلاعات قبلی شما حفظ می‌شود تا سریع‌ترین زمان آزاد را انتخاب و رسید اصلاح‌شده را ارسال کنید.",
  },
] as const;

export default function PlatformHomePage() {
  const directoryTherapists = getDirectoryTherapists();
  const sara = getTherapistBySlug("dr-sara-ahmadi");
  const journalPosts = (sara?.blogPosts ?? [])
    .filter((p) => p.status === "published")
    .slice(0, 3);

  return (
    <>
      <SiteHeader variant="platform" activeNav="home" />

      <main>
        {/* 1. Split Visual Hero with Warm Botanical Arch Ornament */}
        <section className="relative overflow-hidden border-b border-border bg-canvas">
          <svg
            className="pointer-events-none absolute -top-12 -end-24 w-[420px] h-[420px] text-sand/70"
            viewBox="0 0 400 400"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M60 390V170C60 92.68 122.68 30 200 30C277.32 30 340 92.68 340 170V390"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M100 390V182C100 126.77 144.77 82 200 82C255.23 82 300 126.77 300 182V390"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeDasharray="6 6"
            />
          </svg>

          <div className="relative max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 lg:py-16">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
              {/* Hero Text Column */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 rounded-full bg-accent-tint border border-border px-3.5 py-1.5 text-xs sm:text-sm font-medium text-accent">
                  <Sparkles className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span>جلسات آنلاین محرمانه با روان‌شناسان دارای پروانه</span>
                </div>

                <h1 className="text-[26px] sm:text-[36px] font-bold leading-[1.4] text-ink">
                  آرامشِ گفت‌وگویی امن، با درمانگر تاییدشده — از هر کجای دنیا
                </h1>

                <p className="text-base sm:text-[17px] leading-[1.8] text-ink-secondary max-w-2xl">
                  متخصص مناسب خود را بر اساس رویکرد درمانی و سوابق واقعی انتخاب کنید؛ زمان جلسه را بدون ثبت‌نام قبلی روی تقویم جلالی یا میلادی با ساعت محلی قفل کنید و با آرامش خاطر گفت‌وگو را آغاز نمایید.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <Link
                    href="/therapists"
                    className="min-h-[48px] inline-flex items-center justify-center gap-2 px-6 rounded-xl bg-accent text-white text-base font-medium hover:bg-accent-hover transition-colors"
                  >
                    <span>یافتن درمانگر مناسب</span>
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                  </Link>
                  <a
                    href="#how-it-works"
                    className="min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl border border-border-strong bg-surface text-ink text-base font-medium hover:bg-subtle transition-colors"
                  >
                    چطور کار می‌کند؟
                  </a>
                </div>

                {/* Interactive Quick-Topic Shortcut Pills */}
                <div className="space-y-2.5 pt-1">
                  <span className="block text-xs sm:text-sm font-medium text-ink-muted">
                    شروع سریع بر اساس دغدغه شما:
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_TOPIC_PILLS.map((item) => (
                      <Link
                        key={item.topic}
                        href={`/therapists?topic=${encodeURIComponent(item.topic)}`}
                        className="min-h-[44px] inline-flex items-center px-3.5 py-2 rounded-full bg-surface border border-border text-xs sm:text-sm font-medium text-ink-secondary hover:border-accent hover:bg-accent-tint hover:text-accent transition-colors"
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>

              {/* Hero Image Column */}
              <div className="lg:col-span-5 space-y-3">
                <div className="rounded-2xl border border-border bg-surface p-2 sm:p-2.5">
                  <div className="relative aspect-[4/3] sm:aspect-[5/4] overflow-hidden rounded-xl bg-subtle">
                    <Image
                      src="/images/hero-sanctuary.jpg"
                      alt="فضای آرام و صمیمی جلسه مشاوره آنلاین در روان‌نما"
                      fill
                      priority
                      sizes="(max-width: 1024px) 100vw, 420px"
                      className="object-cover"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl border border-border bg-surface px-2.5 py-2.5 space-y-0.5">
                    <Lock className="w-4 h-4 text-accent mx-auto" aria-hidden="true" />
                    <span className="block text-[11px] sm:text-xs font-medium text-ink">
                      ۱۰۰٪ آنلاین و محرمانه
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface px-2.5 py-2.5 space-y-0.5">
                    <ShieldCheck className="w-4 h-4 text-accent mx-auto" aria-hidden="true" />
                    <span className="block text-[11px] sm:text-xs font-medium text-ink">
                      پروانه سازمان نظام
                    </span>
                  </div>
                  <div className="rounded-xl border border-border bg-surface px-2.5 py-2.5 space-y-0.5">
                    <Calendar className="w-4 h-4 text-clay mx-auto" aria-hidden="true" />
                    <span className="block text-[11px] sm:text-xs font-medium text-ink">
                      تقویم جلالی و میلادی
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. 4-Item Trust & Credibility Proof Strip */}
        <section className="bg-subtle/70 border-b border-border">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-surface border border-border inline-flex items-center justify-center shrink-0 text-accent">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">پروانه رسمی نظام روانشناسی</h2>
                <p className="text-xs text-ink-muted leading-relaxed">
                  احراز هویت و درج شماره پروانه هر درمانگر
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-surface border border-border inline-flex items-center justify-center shrink-0 text-accent">
                <Globe className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">ایران و ایرانیان خارج از کشور</h2>
                <p className="text-xs text-ink-muted leading-relaxed">
                  پشتیبانی دقیق ساعت محلی و نرخ ریالی/ارزی
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-surface border border-border inline-flex items-center justify-center shrink-0 text-clay">
                <Clock className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">قفل ۱۵ دقیقه‌ای نوبت</h2>
                <p className="text-xs text-ink-muted leading-relaxed">
                  جلوگیری از رزرو هم‌زمان هنگام واریز وجه
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <span className="w-10 h-10 rounded-xl bg-surface border border-border inline-flex items-center justify-center shrink-0 text-accent">
                <Lock className="w-5 h-5" aria-hidden="true" />
              </span>
              <div className="space-y-0.5">
                <h2 className="text-sm font-bold text-ink">بدون ثبت‌نام اجباری</h2>
                <p className="text-xs text-ink-muted leading-relaxed">
                  انتخاب مستقیم زمان و تایید سریع یک‌بارمصرف
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. 3-Step Visual "چطور نوبت بگیرید؟" Flow */}
        <section
          id="how-it-works"
          className="max-w-5xl mx-auto px-4 sm:px-6 py-10 lg:py-16 space-y-8"
        >
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs sm:text-sm font-semibold text-accent">
              ساده، شفاف و بدون اتلاف وقت
            </span>
            <h2 className="text-2xl sm:text-3xl font-bold text-ink">
              چطور در ۳ قدم نوبت آنلاین خود را قطعی کنید؟
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <article className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="w-11 h-11 rounded-xl bg-accent-tint text-accent inline-flex items-center justify-center">
                  <Calendar className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold text-ink-muted tabular-nums">
                  گام ۱
                </span>
              </div>
              <h3 className="text-lg font-bold text-ink">
                انتخاب درمانگر و تقویم مناسب
              </h3>
              <p className="text-sm leading-[1.75] text-ink-secondary">
                نوع جلسه فردی یا زوج‌درمانی را انتخاب کنید و زمان آزاد را روی تقویم جلالی (داخل ایران) یا تقویم میلادی با ساعت محلی خودتان ببینید.
              </p>
            </article>

            <article className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="w-11 h-11 rounded-xl bg-clay-tint text-clay inline-flex items-center justify-center">
                  <Smartphone className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold text-ink-muted tabular-nums">
                  گام ۲
                </span>
              </div>
              <h3 className="text-lg font-bold text-ink">
                تایید کد یک‌بارمصرف و ارسال رسید
              </h3>
              <p className="text-sm leading-[1.75] text-ink-secondary">
                بدون ساخت حساب قبلی، شماره یا ایمیل خود را تایید کنید تا زمان جلسه ۱۵ دقیقه قفل شود؛ سپس مبلغ را واریز و تصویر رسید را بارگذاری نمایید.
              </p>
            </article>

            <article className="bg-surface border border-border rounded-2xl p-5 sm:p-6 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="w-11 h-11 rounded-xl bg-status-confirmed-bg text-status-confirmed-ink inline-flex items-center justify-center">
                  <Video className="w-5 h-5" aria-hidden="true" />
                </span>
                <span className="text-sm font-bold text-ink-muted tabular-nums">
                  گام ۳
                </span>
              </div>
              <h3 className="text-lg font-bold text-ink">
                تایید درمانگر و دریافت لینک جلسه
              </h3>
              <p className="text-sm leading-[1.75] text-ink-secondary">
                بلافاصله پس از بررسی رسید توسط درمانگر، لینک اختصاصی و محرمانه اتاق ویدیویی در بخش «پیگیری نوبت» فعال می‌شود.
              </p>
            </article>
          </div>
        </section>

        {/* 4. Deep Botanical Teal Dual-Track Showcase Band */}
        <section className="bg-accent-deep text-canvas py-12 lg:py-16">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="space-y-2 max-w-2xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-canvas">
                <Globe className="w-3.5 h-3.5" aria-hidden="true" />
                <span>تجربه‌ای دقیق برای دو مسیر</span>
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold leading-[1.4]">
                هماهنگ با تقویم و روش پرداخت شما؛ در ایران یا خارج از کشور
              </h2>
              <p className="text-sm sm:text-base text-canvas/85 leading-[1.8]">
                دیگر نیازی به تبدیل دستی اختلاف ساعت یا سردرگمی میان تاریخ‌های جلالی و میلادی نیست.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="rounded-2xl bg-white/8 border border-white/15 p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-10 h-10 rounded-xl bg-white/15 inline-flex items-center justify-center text-canvas">
                    <MapPin className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">مراجعان داخل ایران</h3>
                    <span className="text-xs text-canvas/75">
                      پرداخت ریالی · ساعت رسمی تهران
                    </span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-canvas/90">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>تقویم خالص جلالی با شروع هفته از شنبه (ش ی د س چ پ ج)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>نمایش شفاف شماره کارت و شبا با دکمه کپی یک‌کلیکی</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>تعرفه‌ها به تومان و تایید کد یک‌بارمصرف پیامکی</span>
                  </li>
                </ul>
              </div>

              <div className="rounded-2xl bg-white/8 border border-white/15 p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <span className="w-10 h-10 rounded-xl bg-white/15 inline-flex items-center justify-center text-canvas">
                    <Globe className="w-5 h-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h3 className="text-lg font-bold">ایرانیان خارج از کشور</h3>
                    <span className="text-xs text-canvas/75">
                      پرداخت ارزی · تبدیل خودکار منطقه زمانی
                    </span>
                  </div>
                </div>
                <ul className="space-y-2.5 text-sm text-canvas/90">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>تقویم خالص میلادی با تشخیص خودکار منطقه زمانی (IANA)</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>نمایش هم‌زمان ساعت محلی شما و معادل ساعت تهران روی هر اسلات</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 text-clay" aria-hidden="true" />
                    <span>پشتیبانی از PayPal، IBAN و USDT به همراه کد مرجع محرمانه</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* 5. Featured Verified Therapists Grid */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="space-y-1.5">
              <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                درمانگران برگزیده روان‌نما
              </h2>
              <p className="text-sm sm:text-base text-ink-secondary">
                متخصصان دارای پروانه رسمی سازمان نظام روانشناسی و مشاوره
              </p>
            </div>
            <Link
              href="/therapists"
              className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
            >
              <span>مشاهده همه درمانگران</span>
              <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {directoryTherapists.map((therapist) => {
              const iranOffer = therapist.offerings.find((o) => o.track === "iran");
              const abroadOffer = therapist.offerings.find(
                (o) => o.track === "abroad",
              );

              return (
                <article
                  key={therapist.id}
                  className="bg-surface border border-border rounded-2xl p-5 flex flex-col justify-between gap-5"
                >
                  <div className="space-y-4">
                    <div className="flex items-center gap-3.5">
                      <Image
                        src={therapist.avatarUrl}
                        alt={therapist.displayName}
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-full object-cover border border-border shrink-0"
                      />
                      <div className="min-w-0 space-y-1">
                        <h3 className="text-base sm:text-lg font-bold text-ink truncate">
                          {therapist.displayName}
                        </h3>
                        <p className="text-xs sm:text-sm text-ink-secondary line-clamp-2">
                          {therapist.subtitle}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs text-accent font-medium">
                      <span className="inline-flex items-center gap-1 rounded-full bg-accent-tint px-2.5 py-1 tabular-nums">
                        <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                        <span>پروانه {therapist.licenseNumber}</span>
                      </span>
                      <span className="text-ink-muted tabular-nums">
                        {toPersianDigits(therapist.experienceYears)} سال سابقه
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {therapist.focusAreas.slice(0, 3).map((area) => (
                        <span
                          key={area}
                          className="rounded-full bg-subtle border border-border px-2.5 py-1 text-xs text-ink-secondary"
                        >
                          {area}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-4 border-t border-border">
                    <div className="flex items-center justify-between gap-2 text-xs text-ink-secondary">
                      {iranOffer ? (
                        <span className="tabular-nums">
                          ایران:{" "}
                          <strong className="text-ink">
                            {formatCurrency(
                              iranOffer.priceAmount,
                              iranOffer.currency,
                            )}
                          </strong>
                        </span>
                      ) : null}
                      {abroadOffer ? (
                        <span className="tabular-nums">
                          خارج:{" "}
                          <strong dir="ltr" className="text-ink">
                            {formatCurrency(
                              abroadOffer.priceAmount,
                              abroadOffer.currency,
                            )}
                          </strong>
                        </span>
                      ) : null}
                    </div>

                    <div className="flex gap-2">
                      <Link
                        href={`/${therapist.slug}`}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center px-3 rounded-xl border border-border-strong bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle transition-colors"
                      >
                        مشاهده پروفایل
                      </Link>
                      <Link
                        href={`/${therapist.slug}/book`}
                        className="flex-1 min-h-[44px] inline-flex items-center justify-center px-3 rounded-xl bg-accent text-white text-xs sm:text-sm font-medium hover:bg-accent-hover transition-colors"
                      >
                        رزرو جلسه
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {/* 6. Editorial Journal / Guides Strip */}
        {journalPosts.length > 0 && sara ? (
          <section className="bg-subtle/60 border-y border-border py-12 lg:py-16">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 space-y-6">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-1.5">
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-clay">
                    <BookOpen className="w-4 h-4" aria-hidden="true" />
                    <span>مجله تخصصی روان‌شناسی</span>
                  </span>
                  <h2 className="text-2xl sm:text-3xl font-bold text-ink">
                    راهنماها و یادداشت‌های علمی
                  </h2>
                </div>
                <Link
                  href={`/${sara.slug}/blog`}
                  className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-semibold text-accent hover:text-accent-hover"
                >
                  <span>مشاهده همه مقالات</span>
                  <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                </Link>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                {journalPosts.map((post) => (
                  <article
                    key={post.slug}
                    className="bg-surface border border-border rounded-2xl overflow-hidden flex flex-col justify-between"
                  >
                    <div>
                      <div className="relative aspect-[16/9] bg-subtle border-b border-border overflow-hidden">
                        <Image
                          src={post.coverImageUrl}
                          alt={post.title}
                          fill
                          sizes="(max-width: 768px) 100vw, 340px"
                          className="object-cover"
                        />
                      </div>
                      <div className="p-5 space-y-2.5">
                        <div className="flex items-center gap-2 text-xs text-ink-muted tabular-nums">
                          <span>{post.publishedAtJalali}</span>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{toPersianDigits(post.readingMinutes)} دقیقه</span>
                          </span>
                        </div>
                        <h3 className="text-base font-bold leading-[1.5] text-ink line-clamp-2">
                          <Link
                            href={`/${sara.slug}/blog/${post.slug}`}
                            className="hover:text-accent transition-colors"
                          >
                            {post.title}
                          </Link>
                        </h3>
                        <p className="text-sm leading-[1.7] text-ink-secondary line-clamp-3">
                          {post.excerpt}
                        </p>
                      </div>
                    </div>

                    <div className="px-5 pb-4">
                      <Link
                        href={`/${sara.slug}/blog/${post.slug}`}
                        className="min-h-[44px] inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:text-accent-hover"
                      >
                        <span>مطالعه مقاله</span>
                        <ArrowRight className="w-4 h-4 rtl:rotate-180" aria-hidden="true" />
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {/* 7. Client FAQ + Subtle Therapist Callout */}
        <section className="max-w-5xl mx-auto px-4 sm:px-6 py-12 lg:py-16 space-y-10">
          <div className="space-y-5 max-w-3xl mx-auto">
            <h2 className="text-2xl font-bold text-ink text-center">
              پرسش‌های متداول مراجعان
            </h2>

            <div className="space-y-3">
              {FAQ_ITEMS.map((item) => (
                <details
                  key={item.question}
                  className="group bg-surface border border-border rounded-2xl overflow-hidden"
                >
                  <summary className="min-h-[52px] px-5 py-3.5 flex items-center justify-between gap-3 cursor-pointer text-sm sm:text-base font-semibold text-ink list-none">
                    <span>{item.question}</span>
                    <ChevronDown
                      className="w-4 h-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
                      aria-hidden="true"
                    />
                  </summary>
                  <div className="px-5 pb-4 pt-1 border-t border-border text-sm leading-[1.8] text-ink-secondary">
                    {item.answer}
                  </div>
                </details>
              ))}
            </div>
          </div>

          {/* Subtle Therapist Callout Banner */}
          <div className="rounded-2xl bg-clay-tint border border-border p-5 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5 max-w-2xl">
              <span className="text-xs font-semibold text-clay">ویژه متخصصان و کلینیک‌ها</span>
              <h2 className="text-lg sm:text-xl font-bold text-ink">
                درمانگر یا کلینیک روان‌شناسی هستید؟
              </h2>
              <p className="text-sm text-ink-secondary leading-[1.75]">
                با صفحه اختصاصی روان‌نما، نوبت‌های ایران و خارج از کشور را روی دامنه شخصی خود و بدون نمایش رقبا مدیریت کنید.
              </p>
            </div>
            <Link
              href="/for-therapists"
              className="shrink-0 min-h-[48px] inline-flex items-center justify-center px-5 rounded-xl bg-surface border border-border-strong text-ink text-sm sm:text-base font-medium hover:bg-subtle transition-colors"
            >
              آشنایی با روان‌نما برای درمانگران
            </Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </>
  );
}
