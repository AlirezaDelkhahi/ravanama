package identity

import (
	"context"
	"time"
)

// Role represents an authenticated user's primary role.
type Role string

const (
	RoleClient    Role = "client"
	RoleTherapist Role = "therapist"
	RoleAdmin     Role = "admin"
)

// Channel represents the delivery channel for OTP verification.
type Channel string

const (
	ChannelSMS   Channel = "sms"
	ChannelEmail Channel = "email"
)

// OTPPurpose identifies why an OTP challenge was issued.
type OTPPurpose string

const (
	PurposeLogin         OTPPurpose = "login"
	PurposeBookingVerify OTPPurpose = "booking_verify"
)

// User represents a platform identity row in identity.users.
type User struct {
	ID        string
	Role      Role
	FullName  string
	PhoneE164 *string
	Email     *string
	Locale    string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// Session represents an opaque user session in identity.user_sessions.
type Session struct {
	ID        string
	UserID    string
	TokenHash string
	ExpiresAt time.Time
	RevokedAt *time.Time
	CreatedAt time.Time
}

// OTPChallenge represents a hashed one-time password challenge.
type OTPChallenge struct {
	ID          string
	Destination string
	Channel     Channel
	Purpose     OTPPurpose
	CodeHMAC    string
	Attempts    int16
	ExpiresAt   time.Time
	ConsumedAt  *time.Time
	CreatedAt   time.Time
}

// IssueOTPRequest holds parameters for issuing an OTP challenge.
type IssueOTPRequest struct {
	Destination string
	Channel     Channel
	Purpose     OTPPurpose
	ClientIP    string
}

// VerifyOTPRequest holds parameters for verifying an OTP challenge.
type VerifyOTPRequest struct {
	Destination string
	Channel     Channel
	Purpose     OTPPurpose
	Code        string
	FullName    string
	ClientIP    string
}

// VerifyOTPResult contains the authenticated user and raw opaque session token.
type VerifyOTPResult struct {
	User         User
	Session      Session
	SessionToken string
}

// ClientContactSummary exposes verified client contact metadata strictly to authorized therapists/admins.
type ClientContactSummary struct {
	UserID    string
	FullName  string
	PhoneE164 *string
	Email     *string
}

// AuthService defines identity authentication and session operations.
type AuthService interface {
	IssueOTP(ctx context.Context, req IssueOTPRequest) error
	VerifyOTP(ctx context.Context, req VerifyOTPRequest) (*VerifyOTPResult, error)
	AuthenticateSession(ctx context.Context, rawToken string) (*User, *Session, error)
	RevokeSession(ctx context.Context, sessionID string) error
	GetClientContactSummary(ctx context.Context, actorRole Role, userID string) (*ClientContactSummary, error)
}

// UserRepository persists and retrieves identity.users records.
type UserRepository interface {
	GetByID(ctx context.Context, id string) (*User, error)
	GetByPhoneE164(ctx context.Context, phoneE164 string) (*User, error)
	GetByEmail(ctx context.Context, email string) (*User, error)
	UpsertClientByVerifiedChannel(ctx context.Context, channel Channel, destination string, fullName string, locale string) (*User, error)
}

// OTPChallengeRepository persists and verifies OTP challenges.
type OTPChallengeRepository interface {
	Create(ctx context.Context, challenge OTPChallenge) error
	GetLatestActive(ctx context.Context, destination string, channel Channel, purpose OTPPurpose) (*OTPChallenge, error)
	IncrementAttempts(ctx context.Context, id string) (int16, error)
	MarkConsumed(ctx context.Context, id string, consumedAt time.Time) error
}

// SessionRepository persists opaque hashed user sessions.
type SessionRepository interface {
	Create(ctx context.Context, session Session) error
	GetByTokenHash(ctx context.Context, tokenHash string) (*Session, error)
	Revoke(ctx context.Context, id string, revokedAt time.Time) error
}

// RateLimiterPort enforces rate limits across OTP and sensitive endpoints.
type RateLimiterPort interface {
	Allow(ctx context.Context, key string, limit int, window time.Duration) (bool, error)
}

// NotifierPort sends OTP codes and transactional alerts via SMS or email.
type NotifierPort interface {
	SendOTP(ctx context.Context, channel Channel, destination string, code string, purpose OTPPurpose) error
}

// Clock provides the current timestamp for deterministic TTL checks.
type Clock interface {
	Now() time.Time
}
