package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/identity"
)

type issueOTPReq struct {
	Destination string `json:"destination"`
	Channel     string `json:"channel"`
	Purpose     string `json:"purpose"`
}

type verifyOTPReq struct {
	Destination string `json:"destination"`
	Channel     string `json:"channel"`
	Purpose     string `json:"purpose"`
	Code        string `json:"code"`
	FullName    string `json:"full_name"`
}

type userDTO struct {
	ID        string  `json:"id"`
	Role      string  `json:"role"`
	FullName  string  `json:"full_name"`
	PhoneE164 *string `json:"phone_e164,omitempty"`
	Email     *string `json:"email,omitempty"`
	Locale    string  `json:"locale"`
}

func toUserDTO(u identity.User) userDTO {
	return userDTO{
		ID:        u.ID,
		Role:      string(u.Role),
		FullName:  u.FullName,
		PhoneE164: u.PhoneE164,
		Email:     u.Email,
		Locale:    u.Locale,
	}
}

func handleIssueOTP(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req issueOTPReq
		if !decodeJSON(w, r, &req) {
			return
		}
		err := deps.Identity.IssueOTP(r.Context(), identity.IssueOTPRequest{
			Destination: req.Destination,
			Channel:     identity.Channel(strings.TrimSpace(req.Channel)),
			Purpose:     identity.OTPPurpose(strings.TrimSpace(req.Purpose)),
			ClientIP:    ClientIPFromRequest(r, deps.TrustProxyHeaders),
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "sent"})
	}
}

func handleVerifyOTP(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req verifyOTPReq
		if !decodeJSON(w, r, &req) {
			return
		}
		res, err := deps.Identity.VerifyOTP(r.Context(), identity.VerifyOTPRequest{
			Destination: req.Destination,
			Channel:     identity.Channel(strings.TrimSpace(req.Channel)),
			Purpose:     identity.OTPPurpose(strings.TrimSpace(req.Purpose)),
			Code:        req.Code,
			FullName:    req.FullName,
			ClientIP:    ClientIPFromRequest(r, deps.TrustProxyHeaders),
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		// Set HttpOnly cookie; NEVER return raw SessionToken in JSON body.
		setSessionCookie(w, res.SessionToken, res.Session.ExpiresAt, deps.CookieSecure)
		writeJSON(w, http.StatusOK, map[string]any{
			"user":               toUserDTO(res.User),
			"session_expires_at": res.Session.ExpiresAt.UTC().Format(time.RFC3339),
		})
	}
}

func handleAuthMe(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, sess, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		resp := map[string]any{
			"user":               toUserDTO(*user),
			"session_expires_at": sess.ExpiresAt.UTC().Format(time.RFC3339),
		}
		if (user.Role == identity.RoleTherapist || user.Role == identity.RoleAdmin) && deps.Tenant != nil {
			if th, err := deps.Tenant.GetTherapistByUserID(r.Context(), user.ID); err == nil && th != nil {
				resp["therapist"] = map[string]any{
					"id":           th.ID,
					"slug":         th.Slug,
					"display_name": th.DisplayName,
				}
			}
		}
		writeJSON(w, http.StatusOK, resp)
	})
}

func handleLogout(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Identity != nil {
			if cookie, err := r.Cookie(sessionCookieName); err == nil && strings.TrimSpace(cookie.Value) != "" {
				if _, sess, authErr := deps.Identity.AuthenticateSession(r.Context(), cookie.Value); authErr == nil && sess != nil {
					_ = deps.Identity.RevokeSession(r.Context(), sess.ID)
				}
			}
		}
		clearSessionCookie(w, deps.CookieSecure)
		writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
	}
}
