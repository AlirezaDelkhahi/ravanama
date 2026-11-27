package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

var (
	_ media.MediaRepository      = (*MediaRepository)(nil)
	_ media.HeldBookingChecker   = (*MediaRepository)(nil)
	_ media.ReceiptAccessChecker = (*MediaRepository)(nil)
)

// MediaRepository implements media.MediaRepository, HeldBookingChecker, and ReceiptAccessChecker.
type MediaRepository struct {
	pool *pgxpool.Pool
}

// NewMediaRepository constructs a PostgreSQL-backed MediaRepository.
func NewMediaRepository(pool *pgxpool.Pool) *MediaRepository {
	return &MediaRepository{pool: pool}
}

func (r *MediaRepository) Create(ctx context.Context, obj media.MediaObject) error {
	mid, err := parseUUID(obj.ID)
	if err != nil {
		return media.ErrInvalidInput
	}
	uid, err := parseUUID(obj.OwnerUserID)
	if err != nil {
		return media.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).CreateMediaObject(ctx, sqlc.CreateMediaObjectParams{
		ID:          mid,
		OwnerUserID: uid,
		BucketKind:  string(obj.BucketKind),
		ObjectKey:   obj.ObjectKey,
		MimeType:    string(obj.MIMEType),
		SizeBytes:   obj.SizeBytes,
		Status:      string(obj.Status),
		Sha256Hex:   optionalText(obj.SHA256Hex),
		CreatedAt:   pgtype.Timestamptz{Time: obj.CreatedAt.UTC(), Valid: true},
		ConfirmedAt: optionalTimestamptz(obj.ConfirmedAt),
	})
}

func (r *MediaRepository) GetByID(ctx context.Context, id string) (*media.MediaObject, error) {
	mid, err := parseUUID(id)
	if err != nil {
		return nil, media.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetMediaObjectByID(ctx, mid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, media.ErrMediaNotFound
		}
		return nil, err
	}
	return &media.MediaObject{
		ID:          uuidString(row.ID),
		OwnerUserID: uuidString(row.OwnerUserID),
		BucketKind:  media.BucketKind(row.BucketKind),
		ObjectKey:   row.ObjectKey,
		MIMEType:    media.AllowedMIMEType(row.MimeType),
		SizeBytes:   row.SizeBytes,
		Status:      media.MediaStatus(row.Status),
		SHA256Hex:   ptrString(row.Sha256Hex),
		CreatedAt:   row.CreatedAt.Time,
		ConfirmedAt: ptrTime(row.ConfirmedAt),
	}, nil
}

func (r *MediaRepository) MarkConfirmed(ctx context.Context, id string, sha256Hex string, confirmedAt time.Time) error {
	mid, err := parseUUID(id)
	if err != nil {
		return media.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).MarkMediaObjectConfirmed(ctx, sqlc.MarkMediaObjectConfirmedParams{
		ID:          mid,
		Sha256Hex:   pgtype.Text{String: sha256Hex, Valid: true},
		ConfirmedAt: pgtype.Timestamptz{Time: confirmedAt.UTC(), Valid: true},
	})
}

func (r *MediaRepository) MarkDeleted(ctx context.Context, id string) error {
	mid, err := parseUUID(id)
	if err != nil {
		return media.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).MarkMediaObjectDeleted(ctx, mid)
}

func (r *MediaRepository) HasActiveHeldBooking(ctx context.Context, bookingID string, ownerUserID string, now time.Time) (bool, error) {
	bid, err := parseUUID(bookingID)
	if err != nil {
		return false, media.ErrInvalidInput
	}
	uid, err := parseUUID(ownerUserID)
	if err != nil {
		return false, media.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).HasActiveHeldBooking(ctx, sqlc.HasActiveHeldBookingParams{
		ID:            bid,
		ClientUserID:  uid,
		HoldExpiresAt: pgtype.Timestamptz{Time: now.UTC(), Valid: true},
	})
}

func (r *MediaRepository) CanAccessReceipt(ctx context.Context, mediaObjectID string, actorUserID string) (bool, error) {
	mid, err := parseUUID(mediaObjectID)
	if err != nil {
		return false, media.ErrInvalidInput
	}
	uid, err := parseUUID(actorUserID)
	if err != nil {
		return false, media.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).CanAccessReceipt(ctx, sqlc.CanAccessReceiptParams{
		MediaObjectID: mid,
		ClientUserID:  uid,
	})
}
