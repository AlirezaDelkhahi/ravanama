import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";
  const host = headerStore.get("host") ?? "ravannama.ir";
  const rawProto = headerStore.get("x-forwarded-proto") ?? "";
  const proto = rawProto.split(",")[0]?.trim().toLowerCase() === "http" ? "http" : "https";
  const origin = `${proto}://${host}`;
  const sitemapPath = buildTenantHref("/sitemap.xml", { mode, slug });

  const body = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /book",
    "Disallow: /*/book",
    "Disallow: /my-sessions",
    "Disallow: /dashboard",
    `Sitemap: ${origin}${sitemapPath}`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
