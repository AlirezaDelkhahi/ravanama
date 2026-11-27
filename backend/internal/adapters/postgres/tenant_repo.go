package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

var (
	_ tenant.TherapistRepository        = (*TenantRepository)(nil)
	_ tenant.DomainRepository           = (*DomainRepository)(nil)
	_ tenant.PaymentAccountRepository   = (*PaymentAccountRepository)(nil)
	_ tenant.TLSDomainChecker           = (*DomainRepository)(nil)
	_ scheduling.TherapistTimezoneReader = (*TenantRepository)(nil)
)

// TenantRepository implements tenant.TherapistRepository and scheduling.TherapistTimezoneReader.
type TenantRepository struct {
	pool *pgxpool.Pool
}

// NewTenantRepository constructs a PostgreSQL-backed TenantRepository.
func NewTenantRepository(pool *pgxpool.Pool) *TenantRepository {
	return &TenantRepository{pool: pool}
}

func (r *TenantRepository) GetByID(ctx context.Context, id string) (*tenant.Therapist, error) {
	tid, err := parseUUID(id)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetTherapistByID(ctx, tid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrTherapistNotFound
		}
		return nil, err
	}
	t := mapTherapistRow(row)
	return &t, nil
}

func (r *TenantRepository) GetByUserID(ctx context.Context, userID string) (*tenant.Therapist, error) {
	uid, err := parseUUID(userID)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetTherapistByUserID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrTherapistNotFound
		}
		return nil, err
	}
	t := mapTherapistRow(row)
	return &t, nil
}

func (r *TenantRepository) GetBySlug(ctx context.Context, slug string) (*tenant.Therapist, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetTherapistBySlug(ctx, slug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrTherapistNotFound
		}
		return nil, err
	}
	t := mapTherapistRow(row)
	return &t, nil
}

func (r *TenantRepository) GetByVerifiedHostname(ctx context.Context, hostname string) (*tenant.Therapist, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetTherapistByVerifiedHostname(ctx, hostname)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrTherapistNotFound
		}
		return nil, err
	}
	t := mapTherapistRow(row)
	return &t, nil
}

func (r *TenantRepository) ListOptedInDirectory(ctx context.Context) ([]tenant.Therapist, error) {
	rows, err := queriesFromCtx(ctx, r.pool).ListOptedInDirectoryTherapists(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]tenant.Therapist, len(rows))
	for i, row := range rows {
		out[i] = mapTherapistRow(row)
	}
	return out, nil
}

func (r *TenantRepository) UpdateProfile(ctx context.Context, t tenant.Therapist) (*tenant.Therapist, error) {
	tid, err := parseUUID(t.ID)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	eduBytes, err := json.Marshal(t.EducationTimeline)
	if err != nil {
		return nil, err
	}
	if len(t.EducationTimeline) == 0 {
		eduBytes = []byte("[]")
	}
	tags := t.FocusTags
	if tags == nil {
		tags = []string{}
	}
	updatedAt := t.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = time.Now().UTC()
	}

	row, err := queriesFromCtx(ctx, r.pool).UpdateTherapistProfile(ctx, sqlc.UpdateTherapistProfileParams{
		ID:                   tid,
		DisplayName:          t.DisplayName,
		Headline:             t.Headline,
		BioMarkdown:          t.BioMarkdown,
		LicenseNumber:        t.LicenseNumber,
		YearsExperience:      t.YearsExperience,
		FocusTags:            tags,
		EducationTimeline:    eduBytes,
		AvatarObjectKey:      optionalText(t.AvatarObjectKey),
		DefaultCallUrl:       optionalText(t.DefaultCallURL),
		DirectoryOptIn:       t.DirectoryOptIn,
		ReviewsEnabled:       t.ReviewsEnabled,
		Timezone:             t.Timezone,
		CancellationPolicyFa: t.CancellationPolicyFa,
		UpdatedAt:            pgtype.Timestamptz{Time: updatedAt.UTC(), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrTherapistNotFound
		}
		return nil, err
	}
	res := mapTherapistRow(row)
	return &res, nil
}

func (r *TenantRepository) GetTherapistTimezone(ctx context.Context, therapistID string) (string, error) {
	t, err := r.GetByID(ctx, therapistID)
	if err != nil {
		return "Asia/Tehran", nil
	}
	if strings.TrimSpace(t.Timezone) == "" {
		return "Asia/Tehran", nil
	}
	return t.Timezone, nil
}

func mapTherapistRow(row sqlc.TenantTherapist) tenant.Therapist {
	var edu []tenant.EducationEntry
	if len(row.EducationTimeline) > 0 {
		_ = json.Unmarshal(row.EducationTimeline, &edu)
	}
	if edu == nil {
		edu = []tenant.EducationEntry{}
	}
	tags := row.FocusTags
	if tags == nil {
		tags = []string{}
	}
	return tenant.Therapist{
		ID:                   uuidString(row.ID),
		UserID:               uuidString(row.UserID),
		Slug:                 row.Slug,
		DisplayName:          row.DisplayName,
		Headline:             row.Headline,
		BioMarkdown:          row.BioMarkdown,
		LicenseNumber:        row.LicenseNumber,
		YearsExperience:      row.YearsExperience,
		FocusTags:            tags,
		EducationTimeline:    edu,
		AvatarObjectKey:      ptrString(row.AvatarObjectKey),
		DefaultCallURL:       ptrString(row.DefaultCallUrl),
		DirectoryOptIn:       row.DirectoryOptIn,
		ReviewsEnabled:       row.ReviewsEnabled,
		Timezone:             row.Timezone,
		CancellationPolicyFa: row.CancellationPolicyFa,
		CreatedAt:            row.CreatedAt.Time,
		UpdatedAt:            row.UpdatedAt.Time,
	}
}

// DomainRepository implements tenant.DomainRepository and tenant.TLSDomainChecker.
type DomainRepository struct {
	pool      *pgxpool.Pool
	txManager *TxManager
}

// NewDomainRepository constructs a PostgreSQL-backed DomainRepository.
func NewDomainRepository(pool *pgxpool.Pool, txManager *TxManager) *DomainRepository {
	return &DomainRepository{pool: pool, txManager: txManager}
}

func (r *DomainRepository) GetByID(ctx context.Context, id string) (*tenant.TenantDomain, error) {
	did, err := parseUUID(id)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetDomainByID(ctx, did)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrDomainNotFound
		}
		return nil, err
	}
	d := mapDomainRow(row)
	return &d, nil
}

func (r *DomainRepository) GetByHostname(ctx context.Context, hostname string) (*tenant.TenantDomain, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetDomainByHostname(ctx, hostname)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrDomainNotFound
		}
		return nil, err
	}
	d := mapDomainRow(row)
	return &d, nil
}

func (r *DomainRepository) ListByTherapist(ctx context.Context, therapistID string) ([]tenant.TenantDomain, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListDomainsByTherapist(ctx, tid)
	if err != nil {
		return nil, err
	}
	out := make([]tenant.TenantDomain, len(rows))
	for i, row := range rows {
		out[i] = mapDomainRow(row)
	}
	return out, nil
}

func (r *DomainRepository) Create(ctx context.Context, d tenant.TenantDomain) error {
	did, err := parseUUID(d.ID)
	if err != nil {
		return tenant.ErrInvalidInput
	}
	tid, err := parseUUID(d.TherapistID)
	if err != nil {
		return tenant.ErrInvalidInput
	}
	err = queriesFromCtx(ctx, r.pool).CreateTenantDomain(ctx, sqlc.CreateTenantDomainParams{
		ID:          did,
		TherapistID: tid,
		Hostname:    d.Hostname,
		IsPrimary:   d.IsPrimary,
		Status:      string(d.Status),
		TxtToken:    d.TXTToken,
		VerifiedAt:  optionalTimestamptz(d.VerifiedAt),
		CreatedAt:   pgtype.Timestamptz{Time: d.CreatedAt.UTC(), Valid: true},
	})
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return tenant.ErrDomainAlreadyClaimed
		}
		return err
	}
	return nil
}

func (r *DomainRepository) MarkVerified(ctx context.Context, id string, isPrimary bool, verifiedAt time.Time) error {
	did, err := parseUUID(id)
	if err != nil {
		return tenant.ErrInvalidInput
	}
	return r.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		q := queriesFromCtx(txCtx, r.pool)
		d, err := q.GetDomainByID(txCtx, did)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return tenant.ErrDomainNotFound
			}
			return err
		}
		if isPrimary {
			if err := q.ClearPrimaryDomainForTherapist(txCtx, sqlc.ClearPrimaryDomainForTherapistParams{
				TherapistID: d.TherapistID,
				ID:          did,
			}); err != nil {
				return err
			}
		}
		return q.MarkDomainVerified(txCtx, sqlc.MarkDomainVerifiedParams{
			ID:         did,
			IsPrimary:  isPrimary,
			VerifiedAt: pgtype.Timestamptz{Time: verifiedAt.UTC(), Valid: true},
		})
	})
}

func (r *DomainRepository) IsVerifiedCustomDomain(ctx context.Context, hostname string) (bool, error) {
	return queriesFromCtx(ctx, r.pool).IsVerifiedCustomDomain(ctx, hostname)
}

func mapDomainRow(row sqlc.TenantTenantDomain) tenant.TenantDomain {
	return tenant.TenantDomain{
		ID:          uuidString(row.ID),
		TherapistID: uuidString(row.TherapistID),
		Hostname:    row.Hostname,
		IsPrimary:   row.IsPrimary,
		Status:      tenant.DomainStatus(row.Status),
		TXTToken:    row.TxtToken,
		VerifiedAt:  ptrTime(row.VerifiedAt),
		CreatedAt:   row.CreatedAt.Time,
	}
}

// PaymentAccountRepository implements tenant.PaymentAccountRepository.
type PaymentAccountRepository struct {
	pool *pgxpool.Pool
}

// NewPaymentAccountRepository constructs a PostgreSQL-backed PaymentAccountRepository.
func NewPaymentAccountRepository(pool *pgxpool.Pool) *PaymentAccountRepository {
	return &PaymentAccountRepository{pool: pool}
}

func (r *PaymentAccountRepository) GetByID(ctx context.Context, id string) (*tenant.PaymentAccount, error) {
	aid, err := parseUUID(id)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetPaymentAccountByID(ctx, aid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrPaymentAccountNotFound
		}
		return nil, err
	}
	acc := mapPaymentAccountRow(row)
	return &acc, nil
}

func (r *PaymentAccountRepository) ListActiveByTherapistAndTrack(ctx context.Context, therapistID string, track tenant.Track) ([]tenant.PaymentAccount, error) {
	tid, err := parseUUID(therapistID)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	rows, err := queriesFromCtx(ctx, r.pool).ListActivePaymentAccountsByTherapistAndTrack(ctx, sqlc.ListActivePaymentAccountsByTherapistAndTrackParams{
		TherapistID: tid,
		Track:       string(track),
	})
	if err != nil {
		return nil, err
	}
	out := make([]tenant.PaymentAccount, len(rows))
	for i, row := range rows {
		out[i] = mapPaymentAccountRow(row)
	}
	return out, nil
}

func (r *PaymentAccountRepository) Upsert(ctx context.Context, acc tenant.PaymentAccount) (*tenant.PaymentAccount, error) {
	idStr := strings.TrimSpace(acc.ID)
	if idStr == "" {
		idStr = uuid.Must(uuid.NewV7()).String()
	}
	aid, err := parseUUID(idStr)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	tid, err := parseUUID(acc.TherapistID)
	if err != nil {
		return nil, tenant.ErrInvalidInput
	}
	now := time.Now().UTC()
	createdAt := acc.CreatedAt
	if createdAt.IsZero() {
		createdAt = now
	}
	updatedAt := acc.UpdatedAt
	if updatedAt.IsZero() {
		updatedAt = now
	}

	row, err := queriesFromCtx(ctx, r.pool).UpsertPaymentAccount(ctx, sqlc.UpsertPaymentAccountParams{
		ID:             aid,
		TherapistID:    tid,
		Track:          string(acc.Track),
		Method:         string(acc.Method),
		AccountLabel:   acc.AccountLabel,
		DestinationVal: acc.DestinationVal,
		HolderName:     acc.HolderName,
		IsActive:       acc.IsActive,
		CreatedAt:      pgtype.Timestamptz{Time: createdAt.UTC(), Valid: true},
		UpdatedAt:      pgtype.Timestamptz{Time: updatedAt.UTC(), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, tenant.ErrForbidden
		}
		return nil, err
	}
	res := mapPaymentAccountRow(row)
	return &res, nil
}

func mapPaymentAccountRow(row sqlc.TenantTherapistPaymentAccount) tenant.PaymentAccount {
	return tenant.PaymentAccount{
		ID:             uuidString(row.ID),
		TherapistID:    uuidString(row.TherapistID),
		Track:          tenant.Track(row.Track),
		Method:         tenant.PaymentMethod(row.Method),
		AccountLabel:   row.AccountLabel,
		DestinationVal: row.DestinationVal,
		HolderName:     row.HolderName,
		IsActive:       row.IsActive,
		CreatedAt:      row.CreatedAt.Time,
		UpdatedAt:      row.UpdatedAt.Time,
	}
}
