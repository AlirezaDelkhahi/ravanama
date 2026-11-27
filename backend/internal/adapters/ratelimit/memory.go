package ratelimit

import (
	"context"
	"sync"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/identity"
)

var _ identity.RateLimiterPort = (*MemoryLimiter)(nil)

// MemoryLimiter provides a thread-safe in-memory sliding-window RateLimiterPort.
type MemoryLimiter struct {
	mu      sync.Mutex
	buckets map[string][]time.Time
	now     func() time.Time
}

// NewMemoryLimiter constructs an in-memory sliding-window rate limiter.
func NewMemoryLimiter() *MemoryLimiter {
	return &MemoryLimiter{
		buckets: make(map[string][]time.Time),
		now:     func() time.Time { return time.Now().UTC() },
	}
}

func (l *MemoryLimiter) Allow(_ context.Context, key string, limit int, window time.Duration) (bool, error) {
	if limit <= 0 || window <= 0 {
		return false, nil
	}
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	cutoff := now.Add(-window)

	hits := l.buckets[key]
	kept := hits[:0]
	for _, ts := range hits {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if len(kept) >= limit {
		l.buckets[key] = kept
		return false, nil
	}
	kept = append(kept, now)
	l.buckets[key] = kept

	// Opportunistically prune empty/stale keys if map grows.
	if len(l.buckets) > 1024 {
		for k, entries := range l.buckets {
			if len(entries) == 0 || !entries[len(entries)-1].After(cutoff) {
				delete(l.buckets, k)
			}
		}
	}

	return true, nil
}
