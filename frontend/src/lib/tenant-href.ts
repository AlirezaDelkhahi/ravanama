export type TenantMode = "platform" | "custom";

export interface TenantHrefOptions {
  mode: TenantMode;
  slug: string;
}

/**
 * Builds host-aware tenant URLs:
 * - On custom domains: root-relative paths (/book, /blog, /blog/post)
 * - On platform host: slug-prefixed paths (/<slug>/book, /<slug>/blog, /<slug>/blog/post)
 */
export function buildTenantHref(path: string, opts: TenantHrefOptions): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  if (opts.mode === "custom") {
    return normalizedPath === "" ? "/" : normalizedPath;
  }

  const cleanSlug = opts.slug.replace(/^\/+|\/+$/g, "");
  if (normalizedPath === "/" || normalizedPath === "") {
    return `/${cleanSlug}`;
  }

  return `/${cleanSlug}${normalizedPath}`;
}
