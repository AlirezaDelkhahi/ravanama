package postgres

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
)

var (
	_ identity.UserRepository         = (*IdentityRepository)(nil)
	_ identity.OTPChallengeRepository = (*IdentityRepository)(nil)
)

// IdentityRepository implements identity user, OTP challenge, and session repositories.
type IdentityRepository struct {
	pool *pgxpool.Pool
}

// NewIdentityRepository constructs a PostgreSQL-backed IdentityRepository.
func NewIdentityRepository(pool *pgxpool.Pool) *IdentityRepository {
	return &IdentityRepository{pool: pool}
}

// --- UserRepository ---

func (r *IdentityRepository) GetByID(ctx context.Context, id string) (*identity.User, error) {
	uid, err := parseUUID(id)
	if err != nil {
		return nil, identity.ErrInvalidInput
	}
	row, err := queriesFromCtx(ctx, r.pool).GetUserByID(ctx, uid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, identity.ErrUserNotFound
		}
		return nil, err
	}
	u := mapIdentityUser(row)
	return &u, nil
}

func (r *IdentityRepository) GetByPhoneE164(ctx context.Context, phoneE164 string) (*identity.User, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetUserByPhoneE164(ctx, pgtype.Text{String: phoneE164, Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, identity.ErrUserNotFound
		}
		return nil, err
	}
	u := mapIdentityUser(row)
	return &u, nil
}

func (r *IdentityRepository) GetByEmail(ctx context.Context, email string) (*identity.User, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetUserByEmail(ctx, pgtype.Text{String: email, Valid: true})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, identity.ErrUserNotFound
		}
		return nil, err
	}
	u := mapIdentityUser(row)
	return &u, nil
}

func (r *IdentityRepository) UpsertClientByVerifiedChannel(ctx context.Context, channel identity.Channel, destination string, fullName string, locale string) (*identity.User, error) {
	if locale == "" {
		locale = "fa-IR"
	}
	id := pgtype.UUID{Bytes: uuid.Must(uuid.NewV7()), Valid: true}
	q := queriesFromCtx(ctx, r.pool)

	switch channel {
	case identity.ChannelSMS:
		row, err := q.UpsertClientByPhone(ctx, sqlc.UpsertClientByPhoneParams{
			ID:        id,
			FullName:  fullName,
			PhoneE164: pgtype.Text{String: destination, Valid: true},
			Locale:    locale,
		})
		if err != nil {
			return nil, err
		}
		u := mapIdentityUser(row)
		return &u, nil
	case identity.ChannelEmail:
		row, err := q.UpsertClientByEmail(ctx, sqlc.UpsertClientByEmailParams{
			ID:       id,
			FullName: fullName,
			Email:    pgtype.Text{String: destination, Valid: true},
			Locale:   locale,
		})
		if err != nil {
			return nil, err
		}
		u := mapIdentityUser(row)
		return &u, nil
	default:
		return nil, identity.ErrInvalidChannel
	}
}

// --- OTPChallengeRepository ---

func (r *IdentityRepository) Create(ctx context.Context, challenge identity.OTPChallenge) error {
	cid, err := parseUUID(challenge.ID)
	if err != nil {
		return identity.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).CreateOTPChallenge(ctx, sqlc.CreateOTPChallengeParams{
		ID:          cid,
		Destination: challenge.Destination,
		Channel:     string(challenge.Channel),
		Purpose:     string(challenge.Purpose),
		CodeHmac:    challenge.CodeHMAC,
		Attempts:    challenge.Attempts,
		ExpiresAt:   pgtype.Timestamptz{Time: challenge.ExpiresAt.UTC(), Valid: true},
		CreatedAt:   pgtype.Timestamptz{Time: challenge.CreatedAt.UTC(), Valid: true},
	})
}

func (r *IdentityRepository) GetLatestActive(ctx context.Context, destination string, channel identity.Channel, purpose identity.OTPPurpose) (*identity.OTPChallenge, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetLatestActiveOTPChallenge(ctx, sqlc.GetLatestActiveOTPChallengeParams{
		Destination: destination,
		Purpose:     string(purpose),
		Channel:     string(channel),
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, identity.ErrOTPNotFound
		}
		return nil, err
	}
	return &identity.OTPChallenge{
		ID:          uuidString(row.ID),
		Destination: row.Destination,
		Channel:     identity.Channel(row.Channel),
		Purpose:     identity.OTPPurpose(row.Purpose),
		CodeHMAC:    row.CodeHmac,
		Attempts:    row.Attempts,
		ExpiresAt:   row.ExpiresAt.Time,
		ConsumedAt:  ptrTime(row.ConsumedAt),
		CreatedAt:   row.CreatedAt.Time,
	}, nil
}

func (r *IdentityRepository) IncrementAttempts(ctx context.Context, id string) (int16, error) {
	cid, err := parseUUID(id)
	if err != nil {
		return 0, identity.ErrInvalidInput
	}
	attempts, err := queriesFromCtx(ctx, r.pool).IncrementOTPChallengeAttempts(ctx, cid)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return 5, identity.ErrOTPMaxAttempts
		}
		return 0, err
	}
	return attempts, nil
}

func (r *IdentityRepository) MarkConsumed(ctx context.Context, id string, consumedAt time.Time) error {
	cid, err := parseUUID(id)
	if err != nil {
		return identity.ErrInvalidInput
	}
	_, err = queriesFromCtx(ctx, r.pool).MarkOTPChallengeConsumed(ctx, sqlc.MarkOTPChallengeConsumedParams{
		ID:         cid,
		ConsumedAt: pgtype.Timestamptz{Time: consumedAt.UTC(), Valid: true},
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return identity.ErrOTPNotFound
		}
		return err
	}
	return nil
}

// --- SessionRepository ---

func (r *IdentityRepository) CreateSession(ctx context.Context, session identity.Session) error {
	sid, err := parseUUID(session.ID)
	if err != nil {
		return identity.ErrInvalidInput
	}
	uid, err := parseUUID(session.UserID)
	if err != nil {
		return identity.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).CreateUserSession(ctx, sqlc.CreateUserSessionParams{
		ID:        sid,
		UserID:    uid,
		TokenHash: session.TokenHash,
		ExpiresAt: pgtype.Timestamptz{Time: session.ExpiresAt.UTC(), Valid: true},
		CreatedAt: pgtype.Timestamptz{Time: session.CreatedAt.UTC(), Valid: true},
	})
}

func (r *IdentityRepository) GetByTokenHash(ctx context.Context, tokenHash string) (*identity.Session, error) {
	row, err := queriesFromCtx(ctx, r.pool).GetSessionByTokenHash(ctx, tokenHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, identity.ErrUnauthorized
		}
		return nil, err
	}
	return &identity.Session{
		ID:        uuidString(row.ID),
		UserID:    uuidString(row.UserID),
		TokenHash: row.TokenHash,
		ExpiresAt: row.ExpiresAt.Time,
		RevokedAt: ptrTime(row.RevokedAt),
		CreatedAt: row.CreatedAt.Time,
	}, nil
}

func (r *IdentityRepository) Revoke(ctx context.Context, id string, revokedAt time.Time) error {
	sid, err := parseUUID(id)
	if err != nil {
		return identity.ErrInvalidInput
	}
	return queriesFromCtx(ctx, r.pool).RevokeSession(ctx, sqlc.RevokeSessionParams{
		ID:        sid,
		RevokedAt: pgtype.Timestamptz{Time: revokedAt.UTC(), Valid: true},
	})
}

// SessionRepoAdapter exposes SessionRepository.Create without colliding with OTPChallengeRepository.Create.
type SessionRepoAdapter struct {
	repo *IdentityRepository
}

var _ identity.SessionRepository = (*SessionRepoAdapter)(nil)

// NewSessionRepository wraps IdentityRepository to satisfy identity.SessionRepository.
func NewSessionRepository(repo *IdentityRepository) *SessionRepoAdapter {
	return &SessionRepoAdapter{repo: repo}
}

func (a *SessionRepoAdapter) Create(ctx context.Context, session identity.Session) error {
	return a.repo.CreateSession(ctx, session)
}

func (a *SessionRepoAdapter) GetByTokenHash(ctx context.Context, tokenHash string) (*identity.Session, error) {
	return a.repo.GetByTokenHash(ctx, tokenHash)
}

func (a *SessionRepoAdapter) Revoke(ctx context.Context, id string, revokedAt time.Time) error {
	return a.repo.Revoke(ctx, id, revokedAt)
}

// Note: keep IdentityRepository.Create mapped to OTPChallengeRepository; SessionRepository uses NewSessionRepository.
// Wait: remove misleading compile check on IdentityRepository for SessionRepository if Create collides.
func mapIdentityUser(row sqlc.IdentityUser) identity.User {
	return identity.User{
		ID:        uuidString(row.ID),
		Role:      identity.Role(row.Role),
		FullName:  row.FullName,
		PhoneE164: ptrString(row.PhoneE164),
		Email:     ptrString(row.Email),
		Locale:    row.Locale,
		CreatedAt: row.CreatedAt.Time,
		UpdatedAt: row.UpdatedAt.Time,
	}
}
