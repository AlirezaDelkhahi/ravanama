package postgres

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
)

var (
	_ scheduling.OfferingRepository   = (*OfferingRepository)(nil)
	_ scheduling.WeeklyRuleRepository = (*WeeklyRuleRepository)(nil)
	_ scheduling.OverrideRepository   = (*OverrideRepository)(nil)
	_ scheduling.BusySlotReader       = (*BusySlotReader)(nil)
)

// OfferingRepository implements scheduling.OfferingRepository.
type OfferingRepository struct {
	pool *pgxpool.Pool
}

// NewOfferingRepository constructs a PostgreSQL-backed OfferingRepository.
func NewOfferingRepository(pool *pgxpool.Pool) *OfferingRepository {
	return &OfferingRepository{pool: pool}
}

func (r *OfferingRepository) GetByID(ctx context.Context, id string) (*scheduling.ServiceOffering, error) {
	oid, err := parseUUID(id)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetOfferingByID(ctx, oid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, scheduling.ErrOfferingNotFound
		}
		return nil, err
	}
	o := mapOfferingRow(row)
	return &o, nil
}

func (r *OfferingRepository) ListActiveByTherapist(ctx context.Context, therapistID string, track string) ([]scheduling.ServiceOffering, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListActiveOfferingsByTherapist(ctx, sqlc.ListActiveOfferingsByTherapistParams{
		TherapistID: tid,
		Track:       track,
	})
	if err != nil {
		return nil, err
	}
	out := make([]scheduling.ServiceOffering, len(rows))
	for i, row := range rows {
		out[i] = mapOfferingRow(row)
	}
	return out, nil
}

func (r *OfferingRepository) Upsert(ctx context.Context, offering scheduling.ServiceOffering) (*scheduling.ServiceOffering, error) {
	idStr := strings.TrimSpace(offering.ID)
	if idStr == "" {
		idStr = uuid.Must(uuid.NewV7()).String()
	}
	oid, err := parseUUID(idStr)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	tid, err := parseUUID(offering.TherapistID)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	createdAt := offering.CreatedAt
	if createdAt.IsZero() {
		createdAt = time.Now().UTC()
	}
	row, err := queriesFromCtx(ctx, r.pool).UpsertOffering(ctx, sqlc.UpsertOfferingParams{
		ID:          oid,
		TherapistID: tid,
		Track:       offering.Track,
		Title:       offering.Title,
		Description: offering.Description,
		DurationMin: offering.DurationMin,
		Currency:    string(offering.Currency),
		PriceAmount: offering.PriceAmount,
		IsActive:    offering.IsActive,
		SortOrder:   offering.SortOrder,
		CreatedAt:   pgtype.Timestamptz{Time: createdAt.UTC(), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, scheduling.ErrForbidden
		}
		return nil, err
	}
	o := mapOfferingRow(row)
	return &o, nil
}

// WeeklyRuleRepository implements scheduling.WeeklyRuleRepository.
type WeeklyRuleRepository struct {
	pool      *pgxpool.Pool
	txManager *TxManager
}

// NewWeeklyRuleRepository constructs a PostgreSQL-backed WeeklyRuleRepository.
func NewWeeklyRuleRepository(pool *pgxpool.Pool, txManager *TxManager) *WeeklyRuleRepository {
	return &WeeklyRuleRepository{pool: pool, txManager: txManager}
}

func (r *WeeklyRuleRepository) ListActiveByTherapist(ctx context.Context, therapistID string) ([]scheduling.WeeklyAvailabilityRule, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListActiveWeeklyRulesByTherapist(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]scheduling.WeeklyAvailabilityRule, len(rows))
	for i, row := range rows {
		out[i] = scheduling.WeeklyAvailabilityRule{
			ID:          uuidString(row.ID),
			TherapistID: uuidString(row.TherapistID),
			WeekdaySat0: row.WeekdaySat0,
			StartMinute: row.StartMinute,
			EndMinute:   row.EndMinute,
			BufferMin:   row.BufferMin,
			MinNoticeHr: row.MinNoticeHr,
			IsActive:    row.IsActive,
		}
	}
	return out, nil
}

func (r *WeeklyRuleRepository) ReplaceForTherapist(ctx context.Context, therapistID string, rules []scheduling.WeeklyAvailabilityRule) error {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return scheduling.ErrInvalidInput
	}
	return r.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		q := queriesFromCtx(txCtx, r.pool)
		if err := q.DeleteWeeklyRulesByTherapist(txCtx, tid); err != nil {
			return err
		}
		for _, rule := range rules {
			ridStr := strings.TrimSpace(rule.ID)
			if ridStr == "" {
				ridStr = uuid.Must(uuid.NewV7()).String()
			}
			rid, err := parseUUID(ridStr)
			if err != nil {
				return scheduling.ErrInvalidInput
			}
			if err := q.InsertWeeklyRule(txCtx, sqlc.InsertWeeklyRuleParams{
				ID:          rid,
				TherapistID: tid,
				WeekdaySat0: rule.WeekdaySat0,
				StartMinute: rule.StartMinute,
				EndMinute:   rule.EndMinute,
				BufferMin:   rule.BufferMin,
				MinNoticeHr: rule.MinNoticeHr,
				IsActive:    rule.IsActive,
			}); err != nil {
				return err
			}
		}
		return nil
	})
}

// OverrideRepository implements scheduling.OverrideRepository.
type OverrideRepository struct {
	pool      *pgxpool.Pool
	txManager *TxManager
}

// NewOverrideRepository constructs a PostgreSQL-backed OverrideRepository.
func NewOverrideRepository(pool *pgxpool.Pool, txManager *TxManager) *OverrideRepository {
	if txManager == nil && pool != nil {
		txManager = NewTxManager(pool)
	}
	return &OverrideRepository{pool: pool, txManager: txManager}
}

func (r *OverrideRepository) GetByID(ctx context.Context, id string) (*scheduling.AvailabilityOverride, error) {
	oid, err := parseUUID(id)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetOverrideByID(ctx, oid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, scheduling.ErrOverrideNotFound
		}
		return nil, err
	}
	ov := mapOverrideRow(row)
	return &ov, nil
}

func (r *OverrideRepository) ListByTherapistInRange(ctx context.Context, therapistID string, from time.Time, to time.Time) ([]scheduling.AvailabilityOverride, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	fromDate := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	toDate := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC)

	rows, err := queriesFromCtx(ctx, r.pool).ListOverridesByTherapistInRange(ctx, sqlc.ListOverridesByTherapistInRangeParams{
		TherapistID:    tid,
		OverrideDate:   pgtype.Date{Time: fromDate, Valid: true},
		OverrideDate_2: pgtype.Date{Time: toDate, Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]scheduling.AvailabilityOverride, len(rows))
	for i, row := range rows {
		out[i] = mapOverrideRow(row)
	}
	return out, nil
}

func (r *OverrideRepository) Upsert(ctx context.Context, ov scheduling.AvailabilityOverride) (*scheduling.AvailabilityOverride, error) {
	idStr := strings.TrimSpace(ov.ID)
	idWasEmpty := idStr == ""
	if idWasEmpty {
		idStr = uuid.Must(uuid.NewV7()).String()
	}
	oid, err := parseUUID(idStr)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	tid, err := parseUUID(ov.TherapistID)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	ovDate := time.Date(ov.OverrideDate.Year(), ov.OverrideDate.Month(), ov.OverrideDate.Day(), 0, 0, 0, 0, time.UTC)
	ovDateParam := pgtype.Date{Time: ovDate, Valid: true}

	var result scheduling.AvailabilityOverride
	txErr := r.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		q := queriesFromCtx(txCtx, r.pool)
		if !idWasEmpty {
			existing, getErr := q.GetOverrideByID(txCtx, oid)
			if getErr == nil {
				if existing.TherapistID != tid {
					return scheduling.ErrForbidden
				}
			} else if !errors.Is(getErr, pgx.ErrNoRows) {
				return getErr
			}
		}

		if ov.IsClosed || idWasEmpty {
			if err := q.DeleteOverridesByTherapistAndDateExceptID(txCtx, sqlc.DeleteOverridesByTherapistAndDateExceptIDParams{
				TherapistID:  tid,
				OverrideDate: ovDateParam,
				ID:           oid,
			}); err != nil {
				return err
			}
		} else {
			if err := q.DeleteClosedOverrideByTherapistAndDateExceptID(txCtx, sqlc.DeleteClosedOverrideByTherapistAndDateExceptIDParams{
				TherapistID:  tid,
				OverrideDate: ovDateParam,
				ID:           oid,
			}); err != nil {
				return err
			}
			if ov.StartMinute != nil {
				if err := q.DeleteOverrideByTherapistDateStartMinuteExceptID(txCtx, sqlc.DeleteOverrideByTherapistDateStartMinuteExceptIDParams{
					TherapistID:  tid,
					OverrideDate: ovDateParam,
					StartMinute:  pgtype.Int2{Int16: *ov.StartMinute, Valid: true},
					ID:           oid,
				}); err != nil {
					return err
				}
			}
		}

		row, err := q.UpsertOverride(txCtx, sqlc.UpsertOverrideParams{
			ID:           oid,
			TherapistID:  tid,
			OverrideDate: ovDateParam,
			IsClosed:     ov.IsClosed,
			StartMinute:  optionalInt2(ov.StartMinute),
			EndMinute:    optionalInt2(ov.EndMinute),
			Reason:       ov.Reason,
		})
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return scheduling.ErrForbidden
			}
			return err
		}
		result = mapOverrideRow(row)
		return nil
	})
	if txErr != nil {
		return nil, txErr
	}
	return &result, nil
}

// BusySlotReader implements scheduling.BusySlotReader.
type BusySlotReader struct {
	pool *pgxpool.Pool
}

// NewBusySlotReader constructs a PostgreSQL-backed BusySlotReader.
func NewBusySlotReader(pool *pgxpool.Pool) *BusySlotReader {
	return &BusySlotReader{pool: pool}
}

func (r *BusySlotReader) ListBusySlots(ctx context.Context, therapistID string, from time.Time, to time.Time) ([]scheduling.BusySlot, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, scheduling.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListBusySlotRangesByTherapist(ctx, sqlc.ListBusySlotRangesByTherapistParams{
		TherapistID: tid,
		RangeStart:  pgtype.Timestamptz{Time: from.UTC(), Valid: true},
		RangeEnd:    pgtype.Timestamptz{Time: to.UTC(), Valid: true},
	})
	if err != nil {
		return nil, err
	}
	out := make([]scheduling.BusySlot, len(rows))
	for i, row := range rows {
		out[i] = scheduling.BusySlot{
			StartAt: row.SlotStart.Time,
			EndAt:   row.SlotEnd.Time,
		}
	}
	return out, nil
}

func mapOfferingRow(row sqlc.SchedulingServiceOffering) scheduling.ServiceOffering {
	return scheduling.ServiceOffering{
		ID:          uuidString(row.ID),
		TherapistID: uuidString(row.TherapistID),
		Track:       row.Track,
		Title:       row.Title,
		Description: row.Description,
		DurationMin: row.DurationMin,
		Currency:    scheduling.Currency(row.Currency),
		PriceAmount: row.PriceAmount,
		IsActive:    row.IsActive,
		SortOrder:   row.SortOrder,
		CreatedAt:   row.CreatedAt.Time,
	}
}

func mapOverrideRow(row sqlc.SchedulingAvailabilityOverride) scheduling.AvailabilityOverride {
	return scheduling.AvailabilityOverride{
		ID:           uuidString(row.ID),
		TherapistID:  uuidString(row.TherapistID),
		OverrideDate: row.OverrideDate.Time,
		IsClosed:     row.IsClosed,
		StartMinute:  ptrInt16(row.StartMinute),
		EndMinute:    ptrInt16(row.EndMinute),
		Reason:       row.Reason,
	}
}

func optionalInt2(v *int16) pgtype.Int2 {
	if v == nil {
		return pgtype.Int2{Valid: false}
	}
	return pgtype.Int2{Int16: *v, Valid: true}
}

func ptrInt16(v pgtype.Int2) *int16 {
	if !v.Valid {
		return nil
	}
	val := v.Int16
	return &val
}
