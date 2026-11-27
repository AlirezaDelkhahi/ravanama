import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

function makeReq(url: string, host: string): NextRequest {
  return new NextRequest(url, {
    headers: { host },
  });
}

test("middleware blocks direct external /tenants/* requests with 404", async () => {
  for (const path of ["/tenants", "/tenants/dr-sara-ahmadi", "/tenants/dr-sara-ahmadi/book"]) {
    const res = await middleware(
      makeReq(`https://ravannama.ir${path}`, "ravannama.ir"),
    );
    assert.equal(res.status, 404, `expected 404 for ${path}`);
  }
});

test("middleware rewrites platform therapist slug paths to /tenants/<slug>", async () => {
  const resProfile = await middleware(
    makeReq("https://ravannama.ir/dr-sara-ahmadi", "ravannama.ir"),
  );
  assert.equal(resProfile.status, 200);
  assert.equal(
    resProfile.headers.get("x-middleware-rewrite"),
    "https://ravannama.ir/tenants/dr-sara-ahmadi",
  );
  assert.equal(resProfile.headers.get("x-middleware-request-x-tenant-mode"), "platform");
  assert.equal(
    resProfile.headers.get("x-middleware-request-x-tenant-slug"),
    "dr-sara-ahmadi",
  );

  const resBook = await middleware(
    makeReq("https://ravannama.ir/dr-sara-ahmadi/book?rebook=bk-1", "ravannama.ir"),
  );
  assert.equal(
    resBook.headers.get("x-middleware-rewrite"),
    "https://ravannama.ir/tenants/dr-sara-ahmadi/book?rebook=bk-1",
  );
});

test("middleware never hijacks platform routes or static/api paths as therapist slugs", async () => {
  const bypassPaths = [
    "/",
    "/therapists",
    "/my-sessions",
    "/dashboard",
    "/for-therapists",
    "/fonts/vazirmatn-400.woff2",
    "/images/hero-sanctuary.jpg",
    "/api/v1/therapists",
  ];

  for (const path of bypassPaths) {
    const res = await middleware(
      makeReq(`https://ravannama.ir${path}`, "ravannama.ir"),
    );
    assert.equal(
      res.headers.get("x-middleware-rewrite"),
      null,
      `platform path ${path} must not be rewritten`,
    );
    assert.equal(res.headers.get("x-middleware-next"), "1");
  }
});

test("middleware resolves verified custom domain via backend and caches result", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    fetchCalls += 1;
    const urlStr = String(input);
    assert.ok(urlStr.includes("/api/v1/tenants/resolve?host=dr-example.ir"));
    return new Response(
      JSON.stringify({ slug: "dr-sara-ahmadi", hostname: "dr-example.ir" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }) as typeof fetch;

  try {
    const resRoot = await middleware(
      makeReq("https://dr-example.ir/", "dr-example.ir"),
    );
    assert.equal(
      resRoot.headers.get("x-middleware-rewrite"),
      "https://dr-example.ir/tenants/dr-sara-ahmadi",
    );
    assert.equal(resRoot.headers.get("x-middleware-request-x-tenant-mode"), "custom");
    assert.equal(
      resRoot.headers.get("x-middleware-request-x-tenant-slug"),
      "dr-sara-ahmadi",
    );

    const resBlog = await middleware(
      makeReq("https://dr-example.ir/blog/act-post", "dr-example.ir"),
    );
    assert.equal(
      resBlog.headers.get("x-middleware-rewrite"),
      "https://dr-example.ir/tenants/dr-sara-ahmadi/blog/act-post",
    );
    assert.equal(fetchCalls, 1, "expected 60s cache hit on second custom-domain request");

    // Platform portal path /my-sessions on custom domain still bypasses tenant rewrite
    const resPortal = await middleware(
      makeReq("https://dr-example.ir/my-sessions", "dr-example.ir"),
    );
    assert.equal(resPortal.headers.get("x-middleware-rewrite"), null);
    assert.equal(resPortal.headers.get("x-middleware-next"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("middleware fails safe to next() if custom-domain resolution fails", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as typeof fetch;

  try {
    const res = await middleware(
      makeReq("https://unknown-clinic.ir/", "unknown-clinic.ir"),
    );
    assert.equal(res.headers.get("x-middleware-rewrite"), null);
    assert.equal(res.headers.get("x-middleware-next"), "1");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
