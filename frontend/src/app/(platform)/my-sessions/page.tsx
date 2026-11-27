import type { Metadata } from "next";
import { MySessionsClient } from "@/components/portal/MySessionsClient";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";

export const metadata: Metadata = {
  title: "پیگیری نوبت‌ها",
  description:
    "پورتال مراجع روان‌نما برای مشاهده وضعیت رزرو، دریافت لینک جلسه آنلاین و اصلاح رسیدهای نیازمند بررسی",
};

export default function MySessionsPage() {
  return (
    <>
      <SiteHeader variant="platform" activeNav="my-sessions" />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <MySessionsClient />
      </main>

      <SiteFooter />
    </>
  );
}
