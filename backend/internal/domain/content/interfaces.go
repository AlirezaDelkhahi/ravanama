package content

import (
	"context"
	"time"
)

// PostStatus tracks SEO blog publication status.
type PostStatus string

const (
	PostStatusDraft     PostStatus = "draft"
	PostStatusPublished PostStatus = "published"
)

// BlogPost represents a therapist-authored SEO article in content.blog_posts.
type BlogPost struct {
	ID             string
	TherapistID    string
	Slug           string
	Title          string
	Excerpt        string
	BodyMarkdown   string
	CoverObjectKey *string
	SEOTitle       string
	SEODescription string
	ReadingMin     int16
	Status         PostStatus
	PublishedAt    *time.Time
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// Review represents a verified-only client reflection linked to a completed booking.
type Review struct {
	ID          string
	BookingID   string
	TherapistID string
	ClientLabel string
	Rating      int16
	Comment     string
	IsPublished bool
	CreatedAt   time.Time
}

// CreateReviewRequest captures inputs for submitting a verified completed-booking review.
type CreateReviewRequest struct {
	BookingID    string
	ClientUserID string
	ClientLabel  string
	Rating       int16
	Comment      string
}

// ContentService defines SEO blog and verified review workflows.
type ContentService interface {
	ListPublishedPosts(ctx context.Context, therapistID string) ([]BlogPost, error)
	ListAllByTherapist(ctx context.Context, therapistID string) ([]BlogPost, error)
	GetPublishedPostBySlug(ctx context.Context, therapistID string, slug string) (*BlogPost, error)
	UpsertPost(ctx context.Context, post BlogPost) (*BlogPost, error)
	CreateReview(ctx context.Context, req CreateReviewRequest) (*Review, error)
	ListPublishedReviews(ctx context.Context, therapistID string) ([]Review, error)
	HasReviewForBooking(ctx context.Context, bookingID string) (bool, error)
}

// BlogRepository persists content.blog_posts records.
type BlogRepository interface {
	GetByID(ctx context.Context, id string) (*BlogPost, error)
	ListPublishedByTherapist(ctx context.Context, therapistID string) ([]BlogPost, error)
	ListAllByTherapist(ctx context.Context, therapistID string) ([]BlogPost, error)
	GetPublishedBySlug(ctx context.Context, therapistID string, slug string) (*BlogPost, error)
	Upsert(ctx context.Context, post BlogPost) (*BlogPost, error)
}

// CompletedBookingInfo captures booking ownership and completion status for review gating.
type CompletedBookingInfo struct {
	BookingID    string
	TherapistID  string
	ClientUserID string
	IsCompleted  bool
}

// CompletedBookingChecker verifies that a booking is completed and owned by the reviewer.
type CompletedBookingChecker interface {
	GetBookingForReview(ctx context.Context, bookingID string) (*CompletedBookingInfo, error)
}

// ReviewRepository persists content.reviews records.
type ReviewRepository interface {
	GetByBookingID(ctx context.Context, bookingID string) (*Review, error)
	Create(ctx context.Context, review Review) (*Review, error)
	ListPublishedByTherapist(ctx context.Context, therapistID string) ([]Review, error)
}

// Clock provides current timestamps for posts and reviews.
type Clock interface {
	Now() time.Time
}
