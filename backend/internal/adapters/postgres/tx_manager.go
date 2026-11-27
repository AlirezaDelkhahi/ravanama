package postgres

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres/sqlc"
)

type txContextKey struct{}

// TxManager runs booking and domain workflows inside atomic PostgreSQL transactions.
type TxManager struct {
	pool *pgxpool.Pool
}

// NewTxManager constructs a TxManager backed by a pgxpool.Pool.
func NewTxManager(pool *pgxpool.Pool) *TxManager {
	return &TxManager{pool: pool}
}

// WithinTx executes fn inside a PostgreSQL transaction, reusing an active tx if present.
func (m *TxManager) WithinTx(ctx context.Context, fn func(txCtx context.Context) error) error {
	if existing, ok := ctx.Value(txContextKey{}).(pgx.Tx); ok && existing != nil {
		return fn(ctx)
	}

	tx, err := m.pool.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return err
	}
	defer func() {
		if rbErr := tx.Rollback(ctx); rbErr != nil && !errors.Is(rbErr, pgx.ErrTxClosed) {
			_ = rbErr
		}
	}()

	txCtx := context.WithValue(ctx, txContextKey{}, tx)
	if err := fn(txCtx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func queriesFromCtx(ctx context.Context, pool *pgxpool.Pool) *sqlc.Queries {
	if tx, ok := ctx.Value(txContextKey{}).(pgx.Tx); ok && tx != nil {
		return sqlc.New(tx)
	}
	return sqlc.New(pool)
}
