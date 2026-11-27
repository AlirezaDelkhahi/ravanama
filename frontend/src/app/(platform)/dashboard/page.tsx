import type { Metadata } from "next";
import { TherapistDashboardClient } from "@/components/dashboard/TherapistDashboardClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "داشبورد درمانگر",
  description:
    "پنل مدیریت نوبت‌ها، تایید رسید واریز، تقویم هفتگی و ویرایشگر وبلاگ سئو در روان‌نما",
};

export default function TherapistDashboardPage() {
  return <TherapistDashboardClient />;
}
