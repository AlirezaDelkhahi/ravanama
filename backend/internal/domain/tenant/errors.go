package tenant

import "errors"

var (
	ErrInvalidSlug          = errors.New("tenant: invalid or reserved therapist slug")
	ErrInvalidInput         = errors.New("tenant: invalid input")
	ErrTherapistNotFound    = errors.New("tenant: therapist not found")
	ErrDomainNotFound       = errors.New("tenant: custom domain not found")
	ErrDomainAlreadyClaimed = errors.New("tenant: hostname already registered")
	ErrDomainVerifyFailed   = errors.New("tenant: txt verification failed")
	ErrForbidden            = errors.New("tenant: forbidden")
	ErrTooManyFocusTags     = errors.New("tenant: maximum 8 focus tags allowed")
	ErrInvalidCallURL       = errors.New("tenant: default call url must use https")
	ErrInvalidTimezone      = errors.New("tenant: invalid IANA timezone")
	ErrInvalidPaymentMethod   = errors.New("tenant: invalid track and payment method pairing")
	ErrPaymentAccountNotFound = errors.New("tenant: payment account not found")
)
