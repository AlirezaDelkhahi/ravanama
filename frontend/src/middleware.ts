import { NextRequest, NextResponse } from "next/server";

const PLATFORM_HOSTS = new Set([
  "ravannama.ir",
  "www.ravannama.ir",
  "localhost",
  "127.0.0.1",
]);

const BYPASS_EXACT_OR_PREFIX = [
  "/_next",
  "/api",
  "/fonts",
  "/favicon.ico",
  "/my-sessions",
  "/dashboard",
  "/therapists",
];

const RESERVED_SLUGS = new Set([
  "api",
  "www",
  "app",
  "admin",
  "dashboard",
  "my-sessions",
  "therapists",
  "tenants",
  "fonts",
  "login",
  "logout",
  "auth",
  "blog",
  "assets",
  "static",
  "internal",
  "health",
  "sitemap",
  "robots",
]);

const SLUG_REGEX = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

function isBypassPath(pathname: string): boolean {
  return BYPASS_EXACT_OR_PREFIX.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Custom-domain host resolution hook.
 * Returns the mapped therapist slug for a verified custom domain in Milestone 3.
 */
async function resolveCustomDomainSlug(_hostname: string): Promise<string | null> {
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Block direct external access to internal App Router /tenants/* target.
  if (pathname === "/tenants" || pathname.startsWith("/tenants/")) {
    return new NextResponse("Not Found", { status: 404 });
  }

  if (isBypassPath(pathname)) {
    return NextResponse.next();
  }

  const hostHeader = request.headers.get("host") ?? "";
  const hostname = hostHeader.split(":")[0].toLowerCase().trim();

  if (PLATFORM_HOSTS.has(hostname) || hostname === "") {
    if (pathname === "/" || pathname === "/robots.txt" || pathname === "/sitemap.xml") {
      return NextResponse.next();
    }

    const segments = pathname.split("/").filter(Boolean);
    const candidateSlug = segments[0]?.toLowerCase() ?? "";

    if (SLUG_REGEX.test(candidateSlug) && !RESERVED_SLUGS.has(candidateSlug)) {
      const restPath = segments.length > 1 ? `/${segments.slice(1).join("/")}` : "";
      const rewriteUrl = request.nextUrl.clone();
      rewriteUrl.pathname = `/tenants/${candidateSlug}${restPath}`;

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-tenant-mode", "platform");
      requestHeaders.set("x-tenant-slug", candidateSlug);

      return NextResponse.rewrite(rewriteUrl, {
        request: { headers: requestHeaders },
      });
    }

    return NextResponse.next();
  }

  // Custom domain host flow (to be wired to backend resolution in Milestone 3).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-mode", "custom");

  const customSlug = await resolveCustomDomainSlug(hostname);
  if (customSlug) {
    requestHeaders.set("x-tenant-slug", customSlug);
    const rewriteUrl = request.nextUrl.clone();
    rewriteUrl.pathname = `/tenants/${customSlug}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(rewriteUrl, {
      request: { headers: requestHeaders },
    });
  }

  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
