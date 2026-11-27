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
  "/images",
  "/favicon.ico",
  "/my-sessions",
  "/dashboard",
  "/therapists",
  "/for-therapists",
];

const RESERVED_SLUGS = new Set([
  "api",
  "www",
  "app",
  "admin",
  "dashboard",
  "my-sessions",
  "therapists",
  "for-therapists",
  "tenants",
  "fonts",
  "images",
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
const CUSTOM_DOMAIN_CACHE_TTL_MS = 60_000;
const CUSTOM_DOMAIN_TIMEOUT_MS = 2_000;

const customDomainCache = new Map<
  string,
  { slug: string | null; expiresAt: number }
>();

function isBypassPath(pathname: string): boolean {
  return BYPASS_EXACT_OR_PREFIX.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Resolves a verified custom hostname to its therapist slug via the Go API,
 * using a 60s in-memory cache and a 2s abort timeout (fail-safe to null).
 */
async function resolveCustomDomainSlug(hostname: string): Promise<string | null> {
  const normalized = hostname.trim().toLowerCase();
  if (!normalized) return null;

  const now = Date.now();
  const cached = customDomainCache.get(normalized);
  if (cached && cached.expiresAt > now) {
    return cached.slug;
  }

  const base = (
    process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8080"
  ).replace(/\/+$/, "");
  const url = `${base}/api/v1/tenants/resolve?host=${encodeURIComponent(normalized)}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CUSTOM_DOMAIN_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });

    if (!response.ok) {
      customDomainCache.set(normalized, {
        slug: null,
        expiresAt: now + CUSTOM_DOMAIN_CACHE_TTL_MS,
      });
      return null;
    }

    const payload = (await response.json().catch(() => null)) as {
      slug?: unknown;
    } | null;
    const slug =
      typeof payload?.slug === "string" &&
      SLUG_REGEX.test(payload.slug) &&
      !RESERVED_SLUGS.has(payload.slug)
        ? payload.slug
        : null;

    customDomainCache.set(normalized, {
      slug,
      expiresAt: now + CUSTOM_DOMAIN_CACHE_TTL_MS,
    });
    return slug;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
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
      const rewriteUrl = new URL(
        `/tenants/${candidateSlug}${restPath}${request.nextUrl.search}`,
        request.url,
      );

      const requestHeaders = new Headers(request.headers);
      requestHeaders.set("x-tenant-mode", "platform");
      requestHeaders.set("x-tenant-slug", candidateSlug);

      return NextResponse.rewrite(rewriteUrl, {
        request: { headers: requestHeaders },
      });
    }

    return NextResponse.next();
  }

  // Custom domain host flow.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-tenant-mode", "custom");

  const customSlug = await resolveCustomDomainSlug(hostname);
  if (customSlug) {
    requestHeaders.set("x-tenant-slug", customSlug);
    const rewritePath = pathname === "/" ? "" : pathname;
    const rewriteUrl = new URL(
      `/tenants/${customSlug}${rewritePath}${request.nextUrl.search}`,
      request.url,
    );
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
