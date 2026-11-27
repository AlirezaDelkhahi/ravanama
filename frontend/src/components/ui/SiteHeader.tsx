import Link from "next/link";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export interface PlatformHeaderProps {
  variant: "platform";
  activeNav?: "home" | "therapists" | "my-sessions";
}

export interface TenantHeaderProps {
  variant: "tenant";
  slug: string;
  mode: TenantMode;
  therapistName: string;
  activeNav?: "profile" | "blog" | "book";
}

export interface DashboardHeaderProps {
  variant: "dashboard";
  therapistName: string;
  therapistSlug: string;
}

export type SiteHeaderProps =
  | PlatformHeaderProps
  | TenantHeaderProps
  | DashboardHeaderProps;

export function BrandLogoMark() {
  return (
    <svg
      className="w-8 h-8 shrink-0"
      viewBox="0 0 36 36"
      fill="none"
      aria-hidden="true"
    >
      <rect width="36" height="36" rx="10" fill="#2D6A62" />
      <path
        d="M11 26V16.5C11 12.3579 14.134 9 18 9C21.866 9 25 12.3579 25 16.5V26"
        stroke="#FAF8F5"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M18 24.5V15.5M18 19.5C15.8 19.5 14.5 18 14.5 16.2M18 18C20.2 18 21.5 16.5 21.5 14.7"
        stroke="#C97A5B"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SiteHeader(props: SiteHeaderProps) {
  if (props.variant === "tenant") {
    const profileHref = buildTenantHref("/", { mode: props.mode, slug: props.slug });
    const blogHref = buildTenantHref("/blog", { mode: props.mode, slug: props.slug });
    const bookHref = buildTenantHref("/book", { mode: props.mode, slug: props.slug });

    return (
      <header className="sticky top-0 z-30 h-16 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-2 sm:gap-4">
          <Link
            href={profileHref}
            className="min-w-0 flex items-center gap-2 py-1 group"
          >
            <span className="truncate text-base sm:text-lg font-bold text-ink group-hover:text-accent transition-colors">
              {props.therapistName}
            </span>
            <span className="hidden sm:inline-flex shrink-0 items-center gap-1 rounded-full bg-accent-tint border border-border px-2.5 py-0.5 text-xs font-medium text-accent">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>نظام روانشناسی</span>
            </span>
          </Link>

          <nav
            aria-label="ناوبری صفحه درمانگر"
            className="shrink-0 flex items-center gap-1.5 sm:gap-2.5"
          >
            <Link
              href={blogHref}
              className={`min-h-[44px] inline-flex items-center px-2.5 sm:px-3.5 rounded-xl text-sm font-medium transition-colors ${
                props.activeNav === "blog"
                  ? "bg-accent-tint text-accent"
                  : "text-ink-secondary hover:bg-subtle hover:text-ink"
              }`}
            >
              وبلاگ
            </Link>
            <Link
              href="/my-sessions"
              className="min-h-[44px] inline-flex items-center px-2.5 sm:px-3.5 rounded-xl border border-border bg-surface text-ink text-sm font-medium hover:bg-subtle transition-colors"
            >
              پیگیری نوبت
            </Link>
            <Link
              href={bookHref}
              className="hidden sm:inline-flex min-h-[44px] items-center px-4 rounded-xl bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors"
            >
              رزرو جلسه
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  if (props.variant === "dashboard") {
    return (
      <header className="sticky top-0 z-30 h-16 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
          <div className="min-w-0 flex items-center gap-2 sm:gap-3">
            <Link href="/for-therapists" className="min-w-0 flex items-center gap-2">
              <BrandLogoMark />
              <span className="text-sm sm:text-base font-bold text-ink truncate">
                <span className="sm:hidden">پنل درمانگر</span>
                <span className="hidden sm:inline">پنل مدیریت درمانگر</span>
              </span>
            </Link>
            <span className="hidden md:inline-flex items-center gap-1.5 rounded-full bg-accent-tint border border-border px-3 py-1 text-xs font-medium text-accent">
              <ShieldCheck className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>{props.therapistName}</span>
            </span>
          </div>

          <nav
            aria-label="ناوبری پنل درمانگر"
            className="shrink-0 flex items-center gap-1.5 sm:gap-2.5"
          >
            <Link
              href="/for-therapists"
              className="min-h-[44px] inline-flex items-center px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-medium text-ink-secondary hover:bg-subtle hover:text-ink transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">معرفی</span>
              <span className="hidden sm:inline">صفحه معرفی درمانگران</span>
            </Link>
            <Link
              href={`/${props.therapistSlug}`}
              className="min-h-[44px] inline-flex items-center gap-1.5 px-2.5 sm:px-4 rounded-xl border border-border-strong bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle transition-colors whitespace-nowrap"
            >
              <span className="sm:hidden">صفحه عمومی</span>
              <span className="hidden sm:inline">مشاهده صفحه عمومی</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
            </Link>
          </nav>
        </div>
      </header>
    );
  }

  return (
    <header className="sticky top-0 z-30 h-16 bg-canvas/95 backdrop-blur border-b border-border">
      <div className="max-w-5xl mx-auto h-full px-3 sm:px-6 flex items-center justify-between gap-2 sm:gap-4 min-w-0">
        <Link href="/" className="shrink-0 flex items-center gap-2 py-1">
          <BrandLogoMark />
          <span className="text-base sm:text-lg font-bold text-ink">روان‌نما</span>
        </Link>

        <nav
          aria-label="ناوبری مراجعان روان‌نما"
          className="min-w-0 flex items-center gap-1.5 sm:gap-2.5"
        >
          <Link
            href="/#how-it-works"
            className="hidden sm:inline-flex min-h-[44px] items-center whitespace-nowrap px-3.5 rounded-xl text-sm font-medium text-ink-secondary hover:bg-subtle hover:text-ink transition-colors"
          >
            راهنمای رزرو
          </Link>
          <Link
            href="/my-sessions"
            className={`min-h-[44px] inline-flex items-center whitespace-nowrap px-2.5 sm:px-3.5 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
              props.activeNav === "my-sessions"
                ? "bg-accent-tint text-accent"
                : "border border-border bg-surface text-ink hover:bg-subtle"
            }`}
          >
            پیگیری نوبت
          </Link>
          <Link
            href="/therapists"
            className={`min-h-[44px] inline-flex items-center whitespace-nowrap px-3 sm:px-4 rounded-xl text-xs sm:text-sm font-medium transition-colors ${
              props.activeNav === "therapists"
                ? "bg-accent-hover text-white ring-2 ring-accent/25"
                : "bg-accent text-white hover:bg-accent-hover"
            }`}
          >
            یافتن درمانگر
          </Link>
        </nav>
      </div>
    </header>
  );
}
