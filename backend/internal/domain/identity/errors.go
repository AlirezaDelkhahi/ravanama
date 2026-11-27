package identity

import "errors"

var (
	ErrInvalidInput      = errors.New("identity: invalid input")
	ErrInvalidChannel    = errors.New("identity: invalid otp channel")
	ErrInvalidPurpose    = errors.New("identity: invalid otp purpose")
	ErrInvalidConfig     = errors.New("identity: invalid service configuration")
	ErrRateLimited       = errors.New("identity: rate limit exceeded")
	ErrOTPNotFound       = errors.New("identity: active otp challenge not found")
	ErrOTPExpired        = errors.New("identity: otp challenge expired")
	ErrOTPMaxAttempts    = errors.New("identity: otp max verification attempts exceeded")
	ErrInvalidOTP        = errors.New("identity: invalid otp code")
	ErrUnauthorized      = errors.New("identity: unauthorized session")
	ErrSessionExpired    = errors.New("identity: session expired or revoked")
	ErrUserNotFound      = errors.New("identity: user not found")
)
