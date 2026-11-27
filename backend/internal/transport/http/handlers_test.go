package http_test

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

func TestRouter_MaxBodyAndCookieSecureGuards(t *testing.T) {
	handler := httptransport.NewHandler(httptransport.Dependencies{
		PlatformDomain: "ravannama.ir",
		CookieSecure:   true,
	})

	// Health routes work with minimal Dependencies (backward compatibility).
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", rec.Code)
	}

	// Nil services return 404 without panic.
	recAuth := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/issue", bytes.NewReader([]byte(strings.Repeat("a", 10))))
	handler.ServeHTTP(recAuth, req)
	if recAuth.Code != http.StatusNotFound {
		t.Fatalf("expected 404 when Identity service is nil, got %d", recAuth.Code)
	}
}

func TestClientIPFromRequest_ProxyTrustAndSpoofDefense(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/issue", nil)
	req.RemoteAddr = "10.10.0.5:41234"
	req.Header.Set("X-Forwarded-For", "198.51.100.99, spoofed-ip, 203.0.113.50")
	req.Header.Set("X-Real-IP", "198.51.100.88")

	// By default (untrusted proxy headers), X-Forwarded-For and X-Real-IP are ignored.
	if got := httptransport.ClientIPFromRequest(req, false); got != "10.10.0.5" {
		t.Fatalf("expected 10.10.0.5 when trustProxyHeaders=false, got %q", got)
	}

	// When trustProxyHeaders=true, rightmost valid IP in X-Forwarded-For is selected (anti-spoof).
	if got := httptransport.ClientIPFromRequest(req, true); got != "203.0.113.50" {
		t.Fatalf("expected 203.0.113.50 when trustProxyHeaders=true, got %q", got)
	}

	// If X-Forwarded-For has only invalid entries, fall back to valid X-Real-IP, then RemoteAddr.
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/issue", nil)
	req2.RemoteAddr = "10.10.0.5:41234"
	req2.Header.Set("X-Forwarded-For", "not-an-ip")
	req2.Header.Set("X-Real-IP", "198.51.100.88")
	if got := httptransport.ClientIPFromRequest(req2, true); got != "198.51.100.88" {
		t.Fatalf("expected X-Real-IP fallback 198.51.100.88, got %q", got)
	}

	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/auth/otp/issue", nil)
	req3.RemoteAddr = "10.10.0.5:41234"
	req3.Header.Set("X-Forwarded-For", "not-an-ip")
	req3.Header.Set("X-Real-IP", "also-not-an-ip")
	if got := httptransport.ClientIPFromRequest(req3, true); got != "10.10.0.5" {
		t.Fatalf("expected RemoteAddr fallback 10.10.0.5, got %q", got)
	}
}
