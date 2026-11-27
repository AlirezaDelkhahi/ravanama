package scheduling

import "errors"

var (
	ErrInvalidInput       = errors.New("scheduling: invalid input")
	ErrInvalidTrack       = errors.New("scheduling: invalid track")
	ErrInvalidDuration    = errors.New("scheduling: unsupported session duration")
	ErrInvalidCurrency    = errors.New("scheduling: currency does not match track")
	ErrInvalidPrice       = errors.New("scheduling: price amount must be positive")
	ErrInvalidRule        = errors.New("scheduling: invalid weekly availability rule")
	ErrInvalidOverride    = errors.New("scheduling: invalid availability override")
	ErrInvalidTimezone    = errors.New("scheduling: invalid IANA timezone")
	ErrInvalidDateRange   = errors.New("scheduling: invalid date range")
	ErrOfferingNotFound   = errors.New("scheduling: service offering not found")
	ErrOfferingInactive   = errors.New("scheduling: service offering is inactive")
	ErrOverrideNotFound   = errors.New("scheduling: availability override not found")
	ErrForbidden          = errors.New("scheduling: forbidden")
)
