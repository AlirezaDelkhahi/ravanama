package http

import (
	"log/slog"
	"net"
	"net/http"
	"strings"

	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

func internalTLSHandler(platformDomain string, checker tenant.TLSDomainChecker, logger *slog.Logger) http.HandlerFunc {
	normalizedPlatform := strings.ToLower(strings.TrimSpace(platformDomain))
	if normalizedPlatform == "" {
		normalizedPlatform = "ravannama.ir"
	}

	return func(w http.ResponseWriter, r *http.Request) {
		rawDomain := r.URL.Query().Get("domain")
		host, ok := normalizeAndValidateHostname(rawDomain)
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid domain"})
			return
		}

		if isAllowedPlatformDomain(host, normalizedPlatform) {
			writeJSON(w, http.StatusOK, map[string]string{"status": "allowed"})
			return
		}

		if checker == nil {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "domain not allowed"})
			return
		}

		verified, err := checker.IsVerifiedCustomDomain(r.Context(), host)
		if err != nil {
			if logger != nil {
				logger.Warn("custom domain TLS verification check failed")
			}
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "domain not allowed"})
			return
		}
		if !verified {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "domain not allowed"})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "allowed"})
	}
}

func isAllowedPlatformDomain(host string, platformDomain string) bool {
	if host == platformDomain {
		return true
	}
	if !strings.HasPrefix(platformDomain, "www.") && host == "www."+platformDomain {
		return true
	}
	return false
}

func normalizeAndValidateHostname(raw string) (string, bool) {
	host := strings.ToLower(strings.TrimSpace(raw))
	if host == "" || len(host) > 253 {
		return "", false
	}
	if strings.ContainsAny(host, " \t\r\n:*/\\?#[]@!") {
		return "", false
	}
	if strings.Contains(host, "..") || strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") {
		return "", false
	}
	if net.ParseIP(host) != nil {
		return "", false
	}

	labels := strings.Split(host, ".")
	if len(labels) < 2 {
		return "", false
	}
	for _, label := range labels {
		if !isValidDNSLabel(label) {
			return "", false
		}
	}
	if isAllDigits(labels[len(labels)-1]) {
		return "", false
	}
	return host, true
}

func isValidDNSLabel(label string) bool {
	if len(label) == 0 || len(label) > 63 {
		return false
	}
	if label[0] == '-' || label[len(label)-1] == '-' {
		return false
	}
	for i := 0; i < len(label); i++ {
		c := label[i]
		isLower := c >= 'a' && c <= 'z'
		isDigit := c >= '0' && c <= '9'
		if !isLower && !isDigit && c != '-' {
			return false
		}
	}
	return true
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}
