import type { Metadata } from "next";
import { TherapistsDirectoryClient } from "@/components/directory/TherapistsDirectoryClient";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { fetchDirectoryTherapists } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "فهرست درمانگران روان‌نما",
  description:
    "جستجو و انتخاب روانشناس و درمانگر متخصص دارای پروانه رسمی برای جلسات آنلاین داخل ایران و خارج از کشور",
};

interface TherapistsDirectoryPageProps {
  searchParams: Promise<{ topic?: string }>;
}

export default async function TherapistsDirectoryPage({
  searchParams,
}: TherapistsDirectoryPageProps) {
  const { topic } = await searchParams;
  const therapists = await fetchDirectoryTherapists();

  return (
    <>
      <SiteHeader variant="platform" activeNav="therapists" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12 space-y-6">
        <header className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-ink">
            فهرست درمانگران روان‌نما
          </h1>
          <p className="text-sm sm:text-base text-ink-secondary leading-[1.7]">
            متخصصانی که نمایش عمومی در فهرست روان‌نما را فعال کرده‌اند؛ برای مشاهده سوابق کامل، مقالات آموزشی و زمان‌های آزاد وارد صفحه هر درمانگر شوید.
          </p>
        </header>

        <TherapistsDirectoryClient
          therapists={therapists}
          initialTopic={topic}
        />
      </main>

      <SiteFooter />
    </>
  );
}
