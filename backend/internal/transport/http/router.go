package http

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

// Dependencies holds injected transport dependencies via domain interfaces only.
type Dependencies struct {
	Logger           *slog.Logger
	PlatformDomain   string
	TLSDomainChecker tenant.TLSDomainChecker
}

// NewHandler wires HTTP endpoints behind panic recovery and safe request logging.
func NewHandler(deps Dependencies) http.Handler {
	logger := deps.Logger
	if logger == nil {
		logger = NewRedactingLogger(io.Discard, slog.LevelInfo)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("GET /api/v1/health", handleHealth)
	mux.HandleFunc("GET /internal/tls/allow", internalTLSHandler(deps.PlatformDomain, deps.TLSDomainChecker, logger))

	return loggingMiddleware(logger, recoverMiddleware(logger, mux))
}

func handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (sr *statusRecorder) WriteHeader(code int) {
	sr.status = code
	sr.ResponseWriter.WriteHeader(code)
}

func recoverMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if rec := recover(); rec != nil {
				logger.Error("http handler panic recovered", slog.String("path", r.URL.Path))
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func loggingMiddleware(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rec, r)

		// Log only safe metadata (never raw query string, Authorization, or Cookie headers).
		logger.Info("http request",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", rec.status),
			slog.Int64("duration_ms", time.Since(start).Milliseconds()),
		)
	})
}
