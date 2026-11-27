package http_test

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"

	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

func TestNewRedactingLogger_MasksSensitiveFieldsAndNestedGroups(t *testing.T) {
	var buf bytes.Buffer
	logger := httptransport.NewRedactingLogger(&buf, slog.LevelDebug)

	secrets := []string{
		"+989123456789",
		"09123456789",
		"client@example.com",
		"123456",
		"654321",
		"raw-opaque-token",
		"raw-session-token",
		"Bearer super-secret-jwt",
		"session=abc123",
		"session=xyz789; HttpOnly",
		"IR120540100000012345678901",
		"6037997112345678",
		"IR000000000000000000000001",
		"DE89370400440532013000",
		"https://s3.example.com/private/receipt.jpg?X-Amz-Signature=deadbeef",
		"https://s3.example.com/private/upload?X-Amz-Signature=cafebabe",
		"https://s3.example.com/private/download?X-Amz-Signature=feedface",
		"my-password",
		"my-pepper-secret",
		"https://meet.google.com/abc-defg-hij",
		"ravannama-verify=xyz987",
		"sha256-token-hash-value",
		"hmac-sha256-otp-value",
		"203.0.113.42",
		"6037997100001111",
		"1111",
		"private-clinical-note-secret",
		"TRK-99887766",
	}

	logger.Info("sensitive payload check",
		slog.String("phone", secrets[0]),
		slog.String("Phone_E164", secrets[1]),
		slog.String("EMAIL", secrets[2]),
		slog.String("otp", secrets[3]),
		slog.String("code", secrets[4]),
		slog.String("token", secrets[5]),
		slog.String("session_token", secrets[6]),
		slog.String("Authorization", secrets[7]),
		slog.String("cookie", secrets[8]),
		slog.String("Set-Cookie", secrets[9]),
		slog.String("call_join_url", secrets[19]),
		slog.String("txt_token", secrets[20]),
		slog.String("token_hash", secrets[21]),
		slog.String("code_hmac", secrets[22]),
		slog.String("client_ip", secrets[23]),
		slog.String("client_note", secrets[26]),
		slog.String("tracking_code", secrets[27]),
		slog.String("non_secret", "visible-value"),
		slog.Group("nested",
			slog.String("destination_val", secrets[10]),
			slog.String("card_pan", secrets[11]),
			slog.String("sheba", secrets[12]),
			slog.String("iban", secrets[13]),
			slog.String("presigned_url", secrets[14]),
			slog.String("upload_url", secrets[15]),
			slog.String("download_url", secrets[16]),
			slog.String("password", secrets[17]),
			slog.String("secret", secrets[18]),
			slog.String("safe_nested", "still-visible"),
		),
	)

	logger.WithGroup("card_pan").Info("grouped sensitive payload",
		slog.String("full", secrets[24]),
		slog.String("last4", secrets[25]),
	)

	out := buf.String()
	for _, secret := range secrets {
		if strings.Contains(out, secret) {
			t.Fatalf("expected secret %q to be redacted from log output, got: %s", secret, out)
		}
	}

	if !strings.Contains(out, "[REDACTED]") {
		t.Fatalf("expected [REDACTED] placeholder in log output, got: %s", out)
	}
	if !strings.Contains(out, "visible-value") || !strings.Contains(out, "still-visible") {
		t.Fatalf("expected non-sensitive fields to remain visible, got: %s", out)
	}
}
