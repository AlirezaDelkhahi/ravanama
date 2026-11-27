package http_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

type stubTLSDomainChecker struct {
	verified map[string]bool
	err      error
}

func (s *stubTLSDomainChecker) IsVerifiedCustomDomain(_ context.Context, hostname string) (bool, error) {
	if s.err != nil {
		return false, s.err
	}
	return s.verified[hostname], nil
}

func TestHealthEndpoints(t *testing.T) {
	var logBuf bytes.Buffer
	handler := httptransport.NewHandler(httptransport.Dependencies{
		Logger:         httptransport.NewRedactingLogger(&logBuf, slog.LevelInfo),
		PlatformDomain: "ravannama.ir",
	})

	for _, path := range []string{"/healthz", "/api/v1/health"} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("expected 200 OK for %s, got %d", path, rec.Code)
			}
			var body map[string]string
			if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
				t.Fatalf("expected valid JSON body for %s: %v", path, err)
			}
			if body["status"] != "ok" {
				t.Fatalf("expected status=ok for %s, got %+v", path, body)
			}
		})
	}
}

func TestInternalTLSAllow(t *testing.T) {
	tooLongDomain := strings.Repeat("a", 63) + "." + strings.Repeat("b", 63) + "." + strings.Repeat("c", 63) + "." + strings.Repeat("d", 63) + ".ir"

	tests := []struct {
		name       string
		target     string
		checker    *stubTLSDomainChecker
		nilChecker bool
		wantStatus int
	}{
		{name: "missing domain query param", target: "/internal/tls/allow", wantStatus: http.StatusBadRequest},
		{name: "empty domain query param", target: "/internal/tls/allow?domain=", wantStatus: http.StatusBadRequest},
		{name: "whitespace domain", target: "/internal/tls/allow?domain=%20%20%20", wantStatus: http.StatusBadRequest},
		{name: "ipv4 literal", target: "/internal/tls/allow?domain=127.0.0.1", wantStatus: http.StatusBadRequest},
		{name: "ipv6 literal", target: "/internal/tls/allow?domain=::1", wantStatus: http.StatusBadRequest},
		{name: "domain with port", target: "/internal/tls/allow?domain=dr-example.ir:443", wantStatus: http.StatusBadRequest},
		{name: "wildcard domain", target: "/internal/tls/allow?domain=*.ravannama.ir", wantStatus: http.StatusBadRequest},
		{name: "double dot domain", target: "/internal/tls/allow?domain=dr..example.ir", wantStatus: http.StatusBadRequest},
		{name: "leading dot domain", target: "/internal/tls/allow?domain=.dr-example.ir", wantStatus: http.StatusBadRequest},
		{name: "trailing dot domain", target: "/internal/tls/allow?domain=dr-example.ir.", wantStatus: http.StatusBadRequest},
		{name: "invalid chars url", target: "/internal/tls/allow?domain=https://dr-example.ir", wantStatus: http.StatusBadRequest},
		{name: "single label", target: "/internal/tls/allow?domain=localhost", wantStatus: http.StatusBadRequest},
		{name: "over 253 chars", target: "/internal/tls/allow?domain=" + tooLongDomain, wantStatus: http.StatusBadRequest},
		{name: "platform domain exact", target: "/internal/tls/allow?domain=ravannama.ir", nilChecker: true, wantStatus: http.StatusOK},
		{name: "platform domain www normalized", target: "/internal/tls/allow?domain=%20WWW.RAVANNAMA.IR%20", nilChecker: true, wantStatus: http.StatusOK},
		{name: "nil checker fails closed", target: "/internal/tls/allow?domain=dr-example.ir", nilChecker: true, wantStatus: http.StatusForbidden},
		{
			name:       "unverified custom domain",
			target:     "/internal/tls/allow?domain=unverified.ir",
			checker:    &stubTLSDomainChecker{verified: map[string]bool{"dr-example.ir": true}},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "checker error fails closed",
			target:     "/internal/tls/allow?domain=dr-example.ir",
			checker:    &stubTLSDomainChecker{err: errors.New("db unavailable")},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "verified custom domain",
			target:     "/internal/tls/allow?domain=DR-Example.IR",
			checker:    &stubTLSDomainChecker{verified: map[string]bool{"dr-example.ir": true}},
			wantStatus: http.StatusOK,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var logBuf bytes.Buffer
			deps := httptransport.Dependencies{
				Logger:         httptransport.NewRedactingLogger(&logBuf, slog.LevelInfo),
				PlatformDomain: "ravannama.ir",
			}
			if !tc.nilChecker && tc.checker != nil {
				deps.TLSDomainChecker = tc.checker
			}
			handler := httptransport.NewHandler(deps)

			req := httptest.NewRequest(http.MethodGet, tc.target, nil)
			req.Header.Set("Authorization", "Bearer top-secret-token")
			req.Header.Set("Cookie", "rvn_sess=secret-cookie-val")
			rec := httptest.NewRecorder()
			handler.ServeHTTP(rec, req)

			if rec.Code != tc.wantStatus {
				t.Fatalf("expected status %d for %s, got %d (body=%q)", tc.wantStatus, tc.target, rec.Code, rec.Body.String())
			}

			logOut := logBuf.String()
			if strings.Contains(logOut, "top-secret-token") || strings.Contains(logOut, "secret-cookie-val") {
				t.Fatalf("expected request headers not to leak into logs, got: %s", logOut)
			}
			if strings.Contains(logOut, "domain=") {
				t.Fatalf("expected raw query params not to leak into request log, got: %s", logOut)
			}
		})
	}
}

type panickingTLSDomainChecker struct{}

func (panickingTLSDomainChecker) IsVerifiedCustomDomain(_ context.Context, _ string) (bool, error) {
	panic("unexpected checker panic")
}

func TestRecoverMiddleware_LogsAccessRecordOnPanic(t *testing.T) {
	var logBuf bytes.Buffer
	handler := httptransport.NewHandler(httptransport.Dependencies{
		Logger:           httptransport.NewRedactingLogger(&logBuf, slog.LevelInfo),
		PlatformDomain:   "ravannama.ir",
		TLSDomainChecker: panickingTLSDomainChecker{},
	})

	req := httptest.NewRequest(http.MethodGet, "/internal/tls/allow?domain=dr-example.ir", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusInternalServerError {
		t.Fatalf("expected 500 Internal Server Error on panic, got %d", rec.Code)
	}

	logOut := logBuf.String()
	if !strings.Contains(logOut, `"msg":"http handler panic recovered"`) {
		t.Fatalf("expected panic recovery log entry, got: %s", logOut)
	}
	if !strings.Contains(logOut, `"msg":"http request"`) || !strings.Contains(logOut, `"status":500`) || !strings.Contains(logOut, `"duration_ms":`) {
		t.Fatalf("expected http request access log with status 500 and duration_ms on panic, got: %s", logOut)
	}
}
