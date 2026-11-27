import assert from "node:assert/strict";
import test from "node:test";
import {
  apiFetch,
  confirmReceiptUpload,
  createBookingHold,
  uploadFileToPresignedUrl,
  verifyOtp,
} from "../lib/api";

interface RecordedFetchCall {
  url: string;
  init: RequestInit | undefined;
}

test("apiFetch, verifyOtp, createBookingHold, and confirmReceiptUpload use same-origin /api/v1 with credentials: same-origin", async () => {
  const originalFetch = globalThis.fetch;
  const calls: RecordedFetchCall[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    await apiFetch("/auth/me");
    await verifyOtp({
      destination: "+989123456789",
      channel: "sms",
      purpose: "booking_verify",
      code: "123456",
      full_name: "نگار موسوی",
    });
    await createBookingHold(
      {
        therapist_id: "th-1",
        service_offering_id: "off-1",
        track: "iran",
        client_timezone: "Asia/Tehran",
        slot_start: "2026-12-01T10:00:00Z",
      },
      "idem-key-123",
    );
    await confirmReceiptUpload("media-1");

    assert.equal(calls.length, 4);
    assert.equal(calls[0]?.url, "/api/v1/auth/me");
    assert.equal(calls[1]?.url, "/api/v1/auth/otp/verify");
    assert.equal(calls[2]?.url, "/api/v1/bookings/hold");
    assert.equal(calls[3]?.url, "/api/v1/media/receipts/confirm");

    for (const call of calls) {
      assert.equal(
        call.init?.credentials,
        "same-origin",
        `expected credentials: same-origin for ${call.url}`,
      );
    }

    const holdHeaders = new Headers(calls[2]?.init?.headers);
    assert.equal(holdHeaders.get("Idempotency-Key"), "idem-key-123");
    assert.equal(holdHeaders.get("Content-Type"), "application/json");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("uploadFileToPresignedUrl sends direct PUT without credentials or Content-Length header", async () => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = "";
  let capturedInit: RequestInit | undefined;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    capturedUrl = String(input);
    capturedInit = init;
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  try {
    const blob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], {
      type: "image/png",
    });
    const presignedUrl =
      "http://localhost:8088/ravannama-private/receipts/u1/m1.png?X-Amz-Signature=abc";

    await uploadFileToPresignedUrl(presignedUrl, blob, "image/png");

    assert.equal(capturedUrl, presignedUrl);
    assert.equal(capturedInit?.method, "PUT");
    assert.equal(
      capturedInit?.credentials,
      undefined,
      "presigned S3 PUT must not attach credentials",
    );

    const headers = new Headers(capturedInit?.headers);
    assert.equal(headers.get("Content-Type"), "image/png");
    assert.equal(
      headers.get("Content-Length"),
      null,
      "browser upload must not set forbidden Content-Length header",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
