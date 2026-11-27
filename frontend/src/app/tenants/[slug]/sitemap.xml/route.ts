import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildSitemapXml, buildTenantSeoHeaders } from "@/lib/seo";
import { fetchTherapistCatalog } from "@/lib/server-api";
import type { TenantMode } from "@/lib/tenant-href";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const therapist = await fetchTherapistCatalog(slug);
  const publishedPostSlugs = (therapist?.blogPosts ?? [])
    .filter((p) => p.status === "published")
    .map((p) => p.slug);

  const xml = buildSitemapXml({
    slug,
    mode,
    hostHeader: headerStore.get("host"),
    protoHeader: headerStore.get("x-forwarded-proto"),
    publishedPostSlugs,
  });

  return new NextResponse(xml, {
    status: 200,
    headers: buildTenantSeoHeaders("application/xml; charset=utf-8"),
  });
}
