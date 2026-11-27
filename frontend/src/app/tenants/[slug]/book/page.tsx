import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { BookingWizard } from "@/components/booking/BookingWizard";
import { getTherapistBySlug } from "@/lib/mock-data";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export const dynamic = "force-dynamic";

interface TenantBookPageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rebook?: string }>;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const therapist = getTherapistBySlug(slug);
  if (!therapist) {
    return { title: "رزرو جلسه" };
  }
  return {
    title: `رزرو آنلاین جلسه با ${therapist.displayName}`,
    robots: { index: false, follow: false },
  };
}

export default async function TenantBookPage({
  params,
  searchParams,
}: TenantBookPageProps) {
  const { slug } = await params;
  const { rebook } = await searchParams;
  const therapist = getTherapistBySlug(slug);

  if (!therapist) {
    notFound();
  }

  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const profileHref = buildTenantHref("/", { mode, slug });

  return (
    <>
      <header className="sticky top-0 z-30 h-16 bg-canvas/95 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto h-full px-4 sm:px-6 flex items-center justify-between gap-3">
          <Link
            href={profileHref}
            className="min-h-[44px] inline-flex items-center gap-1.5 text-sm sm:text-base font-medium text-ink hover:text-accent transition-colors"
          >
            <ChevronLeft className="w-5 h-5 rtl:rotate-180 shrink-0" aria-hidden="true" />
            <span className="sm:hidden">پروفایل درمانگر</span>
            <span className="hidden sm:inline truncate">بازگشت به پروفایل {therapist.displayName}</span>
          </Link>

          <Link
            href="/my-sessions"
            className="shrink-0 min-h-[44px] inline-flex items-center px-3.5 rounded-xl border border-border bg-surface text-ink text-xs sm:text-sm font-medium hover:bg-subtle transition-colors"
          >
            پیگیری نوبت
          </Link>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-6 lg:py-10 space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl sm:text-2xl font-bold text-ink">
            رزرو آنلاین جلسه با {therapist.displayName}
          </h1>
          <p className="text-sm text-ink-secondary">{therapist.subtitle}</p>
        </div>

        <BookingWizard
          therapist={therapist}
          mode={mode}
          slug={slug}
          initialRebookId={rebook}
        />
      </main>
    </>
  );
}
