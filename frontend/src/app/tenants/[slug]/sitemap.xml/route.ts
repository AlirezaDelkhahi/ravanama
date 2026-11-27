import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildTenantHref, type TenantMode } from "@/lib/tenant-href";

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

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

  const urls = [
    `${origin}${buildTenantHref("/", { mode, slug })}`,
    `${origin}${buildTenantHref("/blog", { mode, slug })}`,
  ];

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
