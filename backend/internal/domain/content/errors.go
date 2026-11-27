package content

import "errors"

var (
	ErrInvalidInput        = errors.New("content: invalid input")
	ErrInvalidSlug         = errors.New("content: invalid blog post slug")
	ErrInvalidPostStatus   = errors.New("content: invalid blog post status")
	ErrPostNotFound        = errors.New("content: blog post not found")
	ErrInvalidRating       = errors.New("content: rating must be between 1 and 5")
	ErrBookingNotFound     = errors.New("content: booking not found")
	ErrBookingNotCompleted = errors.New("content: reviews are allowed only on completed bookings")
	ErrForbidden           = errors.New("content: forbidden")
	ErrReviewAlreadyExists = errors.New("content: review already submitted for this booking")
	ErrSlugConflict        = errors.New("content: blog post slug already exists")
)
