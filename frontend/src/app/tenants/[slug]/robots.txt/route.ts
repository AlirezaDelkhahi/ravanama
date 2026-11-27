import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { buildRobotsTxt, buildTenantSeoHeaders } from "@/lib/seo";
import type { TenantMode } from "@/lib/tenant-href";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const headerStore = await headers();
  const mode: TenantMode =
    headerStore.get("x-tenant-mode") === "custom" ? "custom" : "platform";

  const body = buildRobotsTxt({
    slug,
    mode,
    hostHeader: headerStore.get("host"),
    protoHeader: headerStore.get("x-forwarded-proto"),
  });

  return new NextResponse(body, {
    status: 200,
    headers: buildTenantSeoHeaders("text/plain; charset=utf-8"),
  });
}
