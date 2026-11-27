package tenant

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
)

var slugPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$`)

var reservedSlugs = map[string]struct{}{
	"api":           {},
	"www":           {},
	"app":           {},
	"admin":         {},
	"dashboard":     {},
	"my-sessions":   {},
	"therapists":    {},
	"for-therapists": {},
	"tenants":       {},
	"fonts":         {},
	"images":        {},
	"login":         {},
	"logout":        {},
	"auth":          {},
	"blog":          {},
	"assets":        {},
	"static":        {},
	"internal":      {},
	"health":        {},
	"sitemap":       {},
	"robots":        {},
}

// ValidateSlug enforces tenant slug regex and reserved platform route blocklist.
func ValidateSlug(slug string) error {
	if !slugPattern.MatchString(slug) {
		return ErrInvalidSlug
	}
	if _, blocked := reservedSlugs[slug]; blocked {
		return ErrInvalidSlug
	}
	return nil
}

// Service implements TenantService and TLSDomainChecker.
type Service struct {
	therapists      TherapistRepository
	domains         DomainRepository
	paymentAccounts PaymentAccountRepository
	txtLookup       TXTLookupPort
	clock           Clock
}

// NewService constructs a tenant Service with injected repositories and ports.
func NewService(
	therapists TherapistRepository,
	domains DomainRepository,
	paymentAccounts PaymentAccountRepository,
	txtLookup TXTLookupPort,
	clock Clock,
) *Service {
	return &Service{
		therapists:      therapists,
		domains:         domains,
		paymentAccounts: paymentAccounts,
		txtLookup:       txtLookup,
		clock:           clock,
	}
}

func (s *Service) GetTherapistByID(ctx context.Context, id string) (*Therapist, error) {
	trimmed := strings.TrimSpace(id)
	if trimmed == "" {
		return nil, ErrInvalidInput
	}
	return s.therapists.GetByID(ctx, trimmed)
}

func (s *Service) GetTherapistByUserID(ctx context.Context, userID string) (*Therapist, error) {
	trimmed := strings.TrimSpace(userID)
	if trimmed == "" {
		return nil, ErrInvalidInput
	}
	return s.therapists.GetByUserID(ctx, trimmed)
}

func (s *Service) GetTherapistBySlug(ctx context.Context, slug string) (*Therapist, error) {
	if err := ValidateSlug(strings.TrimSpace(slug)); err != nil {
		return nil, err
	}
	return s.therapists.GetBySlug(ctx, strings.TrimSpace(slug))
}

func (s *Service) GetTherapistByHostname(ctx context.Context, hostname string) (*Therapist, error) {
	host, err := normalizeHostname(hostname)
	if err != nil {
		return nil, err
	}
	return s.therapists.GetByVerifiedHostname(ctx, host)
}

func (s *Service) ListDirectoryTherapists(ctx context.Context) ([]Therapist, error) {
	return s.therapists.ListOptedInDirectory(ctx)
}

func (s *Service) UpdateTherapistProfile(ctx context.Context, therapistID string, actorUserID string, update Therapist) (*Therapist, error) {
	if strings.TrimSpace(therapistID) == "" || strings.TrimSpace(actorUserID) == "" {
		return nil, ErrInvalidInput
	}
	existing, err := s.therapists.GetByID(ctx, therapistID)
	if err != nil {
		return nil, err
	}
	if existing.UserID != actorUserID {
		return nil, ErrForbidden
	}
	if len(update.FocusTags) > 8 {
		return nil, ErrTooManyFocusTags
	}
	if update.DefaultCallURL != nil {
		normalizedURL, err := validateHTTPSURL(*update.DefaultCallURL)
		if err != nil {
			return nil, err
		}
		update.DefaultCallURL = &normalizedURL
	}
	tz := strings.TrimSpace(update.Timezone)
	if tz == "" {
		tz = existing.Timezone
	} else if _, err := time.LoadLocation(tz); err != nil {
		return nil, ErrInvalidTimezone
	}
	if update.YearsExperience < 0 {
		return nil, ErrInvalidInput
	}

	merged := *existing
	if strings.TrimSpace(update.DisplayName) != "" {
		merged.DisplayName = strings.TrimSpace(update.DisplayName)
	}
	if strings.TrimSpace(update.Headline) != "" {
		merged.Headline = strings.TrimSpace(update.Headline)
	}
	merged.BioMarkdown = update.BioMarkdown
	merged.LicenseNumber = update.LicenseNumber
	merged.YearsExperience = update.YearsExperience
	merged.FocusTags = []string{}
	if len(update.FocusTags) > 0 {
		merged.FocusTags = append([]string(nil), update.FocusTags...)
	}
	merged.EducationTimeline = []EducationEntry{}
	if len(update.EducationTimeline) > 0 {
		merged.EducationTimeline = append([]EducationEntry(nil), update.EducationTimeline...)
	}
	merged.AvatarObjectKey = update.AvatarObjectKey
	merged.DefaultCallURL = update.DefaultCallURL
	merged.DirectoryOptIn = update.DirectoryOptIn
	merged.ReviewsEnabled = update.ReviewsEnabled
	merged.Timezone = tz
	merged.CancellationPolicyFa = update.CancellationPolicyFa

	return s.therapists.UpdateProfile(ctx, merged)
}

func (s *Service) RegisterCustomDomain(ctx context.Context, therapistID string, hostname string) (*TenantDomain, error) {
	if strings.TrimSpace(therapistID) == "" {
		return nil, ErrInvalidInput
	}
	host, err := normalizeHostname(hostname)
	if err != nil {
		return nil, err
	}
	if _, err := s.therapists.GetByID(ctx, therapistID); err != nil {
		return nil, err
	}
	if existing, err := s.domains.GetByHostname(ctx, host); err == nil && existing != nil {
		return nil, ErrDomainAlreadyClaimed
	}

	txtToken, err := generateVerifyToken()
	if err != nil {
		return nil, err
	}

	domain := TenantDomain{
		ID:          uuid.Must(uuid.NewV7()).String(),
		TherapistID: therapistID,
		Hostname:    host,
		IsPrimary:   false,
		Status:      DomainStatusPendingDNS,
		TXTToken:    txtToken,
		CreatedAt:   s.clock.Now(),
	}
	if err := s.domains.Create(ctx, domain); err != nil {
		return nil, err
	}
	return &domain, nil
}

func (s *Service) VerifyCustomDomain(ctx context.Context, therapistID string, domainID string) (*TenantDomain, error) {
	if strings.TrimSpace(therapistID) == "" || strings.TrimSpace(domainID) == "" {
		return nil, ErrInvalidInput
	}
	d, err := s.domains.GetByID(ctx, domainID)
	if err != nil {
		return nil, err
	}
	if d.TherapistID != therapistID {
		return nil, ErrForbidden
	}

	if !s.hasMatchingTXTRecord(ctx, d.Hostname, d.TXTToken) {
		return nil, ErrDomainVerifyFailed
	}

	if err := s.domains.MarkVerified(ctx, d.ID, true, s.clock.Now()); err != nil {
		return nil, err
	}
	return s.domains.GetByID(ctx, d.ID)
}

func (s *Service) ListTherapistDomains(ctx context.Context, therapistID string) ([]TenantDomain, error) {
	trimmed := strings.TrimSpace(therapistID)
	if trimmed == "" {
		return nil, ErrInvalidInput
	}
	return s.domains.ListByTherapist(ctx, trimmed)
}

func (s *Service) ListActivePaymentAccounts(ctx context.Context, therapistID string, track Track) ([]PaymentAccount, error) {
	if strings.TrimSpace(therapistID) == "" || (track != TrackIran && track != TrackAbroad) {
		return nil, ErrInvalidInput
	}
	return s.paymentAccounts.ListActiveByTherapistAndTrack(ctx, therapistID, track)
}

func (s *Service) UpsertPaymentAccount(ctx context.Context, account PaymentAccount) (*PaymentAccount, error) {
	if strings.TrimSpace(account.TherapistID) == "" ||
		strings.TrimSpace(account.AccountLabel) == "" ||
		strings.TrimSpace(account.DestinationVal) == "" ||
		strings.TrimSpace(account.HolderName) == "" {
		return nil, ErrInvalidInput
	}
	if !isValidTrackMethod(account.Track, account.Method) {
		return nil, ErrInvalidPaymentMethod
	}
	account.ID = strings.TrimSpace(account.ID)
	if account.ID != "" {
		existing, err := s.paymentAccounts.GetByID(ctx, account.ID)
		if err == nil && existing != nil {
			if existing.TherapistID != account.TherapistID {
				return nil, ErrForbidden
			}
			account.CreatedAt = existing.CreatedAt
		} else if err != nil && !errors.Is(err, ErrPaymentAccountNotFound) {
			return nil, err
		}
	}
	account.AccountLabel = strings.TrimSpace(account.AccountLabel)
	account.DestinationVal = strings.TrimSpace(account.DestinationVal)
	account.HolderName = strings.TrimSpace(account.HolderName)
	return s.paymentAccounts.Upsert(ctx, account)
}

func (s *Service) IsVerifiedCustomDomain(ctx context.Context, hostname string) (bool, error) {
	host, err := normalizeHostname(hostname)
	if err != nil {
		return false, nil
	}
	d, err := s.domains.GetByHostname(ctx, host)
	if err != nil {
		if errors.Is(err, ErrDomainNotFound) {
			return false, nil
		}
		return false, err
	}
	return d.Status == DomainStatusVerified, nil
}

func (s *Service) hasMatchingTXTRecord(ctx context.Context, hostname string, expected string) bool {
	if s.txtLookup == nil {
		return false
	}
	for _, lookupHost := range []string{hostname, "_ravannama." + hostname} {
		records, err := s.txtLookup.LookupTXT(ctx, lookupHost)
		if err != nil {
			continue
		}
		for _, rec := range records {
			if strings.TrimSpace(rec) == expected {
				return true
			}
		}
	}
	return false
}

func normalizeHostname(raw string) (string, error) {
	host := strings.ToLower(strings.TrimSpace(raw))
	if host == "" || len(host) > 253 {
		return "", ErrInvalidInput
	}
	if strings.ContainsAny(host, " \t\r\n:*/\\?#[]@!") {
		return "", ErrInvalidInput
	}
	if strings.Contains(host, "..") || strings.HasPrefix(host, ".") || strings.HasSuffix(host, ".") {
		return "", ErrInvalidInput
	}
	if net.ParseIP(host) != nil {
		return "", ErrInvalidInput
	}
	labels := strings.Split(host, ".")
	if len(labels) < 2 {
		return "", ErrInvalidInput
	}
	for _, label := range labels {
		if !isValidDNSLabel(label) {
			return "", ErrInvalidInput
		}
	}
	if isAllDigits(labels[len(labels)-1]) {
		return "", ErrInvalidInput
	}
	return host, nil
}

func isValidDNSLabel(label string) bool {
	if len(label) == 0 || len(label) > 63 {
		return false
	}
	if label[0] == '-' || label[len(label)-1] == '-' {
		return false
	}
	for i := 0; i < len(label); i++ {
		c := label[i]
		isLower := c >= 'a' && c <= 'z'
		isDigit := c >= '0' && c <= '9'
		if !isLower && !isDigit && c != '-' {
			return false
		}
	}
	return true
}

func isAllDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

func validateHTTPSURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" {
		return "", ErrInvalidCallURL
	}
	u.Scheme = "https"
	return u.String(), nil
}

func isValidTrackMethod(track Track, method PaymentMethod) bool {
	switch track {
	case TrackIran:
		return method == MethodCardToCard || method == MethodSheba
	case TrackAbroad:
		return method == MethodPayPal || method == MethodIBAN || method == MethodUSDT
	default:
		return false
	}
}

func generateVerifyToken() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "ravannama-verify=" + hex.EncodeToString(buf), nil
}
