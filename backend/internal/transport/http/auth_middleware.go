package http

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

const (
	sessionCookieName = "ravannama_session"
	maxJSONBodyBytes  = 1 << 20 // 1 MiB
)

type authContextKey struct{}

type authContextValue struct {
	User      *identity.User
	Session   *identity.Session
	Therapist *tenant.Therapist
}

func userFromContext(ctx context.Context) (*identity.User, *identity.Session, bool) {
	val, ok := ctx.Value(authContextKey{}).(authContextValue)
	if !ok || val.User == nil || val.Session == nil {
		return nil, nil, false
	}
	return val.User, val.Session, true
}

func therapistFromContext(ctx context.Context) (*tenant.Therapist, bool) {
	val, ok := ctx.Value(authContextKey{}).(authContextValue)
	if !ok || val.Therapist == nil {
		return nil, false
	}
	return val.Therapist, true
}

func requireAuth(deps Dependencies, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Identity == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "authentication unavailable"})
			return
		}
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || strings.TrimSpace(cookie.Value) == "" {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		user, sess, err := deps.Identity.AuthenticateSession(r.Context(), cookie.Value)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		ctx := context.WithValue(r.Context(), authContextKey{}, authContextValue{
			User:    user,
			Session: sess,
		})
		next(w, r.WithContext(ctx))
	}
}

func requireTherapist(deps Dependencies, next http.HandlerFunc) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, sess, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		if user.Role != identity.RoleTherapist && user.Role != identity.RoleAdmin {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "therapist role required"})
			return
		}
		if deps.Tenant == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "tenant service unavailable"})
			return
		}
		th, err := deps.Tenant.GetTherapistByUserID(r.Context(), user.ID)
		if err != nil {
			if errors.Is(err, tenant.ErrTherapistNotFound) {
				writeJSON(w, http.StatusForbidden, map[string]string{"error": "therapist profile not found"})
				return
			}
			writeDomainError(w, deps.Logger, err)
			return
		}
		ctx := context.WithValue(r.Context(), authContextKey{}, authContextValue{
			User:      user,
			Session:   sess,
			Therapist: th,
		})
		next(w, r.WithContext(ctx))
	})
}

func decodeJSON(w http.ResponseWriter, r *http.Request, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxJSONBodyBytes)
	dec := json.NewDecoder(r.Body)
	if err := dec.Decode(dst); err != nil {
		var maxErr *http.MaxBytesError
		if errors.As(err, &maxErr) {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "request body too large"})
			return false
		}
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return false
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unexpected trailing json content"})
		return false
	}
	return true
}

func setSessionCookie(w http.ResponseWriter, rawToken string, expiresAt time.Time, secure bool) {
	maxAge := int(time.Until(expiresAt).Seconds())
	if maxAge <= 0 {
		maxAge = 30 * 24 * 3600
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    rawToken,
		Path:     "/",
		Expires:  expiresAt.UTC(),
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func clearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		Expires:  time.Unix(0, 0).UTC(),
		MaxAge:   -1,
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

// ClientIPFromRequest extracts a validated client IP from RemoteAddr, or from
// proxy headers (rightmost valid X-Forwarded-For / X-Real-IP) only when trustProxyHeaders is enabled.
func ClientIPFromRequest(r *http.Request, trustProxyHeaders bool) string {
	remoteIP := strings.TrimSpace(r.RemoteAddr)
	if host, _, err := net.SplitHostPort(remoteIP); err == nil && host != "" {
		remoteIP = host
	}
	if parsed := net.ParseIP(remoteIP); parsed != nil {
		remoteIP = parsed.String()
	}

	if trustProxyHeaders {
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			parts := strings.Split(xff, ",")
			for i := len(parts) - 1; i >= 0; i-- {
				if ip := net.ParseIP(strings.TrimSpace(parts[i])); ip != nil {
					return ip.String()
				}
			}
		}
		if xri := strings.TrimSpace(r.Header.Get("X-Real-IP")); xri != "" {
			if ip := net.ParseIP(xri); ip != nil {
				return ip.String()
			}
		}
	}

	return remoteIP
}

func writeDomainError(w http.ResponseWriter, logger *slog.Logger, err error) {
	status, msg := mapDomainError(err)
	if status >= 500 && logger != nil {
		logger.Error("internal handler error", slog.String("error", err.Error()))
	}
	writeJSON(w, status, map[string]string{"error": msg})
}

func mapDomainError(err error) (int, string) {
	switch {
	// 400 Bad Request
	case errors.Is(err, identity.ErrInvalidInput),
		errors.Is(err, identity.ErrInvalidChannel),
		errors.Is(err, identity.ErrInvalidPurpose),
		errors.Is(err, tenant.ErrInvalidInput),
		errors.Is(err, tenant.ErrInvalidSlug),
		errors.Is(err, tenant.ErrTooManyFocusTags),
		errors.Is(err, tenant.ErrInvalidCallURL),
		errors.Is(err, tenant.ErrInvalidTimezone),
		errors.Is(err, tenant.ErrInvalidPaymentMethod),
		errors.Is(err, scheduling.ErrInvalidInput),
		errors.Is(err, scheduling.ErrInvalidTrack),
		errors.Is(err, scheduling.ErrInvalidDuration),
		errors.Is(err, scheduling.ErrInvalidCurrency),
		errors.Is(err, scheduling.ErrInvalidPrice),
		errors.Is(err, scheduling.ErrInvalidRule),
		errors.Is(err, scheduling.ErrInvalidOverride),
		errors.Is(err, scheduling.ErrInvalidTimezone),
		errors.Is(err, scheduling.ErrInvalidDateRange),
		errors.Is(err, booking.ErrInvalidInput),
		errors.Is(err, booking.ErrInvalidTimezone),
		errors.Is(err, booking.ErrInvalidCallURL),
		errors.Is(err, booking.ErrInvalidRejection),
		errors.Is(err, booking.ErrInvalidCommission),
		errors.Is(err, media.ErrInvalidInput),
		errors.Is(err, media.ErrInvalidDownloadTTL),
		errors.Is(err, content.ErrInvalidInput),
		errors.Is(err, content.ErrInvalidSlug),
		errors.Is(err, content.ErrInvalidPostStatus),
		errors.Is(err, content.ErrInvalidRating):
		return http.StatusBadRequest, err.Error()

	// 401 Unauthorized
	case errors.Is(err, identity.ErrUnauthorized),
		errors.Is(err, identity.ErrSessionExpired),
		errors.Is(err, identity.ErrInvalidOTP),
		errors.Is(err, identity.ErrOTPExpired),
		errors.Is(err, identity.ErrOTPNotFound):
		return http.StatusUnauthorized, err.Error()

	// 429 Too Many Requests
	case errors.Is(err, identity.ErrRateLimited),
		errors.Is(err, identity.ErrOTPMaxAttempts):
		return http.StatusTooManyRequests, err.Error()

	// 403 Forbidden
	case errors.Is(err, tenant.ErrForbidden),
		errors.Is(err, scheduling.ErrForbidden),
		errors.Is(err, booking.ErrForbidden),
		errors.Is(err, media.ErrForbidden),
		errors.Is(err, content.ErrForbidden):
		return http.StatusForbidden, err.Error()

	// 404 Not Found
	case errors.Is(err, identity.ErrUserNotFound),
		errors.Is(err, tenant.ErrTherapistNotFound),
		errors.Is(err, tenant.ErrDomainNotFound),
		errors.Is(err, tenant.ErrPaymentAccountNotFound),
		errors.Is(err, scheduling.ErrOfferingNotFound),
		errors.Is(err, scheduling.ErrOverrideNotFound),
		errors.Is(err, booking.ErrBookingNotFound),
		errors.Is(err, booking.ErrOfferingNotFound),
		errors.Is(err, media.ErrMediaNotFound),
		errors.Is(err, content.ErrPostNotFound),
		errors.Is(err, content.ErrBookingNotFound):
		return http.StatusNotFound, err.Error()

	// 410 Gone
	case errors.Is(err, booking.ErrHoldExpired):
		return http.StatusGone, err.Error()

	// 409 Conflict
	case errors.Is(err, booking.ErrSlotConflict),
		errors.Is(err, booking.ErrInvalidTransition),
		errors.Is(err, booking.ErrReceiptAlreadyUsed),
		errors.Is(err, booking.ErrOfferingInactive),
		errors.Is(err, scheduling.ErrOfferingInactive),
		errors.Is(err, tenant.ErrDomainAlreadyClaimed),
		errors.Is(err, content.ErrReviewAlreadyExists),
		errors.Is(err, content.ErrSlugConflict),
		errors.Is(err, media.ErrNoActiveHold),
		errors.Is(err, media.ErrMediaDeleted):
		return http.StatusConflict, err.Error()

	// 422 Unprocessable Entity
	case errors.Is(err, media.ErrUnsupportedMIME),
		errors.Is(err, media.ErrFileTooLarge),
		errors.Is(err, media.ErrInvalidReceiptFile),
		errors.Is(err, booking.ErrHoldLimitExceeded),
		errors.Is(err, booking.ErrInvalidMedia),
		errors.Is(err, content.ErrBookingNotCompleted),
		errors.Is(err, tenant.ErrDomainVerifyFailed):
		return http.StatusUnprocessableEntity, err.Error()

	default:
		return http.StatusInternalServerError, "internal server error"
	}
}
