package identity

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	otpTTL              = 120 * time.Second
	otpMaxAttempts      = int16(5)
	sessionTTL          = 30 * 24 * time.Hour
	issueRateLimitDest  = 5
	issueRateLimitIP    = 20
	verifyRateLimitDest = 10
	verifyRateLimitIP   = 30
	rateLimitWindow     = 10 * time.Minute
)

var e164Pattern = regexp.MustCompile(`^\+[1-9][0-9]{6,14}$`)

// Config holds cryptographic configuration for OTP challenges.
type Config struct {
	OTPPepper string
}

// Service implements AuthService using hexagonal domain ports.
type Service struct {
	users       UserRepository
	otps        OTPChallengeRepository
	sessions    SessionRepository
	rateLimiter RateLimiterPort
	notifier    NotifierPort
	clock       Clock
	cfg         Config
}

// NewService constructs an identity Service with required repositories and ports.
func NewService(
	users UserRepository,
	otps OTPChallengeRepository,
	sessions SessionRepository,
	rateLimiter RateLimiterPort,
	notifier NotifierPort,
	clock Clock,
	cfg Config,
) *Service {
	return &Service{
		users:       users,
		otps:        otps,
		sessions:    sessions,
		rateLimiter: rateLimiter,
		notifier:    notifier,
		clock:       clock,
		cfg:         cfg,
	}
}

func (s *Service) IssueOTP(ctx context.Context, req IssueOTPRequest) error {
	if strings.TrimSpace(s.cfg.OTPPepper) == "" {
		return ErrInvalidConfig
	}
	if err := validatePurpose(req.Purpose); err != nil {
		return err
	}
	dest, err := normalizeDestination(req.Channel, req.Destination)
	if err != nil {
		return err
	}

	if err := s.checkRateLimit(ctx, "otp:issue:dest:"+string(req.Channel)+":"+dest, issueRateLimitDest); err != nil {
		return err
	}
	if ip := strings.TrimSpace(req.ClientIP); ip != "" {
		if err := s.checkRateLimit(ctx, "otp:issue:ip:"+ip, issueRateLimitIP); err != nil {
			return err
		}
	}

	code, err := generate6DigitOTP()
	if err != nil {
		return err
	}

	now := s.clock.Now()
	challenge := OTPChallenge{
		ID:          uuid.Must(uuid.NewV7()).String(),
		Destination: dest,
		Channel:     req.Channel,
		Purpose:     req.Purpose,
		CodeHMAC:    computeHMAC(s.cfg.OTPPepper, code),
		Attempts:    0,
		ExpiresAt:   now.Add(otpTTL),
		CreatedAt:   now,
	}
	if err := s.otps.Create(ctx, challenge); err != nil {
		return err
	}

	return s.notifier.SendOTP(ctx, req.Channel, dest, code, req.Purpose)
}

func (s *Service) VerifyOTP(ctx context.Context, req VerifyOTPRequest) (*VerifyOTPResult, error) {
	if strings.TrimSpace(s.cfg.OTPPepper) == "" {
		return nil, ErrInvalidConfig
	}
	if err := validatePurpose(req.Purpose); err != nil {
		return nil, err
	}
	dest, err := normalizeDestination(req.Channel, req.Destination)
	if err != nil {
		return nil, err
	}
	code := strings.TrimSpace(req.Code)
	if code == "" {
		return nil, ErrInvalidOTP
	}

	if err := s.checkRateLimit(ctx, "otp:verify:dest:"+string(req.Channel)+":"+dest, verifyRateLimitDest); err != nil {
		return nil, err
	}
	if ip := strings.TrimSpace(req.ClientIP); ip != "" {
		if err := s.checkRateLimit(ctx, "otp:verify:ip:"+ip, verifyRateLimitIP); err != nil {
			return nil, err
		}
	}

	challenge, err := s.otps.GetLatestActive(ctx, dest, req.Channel, req.Purpose)
	if err != nil {
		return nil, err
	}

	now := s.clock.Now()
	if !now.Before(challenge.ExpiresAt) {
		return nil, ErrOTPExpired
	}
	if challenge.Attempts >= otpMaxAttempts {
		return nil, ErrOTPMaxAttempts
	}

	expectedHMAC := computeHMAC(s.cfg.OTPPepper, code)
	if !hmac.Equal([]byte(expectedHMAC), []byte(challenge.CodeHMAC)) {
		newAttempts, incErr := s.otps.IncrementAttempts(ctx, challenge.ID)
		if errors.Is(incErr, ErrOTPMaxAttempts) || newAttempts >= otpMaxAttempts {
			return nil, ErrOTPMaxAttempts
		}
		if incErr != nil {
			return nil, incErr
		}
		return nil, ErrInvalidOTP
	}

	// Atomically consume the challenge BEFORE upserting user or minting a session.
	if err := s.otps.MarkConsumed(ctx, challenge.ID, now); err != nil {
		return nil, err
	}

	// Bind ONLY the OTP-verified channel onto identity.users.
	user, err := s.users.UpsertClientByVerifiedChannel(ctx, req.Channel, dest, strings.TrimSpace(req.FullName), "fa-IR")
	if err != nil {
		return nil, err
	}

	rawToken, err := generateOpaqueToken()
	if err != nil {
		return nil, err
	}
	session := Session{
		ID:        uuid.Must(uuid.NewV7()).String(),
		UserID:    user.ID,
		TokenHash: sha256Hex(rawToken),
		ExpiresAt: now.Add(sessionTTL),
		CreatedAt: now,
	}
	if err := s.sessions.Create(ctx, session); err != nil {
		return nil, err
	}

	return &VerifyOTPResult{
		User:         *user,
		Session:      session,
		SessionToken: rawToken,
	}, nil
}

func (s *Service) AuthenticateSession(ctx context.Context, rawToken string) (*User, *Session, error) {
	trimmed := strings.TrimSpace(rawToken)
	if trimmed == "" {
		return nil, nil, ErrUnauthorized
	}
	sess, err := s.sessions.GetByTokenHash(ctx, sha256Hex(trimmed))
	if err != nil {
		return nil, nil, ErrUnauthorized
	}
	now := s.clock.Now()
	if sess.RevokedAt != nil || !now.Before(sess.ExpiresAt) {
		return nil, nil, ErrSessionExpired
	}
	user, err := s.users.GetByID(ctx, sess.UserID)
	if err != nil {
		return nil, nil, err
	}
	return user, sess, nil
}

func (s *Service) RevokeSession(ctx context.Context, sessionID string) error {
	trimmed := strings.TrimSpace(sessionID)
	if trimmed == "" {
		return ErrInvalidInput
	}
	return s.sessions.Revoke(ctx, trimmed, s.clock.Now())
}

func (s *Service) GetClientContactSummary(ctx context.Context, actorRole Role, userID string) (*ClientContactSummary, error) {
	if actorRole != RoleTherapist && actorRole != RoleAdmin {
		return nil, ErrUnauthorized
	}
	trimmed := strings.TrimSpace(userID)
	if trimmed == "" {
		return nil, ErrInvalidInput
	}
	user, err := s.users.GetByID(ctx, trimmed)
	if err != nil {
		return nil, err
	}
	return &ClientContactSummary{
		UserID:    user.ID,
		FullName:  user.FullName,
		PhoneE164: user.PhoneE164,
		Email:     user.Email,
	}, nil
}

func (s *Service) checkRateLimit(ctx context.Context, key string, limit int) error {
	if s.rateLimiter == nil {
		return nil
	}
	allowed, err := s.rateLimiter.Allow(ctx, key, limit, rateLimitWindow)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrRateLimited
	}
	return nil
}

func validatePurpose(p OTPPurpose) error {
	switch p {
	case PurposeLogin, PurposeBookingVerify:
		return nil
	default:
		return ErrInvalidPurpose
	}
}

func normalizeDestination(ch Channel, raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	switch ch {
	case ChannelEmail:
		lower := strings.ToLower(trimmed)
		if lower == "" || len(lower) > 254 || strings.ContainsAny(lower, " \t\r\n<>") {
			return "", ErrInvalidInput
		}
		parsed, err := mail.ParseAddress(lower)
		if err != nil || parsed.Address != lower {
			return "", ErrInvalidInput
		}
		at := strings.LastIndexByte(lower, '@')
		if at <= 0 || at >= len(lower)-1 {
			return "", ErrInvalidInput
		}
		domain := lower[at+1:]
		if !strings.Contains(domain, ".") || strings.HasPrefix(domain, ".") || strings.HasSuffix(domain, ".") || strings.Contains(domain, "..") {
			return "", ErrInvalidInput
		}
		return lower, nil
	case ChannelSMS:
		if !e164Pattern.MatchString(trimmed) {
			return "", ErrInvalidInput
		}
		return trimmed, nil
	default:
		return "", ErrInvalidChannel
	}
}

func generate6DigitOTP() (string, error) {
	n, err := rand.Int(rand.Reader, big.NewInt(1000000))
	if err != nil {
		return "", err
	}
	return fmt.Sprintf("%06d", n.Int64()), nil
}

func generateOpaqueToken() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(buf), nil
}

func computeHMAC(pepper, code string) string {
	mac := hmac.New(sha256.New, []byte(pepper))
	_, _ = mac.Write([]byte(code))
	return hex.EncodeToString(mac.Sum(nil))
}

func sha256Hex(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
