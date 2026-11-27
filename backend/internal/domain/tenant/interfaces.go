package tenant

import (
	"context"
	"time"
)

// Track distinguishes domestic Iran vs. diaspora/international booking tracks.
type Track string

const (
	TrackIran   Track = "iran"
	TrackAbroad Track = "abroad"
)

// PaymentMethod identifies manual payout channels supported per track.
type PaymentMethod string

const (
	MethodCardToCard PaymentMethod = "card_to_card"
	MethodSheba      PaymentMethod = "sheba"
	MethodPayPal     PaymentMethod = "paypal"
	MethodIBAN       PaymentMethod = "iban"
	MethodUSDT       PaymentMethod = "usdt"
)

// DomainStatus tracks custom domain verification lifecycle.
type DomainStatus string

const (
	DomainStatusPendingDNS DomainStatus = "pending_dns"
	DomainStatusVerified   DomainStatus = "verified"
	DomainStatusDisabled   DomainStatus = "disabled"
)

// EducationEntry represents a Jalali education/resume timeline item.
type EducationEntry struct {
	Degree      string `json:"degree"`
	Institution string `json:"institution"`
	StartJalali string `json:"start_jalali"`
	EndJalali   string `json:"end_jalali"`
}

// Therapist represents a solo practitioner profile in tenant.therapists.
type Therapist struct {
	ID                   string
	UserID               string
	Slug                 string
	DisplayName          string
	Headline             string
	BioMarkdown          string
	LicenseNumber        string
	YearsExperience      int16
	FocusTags            []string
	EducationTimeline    []EducationEntry
	AvatarObjectKey      *string
	DefaultCallURL       *string
	DirectoryOptIn       bool
	ReviewsEnabled       bool
	Timezone             string
	CancellationPolicyFa string
	CreatedAt            time.Time
	UpdatedAt            time.Time
}

// TenantDomain represents a custom hostname mapped to a therapist.
type TenantDomain struct {
	ID          string
	TherapistID string
	Hostname    string
	IsPrimary   bool
	Status      DomainStatus
	TXTToken    string
	VerifiedAt  *time.Time
	CreatedAt   time.Time
}

// PaymentAccount represents a therapist's track-scoped manual payment destination.
type PaymentAccount struct {
	ID             string
	TherapistID    string
	Track          Track
	Method         PaymentMethod
	AccountLabel   string
	DestinationVal string
	HolderName     string
	IsActive       bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// TLSDomainChecker verifies whether a custom hostname is authorized for on-demand TLS.
type TLSDomainChecker interface {
	IsVerifiedCustomDomain(ctx context.Context, hostname string) (bool, error)
}

// TenantService defines therapist profile, custom domain, and payment account operations.
type TenantService interface {
	GetTherapistByID(ctx context.Context, id string) (*Therapist, error)
	GetTherapistByUserID(ctx context.Context, userID string) (*Therapist, error)
	GetTherapistBySlug(ctx context.Context, slug string) (*Therapist, error)
	GetTherapistByHostname(ctx context.Context, hostname string) (*Therapist, error)
	ListDirectoryTherapists(ctx context.Context) ([]Therapist, error)
	UpdateTherapistProfile(ctx context.Context, therapistID string, actorUserID string, update Therapist) (*Therapist, error)
	RegisterCustomDomain(ctx context.Context, therapistID string, hostname string) (*TenantDomain, error)
	VerifyCustomDomain(ctx context.Context, therapistID string, domainID string) (*TenantDomain, error)
	ListTherapistDomains(ctx context.Context, therapistID string) ([]TenantDomain, error)
	ListActivePaymentAccounts(ctx context.Context, therapistID string, track Track) ([]PaymentAccount, error)
	UpsertPaymentAccount(ctx context.Context, account PaymentAccount) (*PaymentAccount, error)
}

// TherapistRepository persists and retrieves tenant.therapists records.
type TherapistRepository interface {
	GetByID(ctx context.Context, id string) (*Therapist, error)
	GetByUserID(ctx context.Context, userID string) (*Therapist, error)
	GetBySlug(ctx context.Context, slug string) (*Therapist, error)
	GetByVerifiedHostname(ctx context.Context, hostname string) (*Therapist, error)
	ListOptedInDirectory(ctx context.Context) ([]Therapist, error)
	UpdateProfile(ctx context.Context, t Therapist) (*Therapist, error)
}

// DomainRepository persists custom domain verification records.
type DomainRepository interface {
	GetByID(ctx context.Context, id string) (*TenantDomain, error)
	GetByHostname(ctx context.Context, hostname string) (*TenantDomain, error)
	ListByTherapist(ctx context.Context, therapistID string) ([]TenantDomain, error)
	Create(ctx context.Context, domain TenantDomain) error
	MarkVerified(ctx context.Context, id string, isPrimary bool, verifiedAt time.Time) error
}

// PaymentAccountRepository persists track-scoped therapist payment accounts.
type PaymentAccountRepository interface {
	GetByID(ctx context.Context, id string) (*PaymentAccount, error)
	ListActiveByTherapistAndTrack(ctx context.Context, therapistID string, track Track) ([]PaymentAccount, error)
	Upsert(ctx context.Context, account PaymentAccount) (*PaymentAccount, error)
}

// TXTLookupPort resolves DNS TXT records for custom-domain ownership verification.
type TXTLookupPort interface {
	LookupTXT(ctx context.Context, hostname string) ([]string, error)
}

// Clock provides current timestamps for domain verification.
type Clock interface {
	Now() time.Time
}
