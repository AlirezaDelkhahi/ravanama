package bootstrap_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
)

func TestNewTestApp_HealthAndTLSAllow(t *testing.T) {
	app := bootstrap.NewTestApp()
	if app == nil {
		t.Fatal("expected non-nil *App from NewTestApp()")
	}
	handler := app.Handler()

	// Verified custom domain wired in NewTestApp()
	reqVerified := httptest.NewRequest(http.MethodGet, "/internal/tls/allow?domain=dr-example.ir", nil)
	recVerified := httptest.NewRecorder()
	handler.ServeHTTP(recVerified, reqVerified)
	if recVerified.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for verified custom domain dr-example.ir, got %d", recVerified.Code)
	}

	// Unverified custom domain rejected
	reqUnknown := httptest.NewRequest(http.MethodGet, "/internal/tls/allow?domain=unknown-clinic.ir", nil)
	recUnknown := httptest.NewRecorder()
	handler.ServeHTTP(recUnknown, reqUnknown)
	if recUnknown.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for unverified custom domain, got %d", recUnknown.Code)
	}

	// Platform domain allowed
	reqPlatform := httptest.NewRequest(http.MethodGet, "/internal/tls/allow?domain=ravannama.ir", nil)
	recPlatform := httptest.NewRecorder()
	handler.ServeHTTP(recPlatform, reqPlatform)
	if recPlatform.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for platform domain ravannama.ir, got %d", recPlatform.Code)
	}

	// Health check returns 200
	reqHealth := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	recHealth := httptest.NewRecorder()
	handler.ServeHTTP(recHealth, reqHealth)
	if recHealth.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/v1/health, got %d", recHealth.Code)
	}
}

func TestAppRunWorkers_ExitsCleanlyOnCancel(t *testing.T) {
	app := bootstrap.NewTestApp()
	ctx, cancel := context.WithCancel(context.Background())

	done := make(chan struct{})
	go func() {
		app.RunWorkers(ctx)
		close(done)
	}()

	cancel()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("RunWorkers did not exit cleanly after context cancellation")
	}
}
