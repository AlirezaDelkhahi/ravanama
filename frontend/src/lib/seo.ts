import { buildTenantHref, type TenantMode } from "./tenant-href";

export function buildTenantSeoHeaders(contentType: string): Record<string, string> {
  return {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=300",
    Vary: "Host",
  };
}

export function getCanonicalOrigin(
  customDomain: string | null | undefined,
  customDomainVerified: boolean,
  hostHeader: string | null,
  protoHeader: string | null,
): { origin: string; isCustomPrimary: boolean } {
  if (customDomainVerified && customDomain) {
    return { origin: `https://${customDomain}`, isCustomPrimary: true };
  }
  const host = (hostHeader ?? "ravannama.ir").trim() || "ravannama.ir";
  const rawProto = (protoHeader ?? "").split(",")[0]?.trim().toLowerCase();
  const proto = rawProto === "http" ? "http" : "https";
  return { origin: `${proto}://${host}`, isCustomPrimary: false };
}

export function buildTenantCanonicalUrl(opts: {
  path: string;
  slug: string;
  mode: TenantMode;
  customDomain: string | null | undefined;
  customDomainVerified: boolean;
  hostHeader: string | null;
  protoHeader: string | null;
}): string {
  const { origin, isCustomPrimary } = getCanonicalOrigin(
    opts.customDomain,
    opts.customDomainVerified,
    opts.hostHeader,
    opts.protoHeader,
  );
  const canonicalPath = buildTenantHref(opts.path, {
    mode: isCustomPrimary ? "custom" : opts.mode,
    slug: opts.slug,
  });
  return `${origin}${canonicalPath}`;
}

export function buildRobotsTxt(opts: {
  slug: string;
  mode: TenantMode;
  hostHeader: string | null;
  protoHeader: string | null;
}): string {
  const host = (opts.hostHeader ?? "ravannama.ir").trim() || "ravannama.ir";
  const rawProto = (opts.protoHeader ?? "").split(",")[0]?.trim().toLowerCase();
  const proto = rawProto === "http" ? "http" : "https";
  const origin = `${proto}://${host}`;
  const sitemapPath = buildTenantHref("/sitemap.xml", {
    mode: opts.mode,
    slug: opts.slug,
  });

  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /book",
    "Disallow: /*/book",
    "Disallow: /my-sessions",
    "Disallow: /dashboard",
    `Sitemap: ${origin}${sitemapPath}`,
    "",
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function buildSitemapXml(opts: {
  slug: string;
  mode: TenantMode;
  hostHeader: string | null;
  protoHeader: string | null;
  publishedPostSlugs: string[];
}): string {
  const host = (opts.hostHeader ?? "ravannama.ir").trim() || "ravannama.ir";
  const rawProto = (opts.protoHeader ?? "").split(",")[0]?.trim().toLowerCase();
  const proto = rawProto === "http" ? "http" : "https";
  const origin = `${proto}://${host}`;

  const postUrls = opts.publishedPostSlugs.map(
    (postSlug) =>
      `${origin}${buildTenantHref(`/blog/${postSlug}`, {
        mode: opts.mode,
        slug: opts.slug,
      })}`,
  );

  const urls = [
    `${origin}${buildTenantHref("/", { mode: opts.mode, slug: opts.slug })}`,
    `${origin}${buildTenantHref("/blog", { mode: opts.mode, slug: opts.slug })}`,
    ...postUrls,
  ];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map((loc) => `  <url><loc>${escapeXml(loc)}</loc></url>`),
    "</urlset>",
    "",
  ].join("\n");
}

export function buildTherapistJsonLd(input: {
  displayName: string;
  subtitle: string;
  bio: string;
  canonicalUrl: string;
}) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Person",
        name: input.displayName,
        jobTitle: input.subtitle,
        description: input.bio,
        url: input.canonicalUrl,
      },
      {
        "@type": "ProfessionalService",
        name: `${input.displayName} — مشاوره و روان‌درمانی آنلاین`,
        url: input.canonicalUrl,
        areaServed: ["IR", "Worldwide"],
        provider: {
          "@type": "Person",
          name: input.displayName,
        },
      },
    ],
  };
}

export function buildBlogPostJsonLd(input: {
  title: string;
  description: string;
  datePublished: string;
  canonicalUrl: string;
  authorName: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: input.title,
    description: input.description,
    datePublished: input.datePublished,
    mainEntityOfPage: input.canonicalUrl,
    author: {
      "@type": "Person",
      name: input.authorName,
    },
  };
}
