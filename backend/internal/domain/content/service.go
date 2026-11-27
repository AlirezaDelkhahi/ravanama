package content

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/google/uuid"
)

var blogSlugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$`)

// Service implements ContentService for SEO blogs and completed-booking reviews.
type Service struct {
	blogs          BlogRepository
	reviews        ReviewRepository
	bookingChecker CompletedBookingChecker
	clock          Clock
}

// NewService constructs a content Service with injected repositories and ports.
func NewService(
	blogs BlogRepository,
	reviews ReviewRepository,
	bookingChecker CompletedBookingChecker,
	clock Clock,
) *Service {
	return &Service{
		blogs:          blogs,
		reviews:        reviews,
		bookingChecker: bookingChecker,
		clock:          clock,
	}
}

func (s *Service) ListPublishedPosts(ctx context.Context, therapistID string) ([]BlogPost, error) {
	if strings.TrimSpace(therapistID) == "" {
		return nil, ErrInvalidInput
	}
	return s.blogs.ListPublishedByTherapist(ctx, therapistID)
}

func (s *Service) ListAllByTherapist(ctx context.Context, therapistID string) ([]BlogPost, error) {
	if strings.TrimSpace(therapistID) == "" {
		return nil, ErrInvalidInput
	}
	return s.blogs.ListAllByTherapist(ctx, therapistID)
}

func (s *Service) GetPublishedPostBySlug(ctx context.Context, therapistID string, slug string) (*BlogPost, error) {
	if strings.TrimSpace(therapistID) == "" || !blogSlugPattern.MatchString(strings.TrimSpace(slug)) {
		return nil, ErrInvalidSlug
	}
	return s.blogs.GetPublishedBySlug(ctx, therapistID, strings.TrimSpace(slug))
}

func (s *Service) UpsertPost(ctx context.Context, post BlogPost) (*BlogPost, error) {
	if strings.TrimSpace(post.TherapistID) == "" ||
		strings.TrimSpace(post.Title) == "" ||
		strings.TrimSpace(post.BodyMarkdown) == "" {
		return nil, ErrInvalidInput
	}
	post.Slug = strings.TrimSpace(post.Slug)
	if !blogSlugPattern.MatchString(post.Slug) {
		return nil, ErrInvalidSlug
	}
	if post.Status != PostStatusDraft && post.Status != PostStatusPublished {
		return nil, ErrInvalidPostStatus
	}
	if post.ReadingMin <= 0 {
		post.ReadingMin = 3
	}
	now := s.clock.Now()
	post.ID = strings.TrimSpace(post.ID)
	if post.ID != "" {
		existing, err := s.blogs.GetByID(ctx, post.ID)
		if err == nil && existing != nil {
			if existing.TherapistID != post.TherapistID {
				return nil, ErrForbidden
			}
			post.CreatedAt = existing.CreatedAt
			if post.PublishedAt == nil && existing.PublishedAt != nil && post.Status == PostStatusPublished {
				post.PublishedAt = existing.PublishedAt
			}
		} else if err != nil && !errors.Is(err, ErrPostNotFound) {
			return nil, err
		}
	}
	if post.Status == PostStatusPublished && post.PublishedAt == nil {
		post.PublishedAt = &now
	}
	if post.ID == "" {
		post.ID = uuid.Must(uuid.NewV7()).String()
		post.CreatedAt = now
	} else if post.CreatedAt.IsZero() {
		post.CreatedAt = now
	}
	post.UpdatedAt = now
	return s.blogs.Upsert(ctx, post)
}

func (s *Service) CreateReview(ctx context.Context, req CreateReviewRequest) (*Review, error) {
	if strings.TrimSpace(req.BookingID) == "" ||
		strings.TrimSpace(req.ClientUserID) == "" ||
		strings.TrimSpace(req.Comment) == "" {
		return nil, ErrInvalidInput
	}
	if req.Rating < 1 || req.Rating > 5 {
		return nil, ErrInvalidRating
	}

	info, err := s.bookingChecker.GetBookingForReview(ctx, req.BookingID)
	if err != nil {
		return nil, err
	}
	if info.ClientUserID != req.ClientUserID {
		return nil, ErrForbidden
	}
	if !info.IsCompleted {
		return nil, ErrBookingNotCompleted
	}

	if existing, err := s.reviews.GetByBookingID(ctx, req.BookingID); err == nil && existing != nil {
		return nil, ErrReviewAlreadyExists
	}

	label := strings.TrimSpace(req.ClientLabel)
	if label == "" {
		label = "مراجع تاییدشده"
	}

	rev := Review{
		ID:          uuid.Must(uuid.NewV7()).String(),
		BookingID:   req.BookingID,
		TherapistID: info.TherapistID,
		ClientLabel: label,
		Rating:      req.Rating,
		Comment:     strings.TrimSpace(req.Comment),
		IsPublished: false,
		CreatedAt:   s.clock.Now(),
	}
	return s.reviews.Create(ctx, rev)
}

func (s *Service) ListPublishedReviews(ctx context.Context, therapistID string) ([]Review, error) {
	if strings.TrimSpace(therapistID) == "" {
		return nil, ErrInvalidInput
	}
	return s.reviews.ListPublishedByTherapist(ctx, therapistID)
}

func (s *Service) HasReviewForBooking(ctx context.Context, bookingID string) (bool, error) {
	if strings.TrimSpace(bookingID) == "" {
		return false, ErrInvalidInput
	}
	rev, err := s.reviews.GetByBookingID(ctx, bookingID)
	if err != nil {
		return false, err
	}
	return rev != nil, nil
}
