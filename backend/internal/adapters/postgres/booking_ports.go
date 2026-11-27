package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
)

// BookingLookupAdapters implements cross-domain booking lookup ports against PostgreSQL.
type BookingLookupAdapters struct {
	pool *pgxpool.Pool
}

// NewBookingLookupAdapters constructs PostgreSQL-backed lookup ports for booking.Service.
func NewBookingLookupAdapters(pool *pgxpool.Pool) *BookingLookupAdapters {
	return &BookingLookupAdapters{pool: pool}
}

func (a *BookingLookupAdapters) GetOffering(ctx context.Context, id string) (*booking.OfferingSnapshot, error) {
	oid, err := parseUUID(id)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, a.pool).GetOfferingByID(ctx, oid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, booking.ErrOfferingNotFound
		}
		return nil, err
	}
	return &booking.OfferingSnapshot{
		ID:          uuidString(row.ID),
		TherapistID: uuidString(row.TherapistID),
		Track:       row.Track,
		DurationMin: row.DurationMin,
		Currency:    row.Currency,
		PriceAmount: row.PriceAmount,
		IsActive:    row.IsActive,
	}, nil
}

func (a *BookingLookupAdapters) ListActiveDestinations(ctx context.Context, therapistID string, track string) ([]booking.PaymentDestination, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, a.pool).ListActivePaymentAccountsByTherapistAndTrack(ctx, sqlc.ListActivePaymentAccountsByTherapistAndTrackParams{
		TherapistID: tid,
		Track:       track,
	})
	if err != nil {
		return nil, err
	}
	out := make([]booking.PaymentDestination, len(rows))
	for i, row := range rows {
		out[i] = booking.PaymentDestination{
			ID:             uuidString(row.ID),
			Track:          row.Track,
			Method:         row.Method,
			AccountLabel:   row.AccountLabel,
			DestinationVal: row.DestinationVal,
			HolderName:     row.HolderName,
		}
	}
	return out, nil
}

func (a *BookingLookupAdapters) GetMediaObject(ctx context.Context, id string) (*booking.MediaObjectSnapshot, error) {
	mid, err := parseUUID(id)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, a.pool).GetMediaObjectByID(ctx, mid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, booking.ErrInvalidMedia
		}
		return nil, err
	}
	return &booking.MediaObjectSnapshot{
		ID:          uuidString(row.ID),
		OwnerUserID: uuidString(row.OwnerUserID),
		BucketKind:  row.BucketKind,
		Status:      row.Status,
	}, nil
}
