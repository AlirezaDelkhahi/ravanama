package scheduling

import (
	"context"
	"time"
)

// Currency identifies supported integer-unit currencies.
type Currency string

const (
	CurrencyIRT Currency = "IRT"
	CurrencyUSD Currency = "USD"
	CurrencyEUR Currency = "EUR"
)

// ServiceOffering represents a bookable therapy session type and exact integer price.
// PriceAmount stores Toman for IRT and minor cents for USD/EUR.
type ServiceOffering struct {
	ID          string
	TherapistID string
	Track       string
	Title       string
	Description string
	DurationMin int16
	Currency    Currency
	PriceAmount int64
	IsActive    bool
	SortOrder   int16
	CreatedAt   time.Time
}

// WeeklyAvailabilityRule defines recurring Saturday-first (0=Shanbeh..6=Jomeh) windows.
type WeeklyAvailabilityRule struct {
	ID          string
	TherapistID string
	WeekdaySat0 int16
	StartMinute int16
	EndMinute   int16
	BufferMin   int16
	MinNoticeHr int16
	IsActive    bool
}

// AvailabilityOverride defines a full-day closure or custom hours on a specific date.
type AvailabilityOverride struct {
	ID           string
	TherapistID  string
	OverrideDate time.Time
	IsClosed     bool
	StartMinute  *int16
	EndMinute    *int16
	Reason       string
}

// AvailableSlot represents a generated bookable time window.
type AvailableSlot struct {
	StartAt        time.Time
	EndAt          time.Time
	Track          string
	ClientTimezone string
}

// SchedulingService defines offerings, availability configuration, and slot generation.
type SchedulingService interface {
	ListActiveOfferings(ctx context.Context, therapistID string, track string) ([]ServiceOffering, error)
	UpsertOffering(ctx context.Context, offering ServiceOffering) (*ServiceOffering, error)
	SetWeeklyRules(ctx context.Context, therapistID string, rules []WeeklyAvailabilityRule) error
	UpsertOverride(ctx context.Context, override AvailabilityOverride) (*AvailabilityOverride, error)
	GenerateSlots(ctx context.Context, therapistID string, offeringID string, from time.Time, to time.Time, clientTimezone string) ([]AvailableSlot, error)
}

// OfferingRepository persists scheduling.service_offerings records.
type OfferingRepository interface {
	GetByID(ctx context.Context, id string) (*ServiceOffering, error)
	ListActiveByTherapist(ctx context.Context, therapistID string, track string) ([]ServiceOffering, error)
	Upsert(ctx context.Context, offering ServiceOffering) (*ServiceOffering, error)
}

// WeeklyRuleRepository persists scheduling.weekly_availability_rules records.
type WeeklyRuleRepository interface {
	ListActiveByTherapist(ctx context.Context, therapistID string) ([]WeeklyAvailabilityRule, error)
	ReplaceForTherapist(ctx context.Context, therapistID string, rules []WeeklyAvailabilityRule) error
}

// OverrideRepository persists scheduling.availability_overrides records.
type OverrideRepository interface {
	ListByTherapistInRange(ctx context.Context, therapistID string, from time.Time, to time.Time) ([]AvailabilityOverride, error)
	Upsert(ctx context.Context, override AvailabilityOverride) (*AvailabilityOverride, error)
}
