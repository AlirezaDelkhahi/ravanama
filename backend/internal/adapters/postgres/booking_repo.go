package postgres

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
)

// BookingRepository implements booking.BookingRepository using PostgreSQL + sqlc.
type BookingRepository struct {
	pool      *pgxpool.Pool
	txManager *TxManager
}

// NewBookingRepository constructs a PostgreSQL-backed BookingRepository.
func NewBookingRepository(pool *pgxpool.Pool, txManager *TxManager) *BookingRepository {
	return &BookingRepository{
		pool:      pool,
		txManager: txManager,
	}
}

func (r *BookingRepository) AcquireClientHoldLock(ctx context.Context, clientUserID string) error {
	cid, err := parseUUID(clientUserID)
	if err != nil {
		return booking.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).AcquireClientHoldLock(ctx, uuidString(cid))
}

func (r *BookingRepository) FindByIdempotencyKey(ctx context.Context, clientUserID string, idempotencyKey string) (*booking.Booking, error) {
	cid, err := parseUUID(clientUserID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).FindBookingByIdempotencyKey(ctx, sqlc.FindBookingByIdempotencyKeyParams{
		ClientUserID:   cid,
		IdempotencyKey: idempotencyKey,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	b := mapBookingRow(row.ID, row.ReferenceCode, row.TherapistID, row.ClientUserID, row.ServiceOfferingID,
		row.ClinicID, row.RoomID, row.PaymentSource, row.Track, row.ClientTimezone,
		row.SlotStart, row.SlotEnd, row.Currency, row.AmountExpected, row.CommissionBps,
		row.Status, row.IdempotencyKey, row.HoldExpiresAt, row.ClientNote,
		row.RejectionReason, row.CallJoinUrl, row.CreatedAt, row.UpdatedAt)
	return &b, nil
}

func (r *BookingRepository) GetByID(ctx context.Context, id string) (*booking.Booking, error) {
	bid, err := parseUUID(id)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetBookingByID(ctx, bid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, booking.ErrBookingNotFound
		}
		return nil, err
	}
	b := mapBookingRow(row.ID, row.ReferenceCode, row.TherapistID, row.ClientUserID, row.ServiceOfferingID,
		row.ClinicID, row.RoomID, row.PaymentSource, row.Track, row.ClientTimezone,
		row.SlotStart, row.SlotEnd, row.Currency, row.AmountExpected, row.CommissionBps,
		row.Status, row.IdempotencyKey, row.HoldExpiresAt, row.ClientNote,
		row.RejectionReason, row.CallJoinUrl, row.CreatedAt, row.UpdatedAt)
	return &b, nil
}

func (r *BookingRepository) GetByIDForUpdate(ctx context.Context, id string) (*booking.Booking, error) {
	bid, err := parseUUID(id)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetBookingByIDForUpdate(ctx, bid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, booking.ErrBookingNotFound
		}
		return nil, err
	}
	b := mapBookingRow(row.ID, row.ReferenceCode, row.TherapistID, row.ClientUserID, row.ServiceOfferingID,
		row.ClinicID, row.RoomID, row.PaymentSource, row.Track, row.ClientTimezone,
		row.SlotStart, row.SlotEnd, row.Currency, row.AmountExpected, row.CommissionBps,
		row.Status, row.IdempotencyKey, row.HoldExpiresAt, row.ClientNote,
		row.RejectionReason, row.CallJoinUrl, row.CreatedAt, row.UpdatedAt)
	return &b, nil
}

func (r *BookingRepository) CountActiveHoldsByClientAndTherapist(ctx context.Context, clientUserID string, therapistID string, now time.Time) (int, error) {
	cid, err := parseUUID(clientUserID)
	if err != nil {
		return 0, booking.ErrInvalidInput
	}
	tid, err := parseUUID(therapistID)
	if err != nil {
		return 0, booking.ErrInvalidInput
	}
	cnt, err := queriesFromCtx(ctx, r.pool).CountActiveHoldsByClientAndTherapist(ctx, sqlc.CountActiveHoldsByClientAndTherapistParams{
		ClientUserID:  cid,
		TherapistID:   tid,
		HoldExpiresAt: pgtype.Timestamptz{Time: now.UTC(), Valid: true},
	})
	if err != nil {
		return 0, err
	}
	return int(cnt), nil
}

func (r *BookingRepository) CreateHold(ctx context.Context, b booking.Booking) (*booking.Booking, error) {
	id, err := parseUUID(b.ID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	tid, err := parseUUID(b.TherapistID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	cid, err := parseUUID(b.ClientUserID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	oid, err := parseUUID(b.ServiceOfferingID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}

	const maxRefRetries = 3
	refCode := b.ReferenceCode
	for attempt := 0; attempt < maxRefRetries; attempt++ {
		params := sqlc.CreateBookingHoldParams{
			ID:                id,
			ReferenceCode:     refCode,
			TherapistID:       tid,
			ClientUserID:      cid,
			ServiceOfferingID: oid,
			ClinicID:          optionalUUID(b.ClinicID),
			RoomID:            optionalUUID(b.RoomID),
			PaymentSource:     string(b.PaymentSource),
			Track:             b.Track,
			ClientTimezone:    b.ClientTimezone,
			SlotStart:         pgtype.Timestamptz{Time: b.SlotStart.UTC(), Valid: true},
			SlotEnd:           pgtype.Timestamptz{Time: b.SlotEnd.UTC(), Valid: true},
			Currency:          b.Currency,
			AmountExpected:    b.AmountExpected,
			CommissionBps:     b.CommissionBPS,
			Status:            string(b.Status),
			IdempotencyKey:    b.IdempotencyKey,
			HoldExpiresAt:     optionalTimestamptz(b.HoldExpiresAt),
			ClientNote:        b.ClientNote,
			CreatedAt:         pgtype.Timestamptz{Time: b.CreatedAt.UTC(), Valid: true},
			UpdatedAt:         pgtype.Timestamptz{Time: b.UpdatedAt.UTC(), Valid: true},
		}

		var (
			row sqlc.CreateBookingHoldRow
			err error
		)
		if tx, ok := ctx.Value(txContextKey{}).(pgx.Tx); ok && tx != nil {
			subTx, subErr := tx.Begin(ctx)
			if subErr != nil {
				return nil, subErr
			}
			row, err = sqlc.New(subTx).CreateBookingHold(ctx, params)
			if err != nil {
				_ = subTx.Rollback(ctx)
			} else if commitErr := subTx.Commit(ctx); commitErr != nil {
				return nil, commitErr
			}
		} else {
			row, err = queriesFromCtx(ctx, r.pool).CreateBookingHold(ctx, params)
		}

		if err != nil {
			var pgErr *pgconn.PgError
			if errors.As(err, &pgErr) {
				if pgErr.Code == "23P01" {
					return nil, booking.ErrSlotConflict
				}
				if pgErr.Code == "23505" && strings.Contains(pgErr.ConstraintName, "reference_code") && attempt < maxRefRetries-1 {
					nextRef, genErr := generateRandomRefCode()
					if genErr != nil {
						return nil, genErr
					}
					refCode = nextRef
					continue
				}
			}
			return nil, err
		}

		created := mapBookingRow(row.ID, row.ReferenceCode, row.TherapistID, row.ClientUserID, row.ServiceOfferingID,
			row.ClinicID, row.RoomID, row.PaymentSource, row.Track, row.ClientTimezone,
			row.SlotStart, row.SlotEnd, row.Currency, row.AmountExpected, row.CommissionBps,
			row.Status, row.IdempotencyKey, row.HoldExpiresAt, row.ClientNote,
			row.RejectionReason, row.CallJoinUrl, row.CreatedAt, row.UpdatedAt)
		return &created, nil
	}
	return nil, booking.ErrInvalidInput
}

func generateRandomRefCode() (string, error) {
	buf := make([]byte, 3)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "RN-" + strings.ToUpper(hex.EncodeToString(buf)), nil
}

func (r *BookingRepository) UpdateStatus(ctx context.Context, id string, status booking.BookingStatus, rejectionReason *string, callJoinURL *string, updatedAt time.Time) error {
	bid, err := parseUUID(id)
	if err != nil {
		return booking.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).UpdateBookingStatus(ctx, sqlc.UpdateBookingStatusParams{
		ID:              bid,
		Status:          string(status),
		RejectionReason: optionalText(rejectionReason),
		CallJoinUrl:     optionalText(callJoinURL),
		UpdatedAt:       pgtype.Timestamptz{Time: updatedAt.UTC(), Valid: true},
	})
}

func (r *BookingRepository) CreateReceipt(ctx context.Context, rec booking.BookingReceipt) error {
	id, err := parseUUID(rec.ID)
	if err != nil {
		return booking.ErrInvalidInput
	}
	bid, err := parseUUID(rec.BookingID)
	if err != nil {
		return booking.ErrInvalidInput
	}
	mid, err := parseUUID(rec.MediaObjectID)
	if err != nil {
		return booking.ErrInvalidInput
	}
	err = queriesFromCtx(ctx, r.pool).CreateBookingReceipt(ctx, sqlc.CreateBookingReceiptParams{
		ID:            id,
		BookingID:     bid,
		MediaObjectID: mid,
		TrackingCode:  rec.TrackingCode,
		SubmittedAt:   pgtype.Timestamptz{Time: rec.SubmittedAt.UTC(), Valid: true},
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			if strings.Contains(pgErr.ConstraintName, "media_object_id") {
				return booking.ErrReceiptAlreadyUsed
			}
			return booking.ErrInvalidTransition
		}
		return err
	}
	return nil
}

func (r *BookingRepository) GetReceiptByBookingID(ctx context.Context, bookingID string) (*booking.BookingReceipt, error) {
	bid, err := parseUUID(bookingID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetBookingReceiptByBookingID(ctx, bid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, booking.ErrBookingNotFound
		}
		return nil, err
	}
	return &booking.BookingReceipt{
		ID:            uuidString(row.ID),
		BookingID:     uuidString(row.BookingID),
		MediaObjectID: uuidString(row.MediaObjectID),
		TrackingCode:  row.TrackingCode,
		SubmittedAt:   row.SubmittedAt.Time,
	}, nil
}

func (r *BookingRepository) AppendStatusEvent(ctx context.Context, ev booking.BookingStatusEvent) error {
	id, err := parseUUID(ev.ID)
	if err != nil {
		return booking.ErrInvalidInput
	}
	bid, err := parseUUID(ev.BookingID)
	if err != nil {
		return booking.ErrInvalidInput
	}
	var from pgtype.Text
	if ev.FromStatus != nil {
		from = pgtype.Text{String: string(*ev.FromStatus), Valid: true}
	}
	return queriesFromCtx(ctx, r.pool).AppendBookingStatusEvent(ctx, sqlc.AppendBookingStatusEventParams{
		ID:          id,
		BookingID:   bid,
		ActorUserID: optionalUUID(ev.ActorUserID),
		FromStatus:  from,
		ToStatus:    string(ev.ToStatus),
		Reason:      ev.Reason,
		CreatedAt:   pgtype.Timestamptz{Time: ev.CreatedAt.UTC(), Valid: true},
	})
}

func (r *BookingRepository) ExpireStaleHoldsBatch(ctx context.Context, cutoff time.Time, limit int) (int, error) {
	swept := 0
	err := r.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		q := queriesFromCtx(txCtx, r.pool)
		ts := pgtype.Timestamptz{Time: cutoff.UTC(), Valid: true}
		ids, err := q.ListStaleHoldIDsForUpdateSkipLocked(txCtx, sqlc.ListStaleHoldIDsForUpdateSkipLockedParams{
			HoldExpiresAt: ts,
			Limit:         int32(limit),
		})
		if err != nil {
			return err
		}
		for _, bid := range ids {
			if err := q.ExpireBookingHoldByID(txCtx, sqlc.ExpireBookingHoldByIDParams{
				ID:        bid,
				UpdatedAt: ts,
			}); err != nil {
				return err
			}
			evID := uuid.Must(uuid.NewV7())
			if err := q.AppendBookingStatusEvent(txCtx, sqlc.AppendBookingStatusEventParams{
				ID:         pgtype.UUID{Bytes: evID, Valid: true},
				BookingID:  bid,
				FromStatus: pgtype.Text{String: string(booking.StatusHeld), Valid: true},
				ToStatus:   string(booking.StatusExpired),
				Reason:     "hold_ttl_expired",
				CreatedAt:  ts,
			}); err != nil {
				return err
			}
			swept++
		}
		return nil
	})
	return swept, err
}

func (r *BookingRepository) ListByTherapist(ctx context.Context, therapistID string, status *booking.BookingStatus) ([]booking.Booking, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	var statusArg pgtype.Text
	if status != nil {
		statusArg = pgtype.Text{String: string(*status), Valid: true}
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListBookingsByTherapist(ctx, sqlc.ListBookingsByTherapistParams{
		TherapistID: tid,
		Status:      statusArg,
	})
	if err != nil {
		return nil, err
	}
	out := make([]booking.Booking, len(rows))
	for i, row := range rows {
		out[i] = mapBookingRow(row.ID, row.ReferenceCode, row.TherapistID, row.ClientUserID, row.ServiceOfferingID,
			row.ClinicID, row.RoomID, row.PaymentSource, row.Track, row.ClientTimezone,
			row.SlotStart, row.SlotEnd, row.Currency, row.AmountExpected, row.CommissionBps,
			row.Status, row.IdempotencyKey, row.HoldExpiresAt, row.ClientNote,
			row.RejectionReason, row.CallJoinUrl, row.CreatedAt, row.UpdatedAt)
	}
	return out, nil
}

func (r *BookingRepository) ListByClient(ctx context.Context, clientUserID string) ([]booking.Booking, error) {
	cid, err := parseUUID(clientUserID)
	if err != nil {
		return nil, booking.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListBookingsByClient(ctx, cid)
	if err != nil {
		return nil, err
	}
	out := make([]booking.Booking, len(rows))
	for i, row := range rows {
		out[i] = mapBookingRow(row.ID, row.ReferenceCode, row.TherapistID, row.ClientUserID, row.ServiceOfferingID,
			row.ClinicID, row.RoomID, row.PaymentSource, row.Track, row.ClientTimezone,
			row.SlotStart, row.SlotEnd, row.Currency, row.AmountExpected, row.CommissionBps,
			row.Status, row.IdempotencyKey, row.HoldExpiresAt, row.ClientNote,
			row.RejectionReason, row.CallJoinUrl, row.CreatedAt, row.UpdatedAt)
	}
	return out, nil
}

func mapBookingRow(
	id pgtype.UUID,
	refCode string,
	therapistID, clientUserID, offeringID, clinicID, roomID pgtype.UUID,
	paymentSource, track, clientTZ string,
	slotStart, slotEnd pgtype.Timestamptz,
	currency string,
	amountExpected int64,
	commissionBPS int32,
	status, idempotencyKey string,
	holdExpiresAt pgtype.Timestamptz,
	clientNote string,
	rejectionReason, callJoinURL pgtype.Text,
	createdAt, updatedAt pgtype.Timestamptz,
) booking.Booking {
	return booking.Booking{
		ID:                uuidString(id),
		ReferenceCode:     refCode,
		TherapistID:       uuidString(therapistID),
		ClientUserID:      uuidString(clientUserID),
		ServiceOfferingID: uuidString(offeringID),
		ClinicID:          ptrUUIDString(clinicID),
		RoomID:            ptrUUIDString(roomID),
		PaymentSource:     booking.PaymentSource(paymentSource),
		Track:             track,
		ClientTimezone:    clientTZ,
		SlotStart:         slotStart.Time,
		SlotEnd:           slotEnd.Time,
		Currency:          currency,
		AmountExpected:    amountExpected,
		CommissionBPS:     commissionBPS,
		Status:            booking.BookingStatus(status),
		IdempotencyKey:    idempotencyKey,
		HoldExpiresAt:     ptrTime(holdExpiresAt),
		ClientNote:        clientNote,
		RejectionReason:   ptrString(rejectionReason),
		CallJoinURL:       ptrString(callJoinURL),
		CreatedAt:         createdAt.Time,
		UpdatedAt:         updatedAt.Time,
	}
}

func parseUUID(s string) (pgtype.UUID, error) {
	u, err := uuid.Parse(strings.TrimSpace(s))
	if err != nil {
		return pgtype.UUID{}, err
	}
	return pgtype.UUID{Bytes: u, Valid: true}, nil
}

func optionalUUID(s *string) pgtype.UUID {
	if s == nil || strings.TrimSpace(*s) == "" {
		return pgtype.UUID{Valid: false}
	}
	u, err := parseUUID(*s)
	if err != nil {
		return pgtype.UUID{Valid: false}
	}
	return u
}

func optionalTimestamptz(t *time.Time) pgtype.Timestamptz {
	if t == nil {
		return pgtype.Timestamptz{Valid: false}
	}
	return pgtype.Timestamptz{Time: t.UTC(), Valid: true}
}

func optionalText(s *string) pgtype.Text {
	if s == nil {
		return pgtype.Text{Valid: false}
	}
	return pgtype.Text{String: *s, Valid: true}
}

func uuidString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return uuid.UUID(u.Bytes).String()
}

func ptrUUIDString(u pgtype.UUID) *string {
	if !u.Valid {
		return nil
	}
	s := uuid.UUID(u.Bytes).String()
	return &s
}

func ptrTime(ts pgtype.Timestamptz) *time.Time {
	if !ts.Valid {
		return nil
	}
	t := ts.Time
	return &t
}

func ptrString(t pgtype.Text) *string {
	if !t.Valid {
		return nil
	}
	s := t.String
	return &s
}
