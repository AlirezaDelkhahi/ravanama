package http

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

// Dependencies holds injected transport dependencies via domain interfaces only.
type Dependencies struct {
	Logger           *slog.Logger
	PlatformDomain   string
	TLSDomainChecker tenant.TLSDomainChecker
	Identity         identity.AuthService
	Tenant           tenant.TenantService
	Scheduling       scheduling.SchedulingService
	Booking          booking.BookingService
	Media             media.MediaService
	Content           content.ContentService
	CookieSecure      bool
	TrustProxyHeaders bool
}

// NewHandler wires HTTP endpoints behind panic recovery and safe request logging.
func NewHandler(deps Dependencies) http.Handler {
	logger := deps.Logger
	if logger == nil {
		logger = NewRedactingLogger(io.Discard, slog.LevelInfo)
	}
	deps.Logger = logger

	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", handleHealth)
	mux.HandleFunc("GET /api/v1/health", handleHealth)
	mux.HandleFunc("GET /internal/tls/allow", internalTLSHandler(deps.PlatformDomain, deps.TLSDomainChecker, logger))

	if deps.Identity != nil {
		mux.HandleFunc("POST /api/v1/auth/otp/issue", handleIssueOTP(deps))
		mux.HandleFunc("POST /api/v1/auth/otp/verify", handleVerifyOTP(deps))
		mux.HandleFunc("GET /api/v1/auth/me", handleAuthMe(deps))
		mux.HandleFunc("POST /api/v1/auth/logout", handleLogout(deps))
	}

	if deps.Tenant != nil {
		mux.HandleFunc("GET /api/v1/tenants/resolve", handleResolveTenantHost(deps))
		mux.HandleFunc("GET /api/v1/therapists", handleListDirectoryTherapists(deps))
		mux.HandleFunc("GET /api/v1/therapists/{slug}", handleGetTherapistCatalog(deps))
		if deps.Scheduling != nil {
			mux.HandleFunc("GET /api/v1/therapists/{slug}/slots", handleGenerateSlots(deps))
		}
		if deps.Content != nil {
			mux.HandleFunc("GET /api/v1/therapists/{slug}/blog", handleListTherapistBlog(deps))
			mux.HandleFunc("GET /api/v1/therapists/{slug}/blog/{post}", handleGetTherapistBlogPost(deps))
		}

		// Therapist dashboard profile, domains, payouts, schedule, blog
		mux.HandleFunc("GET /api/v1/dashboard/profile", handleDashboardGetProfile(deps))
		mux.HandleFunc("PUT /api/v1/dashboard/profile", handleDashboardUpdateProfile(deps))
		mux.HandleFunc("POST /api/v1/dashboard/payment-accounts", handleDashboardUpsertPaymentAccount(deps))
		mux.HandleFunc("POST /api/v1/dashboard/domains", handleDashboardRegisterDomain(deps))
		mux.HandleFunc("POST /api/v1/dashboard/domains/{id}/verify", handleDashboardVerifyDomain(deps))

		if deps.Scheduling != nil {
			mux.HandleFunc("GET /api/v1/dashboard/schedule", handleDashboardGetSchedule(deps))
			mux.HandleFunc("PUT /api/v1/dashboard/schedule/rules", handleDashboardSetWeeklyRules(deps))
			mux.HandleFunc("POST /api/v1/dashboard/schedule/overrides", handleDashboardUpsertOverride(deps))
			mux.HandleFunc("POST /api/v1/dashboard/offerings", handleDashboardUpsertOffering(deps))
		}
		if deps.Content != nil {
			mux.HandleFunc("GET /api/v1/dashboard/blog", handleDashboardListBlog(deps))
			mux.HandleFunc("POST /api/v1/dashboard/blog", handleDashboardUpsertBlog(deps))
		}
	}

	if deps.Booking != nil {
		mux.HandleFunc("POST /api/v1/bookings/hold", handleCreateBookingHold(deps))
		mux.HandleFunc("POST /api/v1/bookings/{id}/receipt", handleSubmitBookingReceipt(deps))
		mux.HandleFunc("GET /api/v1/bookings/me", handleListClientBookings(deps))
		mux.HandleFunc("GET /api/v1/bookings/{id}", handleGetClientBooking(deps))
		mux.HandleFunc("GET /api/v1/bookings/{id}/receipt-url", handleGetBookingReceiptURL(deps))
		if deps.Content != nil {
			mux.HandleFunc("POST /api/v1/bookings/{id}/review", handleCreateBookingReview(deps))
		}
		if deps.Tenant != nil {
			mux.HandleFunc("GET /api/v1/dashboard/bookings", handleDashboardListBookings(deps))
			mux.HandleFunc("POST /api/v1/dashboard/bookings/{id}/approve", handleDashboardApproveBooking(deps))
			mux.HandleFunc("POST /api/v1/dashboard/bookings/{id}/reject", handleDashboardRejectBooking(deps))
		}
	}

	if deps.Media != nil {
		mux.HandleFunc("POST /api/v1/media/receipts/presign", handlePresignReceiptUpload(deps))
		mux.HandleFunc("POST /api/v1/media/receipts/confirm", handleConfirmReceiptUpload(deps))
	}

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
