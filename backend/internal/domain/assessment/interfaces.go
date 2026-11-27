package assessment

import (
	"context"
	"time"
)

// ScaleScore represents a single normalized psychometric scale outcome using exact integers.
type ScaleScore struct {
	ScaleCode string
	RawScore  int32
	TScore    int32
	Flag      string
}

// ScoreProfile represents a clinician-only scored psychometric assessment profile.
type ScoreProfile struct {
	AssessmentID string
	InstanceID   string
	Scales       []ScaleScore
	ComputedAt   time.Time
}

// BlackBoxScoringEngine scores psychometric assessments strictly server-side (Phase 3 seam).
type BlackBoxScoringEngine interface {
	ScoreAssessment(ctx context.Context, assessmentID string, rawAnswers map[string]int32) (*ScoreProfile, error)
}

// LicenseReservation represents an atomic wholesale credit reservation (Phase 3 seam).
type LicenseReservation struct {
	ID         string
	AccountID  string
	InstanceID string
	Credits    int64
	Status     string
	CreatedAt  time.Time
}

// LicenseWalletService manages B2B wholesale psychometric test credits using integer counts (Phase 3 seam).
type LicenseWalletService interface {
	GetBalance(ctx context.Context, accountID string) (int64, error)
	ReserveLicense(ctx context.Context, accountID string, instanceID string, credits int64) (*LicenseReservation, error)
	BurnLicense(ctx context.Context, reservationID string) error
	RefundLicense(ctx context.Context, reservationID string) error
}
