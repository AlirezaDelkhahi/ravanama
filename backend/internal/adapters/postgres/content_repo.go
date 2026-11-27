package postgres

import (
	"context"
	"errors"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
)

var (
	_ content.BlogRepository          = (*BlogRepository)(nil)
	_ content.ReviewRepository        = (*ReviewRepository)(nil)
	_ content.CompletedBookingChecker = (*ReviewRepository)(nil)
)

// BlogRepository implements content.BlogRepository using PostgreSQL + sqlc.
type BlogRepository struct {
	pool *pgxpool.Pool
}

// NewBlogRepository constructs a PostgreSQL-backed BlogRepository.
func NewBlogRepository(pool *pgxpool.Pool) *BlogRepository {
	return &BlogRepository{pool: pool}
}

func (r *BlogRepository) GetByID(ctx context.Context, id string) (*content.BlogPost, error) {
	pid, err := parseUUID(id)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetBlogPostByID(ctx, pid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, content.ErrPostNotFound
		}
		return nil, err
	}
	p := mapBlogPostRow(row)
	return &p, nil
}

func (r *BlogRepository) ListPublishedByTherapist(ctx context.Context, therapistID string) ([]content.BlogPost, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListPublishedBlogPostsByTherapist(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]content.BlogPost, len(rows))
	for i, row := range rows {
		out[i] = mapBlogPostRow(row)
	}
	return out, nil
}

func (r *BlogRepository) ListAllByTherapist(ctx context.Context, therapistID string) ([]content.BlogPost, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListAllBlogPostsByTherapist(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]content.BlogPost, len(rows))
	for i, row := range rows {
		out[i] = mapBlogPostRow(row)
	}
	return out, nil
}

func (r *BlogRepository) GetPublishedBySlug(ctx context.Context, therapistID string, slug string) (*content.BlogPost, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetPublishedBlogPostBySlug(ctx, sqlc.GetPublishedBlogPostBySlugParams{
		TherapistID: tid,
		Slug:        slug,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, content.ErrPostNotFound
		}
		return nil, err
	}
	p := mapBlogPostRow(row)
	return &p, nil
}

func (r *BlogRepository) Upsert(ctx context.Context, post content.BlogPost) (*content.BlogPost, error) {
	idStr := strings.TrimSpace(post.ID)
	if idStr == "" {
		idStr = uuid.Must(uuid.NewV7()).String()
	}
	pid, err := parseUUID(idStr)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	tid, err := parseUUID(post.TherapistID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	createdAt := post.CreatedAt
	if createdAt.IsZero() {
		createdAt = post.UpdatedAt
	}
	row, err := queriesFromCtx(ctx, r.pool).UpsertBlogPost(ctx, sqlc.UpsertBlogPostParams{
		ID:             pid,
		TherapistID:    tid,
		Slug:           post.Slug,
		Title:          post.Title,
		Excerpt:        post.Excerpt,
		BodyMarkdown:   post.BodyMarkdown,
		CoverObjectKey: optionalText(post.CoverObjectKey),
		SeoTitle:       post.SEOTitle,
		SeoDescription: post.SEODescription,
		ReadingMin:     post.ReadingMin,
		Status:         string(post.Status),
		PublishedAt:    optionalTimestamptz(post.PublishedAt),
		CreatedAt:      pgtype.Timestamptz{Time: createdAt.UTC(), Valid: true},
		UpdatedAt:      pgtype.Timestamptz{Time: post.UpdatedAt.UTC(), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, content.ErrForbidden
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, content.ErrSlugConflict
		}
		return nil, err
	}
	p := mapBlogPostRow(row)
	return &p, nil
}

// ReviewRepository implements content.ReviewRepository and content.CompletedBookingChecker.
type ReviewRepository struct {
	pool *pgxpool.Pool
}

// NewReviewRepository constructs a PostgreSQL-backed ReviewRepository.
func NewReviewRepository(pool *pgxpool.Pool) *ReviewRepository {
	return &ReviewRepository{pool: pool}
}

func (r *ReviewRepository) GetByBookingID(ctx context.Context, bookingID string) (*content.Review, error) {
	bid, err := parseUUID(bookingID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetReviewByBookingID(ctx, bid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	rev := mapReviewRow(row)
	return &rev, nil
}

func (r *ReviewRepository) Create(ctx context.Context, rev content.Review) (*content.Review, error) {
	rid, err := parseUUID(rev.ID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	bid, err := parseUUID(rev.BookingID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	tid, err := parseUUID(rev.TherapistID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).CreateReview(ctx, sqlc.CreateReviewParams{
		ID:          rid,
		BookingID:   bid,
		TherapistID: tid,
		ClientLabel: rev.ClientLabel,
		Rating:      rev.Rating,
		Comment:     rev.Comment,
		IsPublished: rev.IsPublished,
		CreatedAt:   pgtype.Timestamptz{Time: rev.CreatedAt.UTC(), Valid: true},
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return nil, content.ErrReviewAlreadyExists
		}
		return nil, err
	}
	res := mapReviewRow(row)
	return &res, nil
}

func (r *ReviewRepository) ListPublishedByTherapist(ctx context.Context, therapistID string) ([]content.Review, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListPublishedReviewsByTherapist(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]content.Review, len(rows))
	for i, row := range rows {
		out[i] = mapReviewRow(row)
	}
	return out, nil
}

func (r *ReviewRepository) GetBookingForReview(ctx context.Context, bookingID string) (*content.CompletedBookingInfo, error) {
	bid, err := parseUUID(bookingID)
	if err != nil {
		return nil, content.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetBookingByID(ctx, bid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, content.ErrBookingNotFound
		}
		return nil, err
	}
	return &content.CompletedBookingInfo{
		BookingID:    uuidString(row.ID),
		TherapistID:  uuidString(row.TherapistID),
		ClientUserID: uuidString(row.ClientUserID),
		IsCompleted:  row.Status == "completed",
	}, nil
}

func mapBlogPostRow(row sqlc.ContentBlogPost) content.BlogPost {
	return content.BlogPost{
		ID:             uuidString(row.ID),
		TherapistID:    uuidString(row.TherapistID),
		Slug:           row.Slug,
		Title:          row.Title,
		Excerpt:        row.Excerpt,
		BodyMarkdown:   row.BodyMarkdown,
		CoverObjectKey: ptrString(row.CoverObjectKey),
		SEOTitle:       row.SeoTitle,
		SEODescription: row.SeoDescription,
		ReadingMin:     row.ReadingMin,
		Status:         content.PostStatus(row.Status),
		PublishedAt:    ptrTime(row.PublishedAt),
		CreatedAt:      row.CreatedAt.Time,
		UpdatedAt:      row.UpdatedAt.Time,
	}
}

func mapReviewRow(row sqlc.ContentReview) content.Review {
	return content.Review{
		ID:          uuidString(row.ID),
		BookingID:   uuidString(row.BookingID),
		TherapistID: uuidString(row.TherapistID),
		ClientLabel: row.ClientLabel,
		Rating:      row.Rating,
		Comment:     row.Comment,
		IsPublished: row.IsPublished,
		CreatedAt:   row.CreatedAt.Time,
	}
}
