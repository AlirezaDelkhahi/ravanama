import type { Metadata } from "next";
import { vazirmatn } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "روان‌نما | پلتفرم تخصصی رزرو جلسات روان‌شناسی",
    template: "%s | روان‌نما",
  },
  description:
    "پلتفرم تخصصی رزرو آنلاین جلسات مشاوره و روان‌درمانی برای مراجعان داخل ایران و ایرانیان خارج از کشور",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-dvh bg-canvas text-ink font-sans antialiased overflow-x-clip">
        {children}
      </body>
    </html>
  );
}
