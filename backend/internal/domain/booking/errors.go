package booking

import "errors"

var (
	ErrInvalidInput       = errors.New("booking: invalid input")
	ErrInvalidTimezone    = errors.New("booking: invalid client timezone")
	ErrInvalidCallURL     = errors.New("booking: call join url must use https")
	ErrInvalidRejection   = errors.New("booking: rejection reason is required")
	ErrInvalidCommission  = errors.New("booking: invalid gross amount or commission bps")
	ErrBookingNotFound    = errors.New("booking: booking not found")
	ErrOfferingNotFound   = errors.New("booking: service offering not found")
	ErrOfferingInactive   = errors.New("booking: service offering is inactive or track mismatch")
	ErrForbidden          = errors.New("booking: forbidden")
	ErrSlotConflict       = errors.New("booking: requested slot overlaps an active booking")
	ErrHoldLimitExceeded  = errors.New("booking: active hold limit exceeded for this therapist")
	ErrHoldExpired        = errors.New("booking: booking hold has expired")
	ErrInvalidTransition  = errors.New("booking: invalid state transition")
	ErrInvalidMedia       = errors.New("booking: receipt media object is missing or unconfirmed")
	ErrReceiptAlreadyUsed = errors.New("booking: media object already attached to another booking")
)
