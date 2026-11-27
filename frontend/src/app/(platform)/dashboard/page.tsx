import type { Metadata } from "next";
import { TherapistDashboardClient } from "@/components/dashboard/TherapistDashboardClient";
import { SiteHeader } from "@/components/ui/SiteHeader";
import {
  getDefaultCallJoinUrlForTherapist,
  getTherapistBySlug,
} from "@/lib/mock-data";

export const metadata: Metadata = {
  title: "داشبورد درمانگر",
  description:
    "پنل مدیریت نوبت‌ها، تایید رسید واریز، تقویم هفتگی و ویرایشگر وبلاگ سئو در روان‌نما",
};

export default function TherapistDashboardPage() {
  const therapist = getTherapistBySlug("dr-sara-ahmadi");

  if (!therapist) {
    return null;
  }

  return (
    <>
      <SiteHeader
        variant="dashboard"
        therapistName={therapist.displayName}
        therapistSlug={therapist.slug}
      />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 lg:py-12">
        <TherapistDashboardClient
          therapist={therapist}
          initialDefaultJoinUrl={getDefaultCallJoinUrlForTherapist(therapist.slug)}
        />
      </main>
    </>
  );
}
