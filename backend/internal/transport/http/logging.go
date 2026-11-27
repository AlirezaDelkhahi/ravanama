package http

import (
	"io"
	"log/slog"
	"strings"
)

var sensitiveLogKeys = map[string]struct{}{
	"phone":           {},
	"phone_e164":      {},
	"email":           {},
	"otp":             {},
	"code":            {},
	"code_hmac":       {},
	"token":           {},
	"token_hash":      {},
	"session_token":   {},
	"txt_token":       {},
	"authorization":   {},
	"cookie":          {},
	"set_cookie":      {},
	"destination_val": {},
	"card_pan":        {},
	"sheba":           {},
	"iban":            {},
	"presigned_url":   {},
	"upload_url":      {},
	"download_url":    {},
	"call_join_url":   {},
	"client_ip":       {},
	"client_note":     {},
	"tracking_code":   {},
	"password":        {},
	"secret":          {},
}

// NewRedactingLogger returns a JSON slog.Logger that masks PII, OTPs, tokens,
// payment destinations, and presigned URLs across top-level and nested attributes.
func NewRedactingLogger(w io.Writer, level slog.Level) *slog.Logger {
	if w == nil {
		w = io.Discard
	}
	opts := &slog.HandlerOptions{
		Level:       level,
		ReplaceAttr: redactAttr,
	}
	return slog.New(slog.NewJSONHandler(w, opts))
}

func redactAttr(groups []string, a slog.Attr) slog.Attr {
	if a.Value.Kind() == slog.KindGroup {
		childGroups := append(append([]string(nil), groups...), a.Key)
		attrs := a.Value.Group()
		redacted := make([]slog.Attr, len(attrs))
		for i, child := range attrs {
			redacted[i] = redactAttr(childGroups, child)
		}
		return slog.Attr{
			Key:   a.Key,
			Value: slog.GroupValue(redacted...),
		}
	}
	if isSensitiveKey(a.Key) || hasSensitiveGroup(groups) {
		return slog.String(a.Key, "[REDACTED]")
	}
	return a
}

func hasSensitiveGroup(groups []string) bool {
	for _, g := range groups {
		if isSensitiveKey(g) {
			return true
		}
	}
	return false
}

func isSensitiveKey(key string) bool {
	normalized := strings.ReplaceAll(strings.ToLower(strings.TrimSpace(key)), "-", "_")
	_, ok := sensitiveLogKeys[normalized]
	return ok
}
