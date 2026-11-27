import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  buildBlogPostJsonLd,
  buildRobotsTxt,
  buildSitemapXml,
  buildTenantCanonicalUrl,
  buildTenantSeoHeaders,
  buildTherapistJsonLd,
} from "../lib/seo";
import { buildTenantHref } from "../lib/tenant-href";

test("buildTenantHref builds host-aware URLs for platform and custom domains", () => {
  assert.equal(
    buildTenantHref("/", { mode: "platform", slug: "dr-sara-ahmadi" }),
    "/dr-sara-ahmadi",
  );
  assert.equal(
    buildTenantHref("/book", { mode: "platform", slug: "dr-sara-ahmadi" }),
    "/dr-sara-ahmadi/book",
  );
  assert.equal(
    buildTenantHref("/blog/act-post", { mode: "platform", slug: "dr-sara-ahmadi" }),
    "/dr-sara-ahmadi/blog/act-post",
  );

  assert.equal(
    buildTenantHref("/", { mode: "custom", slug: "dr-sara-ahmadi" }),
    "/",
  );
  assert.equal(
    buildTenantHref("/book", { mode: "custom", slug: "dr-sara-ahmadi" }),
    "/book",
  );
  assert.equal(
    buildTenantHref("/blog/act-post", { mode: "custom", slug: "dr-sara-ahmadi" }),
    "/blog/act-post",
  );
});

test("buildTenantCanonicalUrl prefers verified primary custom domain over platform host", () => {
  const customCanonical = buildTenantCanonicalUrl({
    path: "/blog/act-post",
    slug: "dr-sara-ahmadi",
    mode: "platform",
    customDomain: "dr-sara.ir",
    customDomainVerified: true,
    hostHeader: "ravannama.ir",
    protoHeader: "https",
  });
  assert.equal(customCanonical, "https://dr-sara.ir/blog/act-post");

  const platformCanonical = buildTenantCanonicalUrl({
    path: "/blog/act-post",
    slug: "dr-sara-ahmadi",
    mode: "platform",
    customDomain: null,
    customDomainVerified: false,
    hostHeader: "ravannama.ir",
    protoHeader: "https",
  });
  assert.equal(platformCanonical, "https://ravannama.ir/dr-sara-ahmadi/blog/act-post");
});

test("buildRobotsTxt disallows private booking/portal/dashboard paths and includes host-aware sitemap", () => {
  const platformRobots = buildRobotsTxt({
    slug: "dr-sara-ahmadi",
    mode: "platform",
    hostHeader: "ravannama.ir",
    protoHeader: "https",
  });
  assert.ok(platformRobots.includes("Disallow: /book"));
  assert.ok(platformRobots.includes("Disallow: /*/book"));
  assert.ok(platformRobots.includes("Disallow: /my-sessions"));
  assert.ok(platformRobots.includes("Disallow: /dashboard"));
  assert.ok(
    platformRobots.includes("Sitemap: https://ravannama.ir/dr-sara-ahmadi/sitemap.xml"),
  );

  const customRobots = buildRobotsTxt({
    slug: "dr-sara-ahmadi",
    mode: "custom",
    hostHeader: "dr-sara.ir",
    protoHeader: "https",
  });
  assert.ok(customRobots.includes("Sitemap: https://dr-sara.ir/sitemap.xml"));
});

test("buildSitemapXml emits valid XML urlset with profile, blog, and published post URLs", () => {
  const xml = buildSitemapXml({
    slug: "dr-sara-ahmadi",
    mode: "custom",
    hostHeader: "dr-sara.ir",
    protoHeader: "https",
    publishedPostSlugs: ["act-for-daily-anxiety", "diaspora-belonging"],
  });

  assert.ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'));
  assert.ok(xml.includes("<loc>https://dr-sara.ir/</loc>"));
  assert.ok(xml.includes("<loc>https://dr-sara.ir/blog</loc>"));
  assert.ok(xml.includes("<loc>https://dr-sara.ir/blog/act-for-daily-anxiety</loc>"));
  assert.ok(xml.includes("<loc>https://dr-sara.ir/blog/diaspora-belonging</loc>"));
});

test("JSON-LD builders produce valid Person, ProfessionalService, and BlogPosting schemas", () => {
  const therapistLd = buildTherapistJsonLd({
    displayName: "دکتر سارا احمدی",
    subtitle: "روانشناس بالینی",
    bio: "تجربه بالینی",
    canonicalUrl: "https://dr-sara.ir/",
  });
  assert.equal(therapistLd["@context"], "https://schema.org");
  assert.equal(therapistLd["@graph"].length, 2);
  assert.equal(therapistLd["@graph"][0]?.["@type"], "Person");
  assert.equal(therapistLd["@graph"][1]?.["@type"], "ProfessionalService");
  assert.equal(therapistLd["@graph"][1]?.url, "https://dr-sara.ir/");

  const blogLd = buildBlogPostJsonLd({
    title: "مدیریت اضطراب",
    description: "راهنمای علمی",
    datePublished: "2026-11-25T09:00:00Z",
    canonicalUrl: "https://dr-sara.ir/blog/act-for-daily-anxiety",
    authorName: "دکتر سارا احمدی",
  });
  assert.equal(blogLd["@type"], "BlogPosting");
  assert.equal(blogLd.mainEntityOfPage, "https://dr-sara.ir/blog/act-for-daily-anxiety");
  assert.equal(blogLd.author.name, "دکتر سارا احمدی");
});

test("tenant robots.txt and sitemap.xml routes emit Vary: Host alongside Cache-Control", () => {
  const robotsHeaders = buildTenantSeoHeaders("text/plain; charset=utf-8");
  assert.equal(robotsHeaders["Content-Type"], "text/plain; charset=utf-8");
  assert.equal(robotsHeaders["Cache-Control"], "public, max-age=300");
  assert.equal(robotsHeaders.Vary, "Host");

  const sitemapHeaders = buildTenantSeoHeaders("application/xml; charset=utf-8");
  assert.equal(sitemapHeaders["Content-Type"], "application/xml; charset=utf-8");
  assert.equal(sitemapHeaders["Cache-Control"], "public, max-age=300");
  assert.equal(sitemapHeaders.Vary, "Host");

  const robotsRouteSrc = readFileSync(
    resolve(process.cwd(), "src/app/tenants/[slug]/robots.txt/route.ts"),
    "utf8",
  );
  const sitemapRouteSrc = readFileSync(
    resolve(process.cwd(), "src/app/tenants/[slug]/sitemap.xml/route.ts"),
    "utf8",
  );
  assert.ok(robotsRouteSrc.includes("buildTenantSeoHeaders"));
  assert.ok(sitemapRouteSrc.includes("buildTenantSeoHeaders"));
});
