package notify

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
)

var (
	_ identity.NotifierPort       = (*DevNotifier)(nil)
	_ booking.BookingNotifierPort = (*DevNotifier)(nil)
)

// DevNotifier implements OTP and booking notification ports for local/dev execution.
// It NEVER logs OTP codes, phone numbers, emails, or URLs to slog.
// When devOTPSinkFile is configured, OTP payloads are atomically written to that file (mode 0600).
type DevNotifier struct {
	logger         *slog.Logger
	devOTPSinkFile string
}

// NewDevNotifier constructs a DevNotifier. Pass an empty devOTPSinkFile in production.
func NewDevNotifier(logger *slog.Logger, devOTPSinkFile string) *DevNotifier {
	return &DevNotifier{
		logger:         logger,
		devOTPSinkFile: strings.TrimSpace(devOTPSinkFile),
	}
}

type otpSinkPayload struct {
	Destination string `json:"destination"`
	Channel     string `json:"channel"`
	Purpose     string `json:"purpose"`
	Code        string `json:"code"`
	IssuedAt    string `json:"issued_at"`
}

func (n *DevNotifier) SendOTP(_ context.Context, channel identity.Channel, destination string, code string, purpose identity.OTPPurpose) error {
	if n.logger != nil {
		n.logger.Info("otp dispatched",
			slog.String("channel", string(channel)),
			slog.String("purpose", string(purpose)),
		)
	}

	if n.devOTPSinkFile != "" {
		payload, err := json.Marshal(otpSinkPayload{
			Destination: destination,
			Channel:     string(channel),
			Purpose:     string(purpose),
			Code:        code,
			IssuedAt:    time.Now().UTC().Format(time.RFC3339),
		})
		if err != nil {
			return err
		}
		if err := writeAtomic0600(n.devOTPSinkFile, payload); err != nil {
			return err
		}
	}
	return nil
}

func (n *DevNotifier) NotifyReceiptSubmitted(_ context.Context, b booking.Booking) error {
	if n.logger != nil {
		n.logger.Info("booking notification dispatched",
			slog.String("event", "receipt_submitted"),
			slog.String("booking_id", b.ID),
			slog.String("status", string(b.Status)),
		)
	}
	return nil
}

func (n *DevNotifier) NotifyBookingApproved(_ context.Context, b booking.Booking) error {
	if n.logger != nil {
		n.logger.Info("booking notification dispatched",
			slog.String("event", "booking_approved"),
			slog.String("booking_id", b.ID),
			slog.String("status", string(b.Status)),
		)
	}
	return nil
}

func (n *DevNotifier) NotifyBookingRejected(_ context.Context, b booking.Booking) error {
	if n.logger != nil {
		n.logger.Info("booking notification dispatched",
			slog.String("event", "booking_rejected"),
			slog.String("booking_id", b.ID),
			slog.String("status", string(b.Status)),
		)
	}
	return nil
}

func writeAtomic0600(targetPath string, data []byte) error {
	dir := filepath.Dir(targetPath)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(dir, ".otp-sink-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer func() {
		_ = os.Remove(tmpName)
	}()

	if err := tmp.Chmod(0o600); err != nil {
		_ = tmp.Close()
		return err
	}
	if _, err := tmp.Write(data); err != nil {
		_ = tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return os.Rename(tmpName, targetPath)
}
