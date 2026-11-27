package bootstrap

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

// FakeClock provides deterministic controllable time for in-memory unit tests.
type FakeClock struct {
	mu  sync.Mutex
	now time.Time
}

func NewFakeClock(initial time.Time) *FakeClock {
	return &FakeClock{now: initial.UTC()}
}

func (c *FakeClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *FakeClock) Advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = c.now.Add(d)
}

func (c *FakeClock) Set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = t.UTC()
}

// BookingNotification captures post-commit booking notification events.
type BookingNotification struct {
	Event     string
	BookingID string
	Status    booking.BookingStatus
}

// TestEnv exposes thread-safe fake adapters and seeders for domain unit tests.
type TestEnv struct {
	Clock        *FakeClock
	users        *fakeUserRepo
	otps         *fakeOTPRepo
	sessions     *fakeSessionRepo
	rateLimiter  *fakeRateLimiter
	otpNotifier  *fakeOTPNotifier
	therapists   *fakeTherapistRepo
	domains      *fakeDomainRepo
	payAccounts  *fakePaymentAccountRepo
	txtLookup    *fakeTXTLookup
	offerings    *fakeOfferingRepo
	weeklyRules  *fakeWeeklyRuleRepo
	overrides    *fakeOverrideRepo
	bookings     *fakeBookingRepo
	bookNotifier *fakeBookingNotifier
	mediaRepo    *fakeMediaRepo
	storage      *fakeObjectStorage
	blogs        *fakeBlogRepo
	reviews      *fakeReviewRepo
}

// NewTestApp returns an in-memory wired *App with zero external DB/network dependencies.
func NewTestApp() *App {
	logger := httptransport.NewRedactingLogger(io.Discard, slog.LevelInfo)
	cfg := Config{
		Port:           "8080",
		PlatformDomain: "ravannama.ir",
		LogLevel:       slog.LevelInfo,
	}

	clock := NewFakeClock(time.Date(2026, 11, 20, 8, 0, 0, 0, time.UTC))

	env := &TestEnv{
		Clock:        clock,
		users:        newFakeUserRepo(clock),
		otps:         newFakeOTPRepo(),
		sessions:     newFakeSessionRepo(),
		rateLimiter:  newFakeRateLimiter(clock),
		otpNotifier:  newFakeOTPNotifier(),
		domains:      newFakeDomainRepo(clock),
		payAccounts:  newFakePaymentAccountRepo(clock),
		txtLookup:    newFakeTXTLookup(),
		offerings:    newFakeOfferingRepo(clock),
		weeklyRules:  newFakeWeeklyRuleRepo(),
		overrides:    newFakeOverrideRepo(),
		bookings:     newFakeBookingRepo(),
		bookNotifier: newFakeBookingNotifier(),
		mediaRepo:    newFakeMediaRepo(),
		storage:      newFakeObjectStorage(),
		blogs:        newFakeBlogRepo(clock),
		reviews:      newFakeReviewRepo(),
	}
	env.therapists = newFakeTherapistRepo(clock, env.domains)

	// Pre-seed verified custom domain expected by Milestone 0 smoke test.
	_ = env.domains.Create(context.Background(), tenant.TenantDomain{
		ID:          uuid.Must(uuid.NewV7()).String(),
		TherapistID: "00000000-0000-0000-0000-000000000001",
		Hostname:    "dr-example.ir",
		IsPrimary:   true,
		Status:      tenant.DomainStatusVerified,
		TXTToken:    "ravannama-verify=seed",
		CreatedAt:   clock.Now(),
	})

	idSvc := identity.NewService(
		env.users,
		env.otps,
		env.sessions,
		env.rateLimiter,
		env.otpNotifier,
		clock,
		identity.Config{OTPPepper: "test-otp-pepper-32-bytes-minimum!!"},
	)

	tenantSvc := tenant.NewService(
		env.therapists,
		env.domains,
		env.payAccounts,
		env.txtLookup,
		clock,
	)

	schedSvc := scheduling.NewService(
		env.offerings,
		env.weeklyRules,
		env.overrides,
		therapistTimezoneAdapter{repo: env.therapists},
		busySlotAdapter{repo: env.bookings},
		clock,
	)

	bookSvc := booking.NewService(
		env.bookings,
		fakeTxManager{},
		offeringLookupAdapter{repo: env.offerings},
		paymentLookupAdapter{repo: env.payAccounts},
		mediaLookupAdapter{repo: env.mediaRepo},
		env.bookNotifier,
		clock,
	)

	mediaSvc := media.NewService(
		env.mediaRepo,
		env.storage,
		heldBookingAdapter{repo: env.bookings},
		receiptAccessAdapter{bookings: env.bookings, therapists: env.therapists},
		clock,
	)

	contentSvc := content.NewService(
		env.blogs,
		env.reviews,
		completedBookingAdapter{repo: env.bookings},
		clock,
	)

	services := Services{
		TLSDomainChecker: tenantSvc,
		Identity:         idSvc,
		Tenant:           tenantSvc,
		Scheduling:       schedSvc,
		Booking:          bookSvc,
		Media:            mediaSvc,
		Content:          contentSvc,
	}

	app := NewAppWithServices(cfg, logger, services)
	app.testEnv = env
	return app
}

// --- TestEnv helpers ---

func (e *TestEnv) LastOTP(destination string) (string, bool) {
	return e.otpNotifier.lastOTP(destination)
}

func (e *TestEnv) SetTXTRecords(hostname string, records []string) {
	e.txtLookup.set(hostname, records)
}

func (e *TestEnv) SeedTherapist(t tenant.Therapist) error {
	return e.therapists.seed(t)
}

func (e *TestEnv) SeedUser(u identity.User) error {
	return e.users.seed(u)
}

func (e *TestEnv) GetUser(id string) (*identity.User, error) {
	return e.users.GetByID(context.Background(), id)
}

func (e *TestEnv) SeedBooking(b booking.Booking) error {
	return e.bookings.seed(b)
}

func (e *TestEnv) GetBookingRaw(id string) (*booking.Booking, error) {
	return e.bookings.GetByID(context.Background(), id)
}

func (e *TestEnv) PutStorageObject(bucket media.BucketKind, key string, data []byte) {
	e.storage.putObject(bucket, key, data)
}

func (e *TestEnv) HasStorageObject(bucket media.BucketKind, key string) bool {
	return e.storage.hasObject(bucket, key)
}

func (e *TestEnv) Notifications() []BookingNotification {
	return e.bookNotifier.list()
}

// --- Cross-domain adapters for TestApp ---

type therapistTimezoneAdapter struct {
	repo *fakeTherapistRepo
}

func (a therapistTimezoneAdapter) GetTherapistTimezone(ctx context.Context, therapistID string) (string, error) {
	t, err := a.repo.GetByID(ctx, therapistID)
	if err != nil {
		return "Asia/Tehran", nil
	}
	if t.Timezone == "" {
		return "Asia/Tehran", nil
	}
	return t.Timezone, nil
}

type busySlotAdapter struct {
	repo *fakeBookingRepo
}

func (a busySlotAdapter) ListBusySlots(ctx context.Context, therapistID string, from time.Time, to time.Time) ([]scheduling.BusySlot, error) {
	return a.repo.listBusySlots(ctx, therapistID, from, to)
}

type offeringLookupAdapter struct {
	repo *fakeOfferingRepo
}

func (a offeringLookupAdapter) GetOffering(ctx context.Context, id string) (*booking.OfferingSnapshot, error) {
	o, err := a.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &booking.OfferingSnapshot{
		ID:          o.ID,
		TherapistID: o.TherapistID,
		Track:       o.Track,
		DurationMin: o.DurationMin,
		Currency:    string(o.Currency),
		PriceAmount: o.PriceAmount,
		IsActive:    o.IsActive,
	}, nil
}

type paymentLookupAdapter struct {
	repo *fakePaymentAccountRepo
}

func (a paymentLookupAdapter) ListActiveDestinations(ctx context.Context, therapistID string, track string) ([]booking.PaymentDestination, error) {
	accs, err := a.repo.ListActiveByTherapistAndTrack(ctx, therapistID, tenant.Track(track))
	if err != nil {
		return nil, err
	}
	out := make([]booking.PaymentDestination, len(accs))
	for i, acc := range accs {
		out[i] = booking.PaymentDestination{
			ID:             acc.ID,
			Track:          string(acc.Track),
			Method:         string(acc.Method),
			AccountLabel:   acc.AccountLabel,
			DestinationVal: acc.DestinationVal,
			HolderName:     acc.HolderName,
		}
	}
	return out, nil
}

type mediaLookupAdapter struct {
	repo *fakeMediaRepo
}

func (a mediaLookupAdapter) GetMediaObject(ctx context.Context, id string) (*booking.MediaObjectSnapshot, error) {
	m, err := a.repo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}
	return &booking.MediaObjectSnapshot{
		ID:          m.ID,
		OwnerUserID: m.OwnerUserID,
		BucketKind:  string(m.BucketKind),
		Status:      string(m.Status),
	}, nil
}

type heldBookingAdapter struct {
	repo *fakeBookingRepo
}

func (a heldBookingAdapter) HasActiveHeldBooking(_ context.Context, bookingID string, ownerUserID string, now time.Time) (bool, error) {
	return a.repo.hasActiveHold(bookingID, ownerUserID, now), nil
}

type receiptAccessAdapter struct {
	bookings   *fakeBookingRepo
	therapists *fakeTherapistRepo
}

func (a receiptAccessAdapter) CanAccessReceipt(ctx context.Context, mediaObjectID string, actorUserID string) (bool, error) {
	b, ok := a.bookings.findByReceiptMediaID(mediaObjectID)
	if !ok {
		return false, nil
	}
	if b.ClientUserID == actorUserID {
		return true, nil
	}
	t, err := a.therapists.GetByID(ctx, b.TherapistID)
	if err != nil {
		return false, nil
	}
	return t.UserID == actorUserID, nil
}

type completedBookingAdapter struct {
	repo *fakeBookingRepo
}

func (a completedBookingAdapter) GetBookingForReview(ctx context.Context, bookingID string) (*content.CompletedBookingInfo, error) {
	b, err := a.repo.GetByID(ctx, bookingID)
	if err != nil {
		return nil, content.ErrBookingNotFound
	}
	return &content.CompletedBookingInfo{
		BookingID:    b.ID,
		TherapistID:  b.TherapistID,
		ClientUserID: b.ClientUserID,
		IsCompleted:  b.Status == booking.StatusCompleted,
	}, nil
}

// --- In-Memory Fake Implementations ---

type fakeTxManager struct{}

func (fakeTxManager) WithinTx(ctx context.Context, fn func(txCtx context.Context) error) error {
	return fn(ctx)
}

type fakeUserRepo struct {
	mu    sync.Mutex
	clock *FakeClock
	users map[string]identity.User
}

func newFakeUserRepo(clock *FakeClock) *fakeUserRepo {
	return &fakeUserRepo{clock: clock, users: make(map[string]identity.User)}
}

func (r *fakeUserRepo) seed(u identity.User) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if u.ID == "" {
		u.ID = uuid.Must(uuid.NewV7()).String()
	}
	r.users[u.ID] = u
	return nil
}

func (r *fakeUserRepo) GetByID(_ context.Context, id string) (*identity.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	u, ok := r.users[id]
	if !ok {
		return nil, identity.ErrUserNotFound
	}
	cp := u
	return &cp, nil
}

func (r *fakeUserRepo) GetByPhoneE164(_ context.Context, phone string) (*identity.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, u := range r.users {
		if u.PhoneE164 != nil && *u.PhoneE164 == phone {
			cp := u
			return &cp, nil
		}
	}
	return nil, identity.ErrUserNotFound
}

func (r *fakeUserRepo) GetByEmail(_ context.Context, email string) (*identity.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, u := range r.users {
		if u.Email != nil && *u.Email == email {
			cp := u
			return &cp, nil
		}
	}
	return nil, identity.ErrUserNotFound
}

func (r *fakeUserRepo) UpsertClientByVerifiedChannel(_ context.Context, channel identity.Channel, destination string, fullName string, locale string) (*identity.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.clock.Now()
	for id, u := range r.users {
		matched := (channel == identity.ChannelSMS && u.PhoneE164 != nil && *u.PhoneE164 == destination) ||
			(channel == identity.ChannelEmail && u.Email != nil && *u.Email == destination)
		if matched {
			if fullName != "" {
				u.FullName = fullName
			}
			u.UpdatedAt = now
			r.users[id] = u
			cp := u
			return &cp, nil
		}
	}
	if locale == "" {
		locale = "fa-IR"
	}
	u := identity.User{
		ID:        uuid.Must(uuid.NewV7()).String(),
		Role:      identity.RoleClient,
		FullName:  fullName,
		Locale:    locale,
		CreatedAt: now,
		UpdatedAt: now,
	}
	dest := destination
	if channel == identity.ChannelSMS {
		u.PhoneE164 = &dest
	} else {
		u.Email = &dest
	}
	r.users[u.ID] = u
	cp := u
	return &cp, nil
}

type fakeOTPRepo struct {
	mu         sync.Mutex
	challenges []identity.OTPChallenge
}

func newFakeOTPRepo() *fakeOTPRepo {
	return &fakeOTPRepo{}
}

func (r *fakeOTPRepo) Create(_ context.Context, c identity.OTPChallenge) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.challenges = append(r.challenges, c)
	return nil
}

func (r *fakeOTPRepo) GetLatestActive(_ context.Context, destination string, channel identity.Channel, purpose identity.OTPPurpose) (*identity.OTPChallenge, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := len(r.challenges) - 1; i >= 0; i-- {
		c := r.challenges[i]
		if c.Destination == destination && c.Channel == channel && c.Purpose == purpose && c.ConsumedAt == nil {
			cp := c
			return &cp, nil
		}
	}
	return nil, identity.ErrOTPNotFound
}

func (r *fakeOTPRepo) IncrementAttempts(_ context.Context, id string) (int16, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.challenges {
		if r.challenges[i].ID == id {
			if r.challenges[i].Attempts >= 5 {
				return r.challenges[i].Attempts, identity.ErrOTPMaxAttempts
			}
			r.challenges[i].Attempts++
			return r.challenges[i].Attempts, nil
		}
	}
	return 0, identity.ErrOTPNotFound
}

func (r *fakeOTPRepo) MarkConsumed(_ context.Context, id string, consumedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for i := range r.challenges {
		if r.challenges[i].ID == id {
			if r.challenges[i].ConsumedAt != nil {
				return identity.ErrOTPNotFound
			}
			if r.challenges[i].Attempts >= 5 {
				return identity.ErrOTPMaxAttempts
			}
			t := consumedAt
			r.challenges[i].ConsumedAt = &t
			return nil
		}
	}
	return identity.ErrOTPNotFound
}

type fakeSessionRepo struct {
	mu       sync.Mutex
	sessions map[string]identity.Session
}

func newFakeSessionRepo() *fakeSessionRepo {
	return &fakeSessionRepo{sessions: make(map[string]identity.Session)}
}

func (r *fakeSessionRepo) Create(_ context.Context, s identity.Session) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.sessions[s.ID] = s
	return nil
}

func (r *fakeSessionRepo) GetByTokenHash(_ context.Context, tokenHash string) (*identity.Session, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, s := range r.sessions {
		if s.TokenHash == tokenHash {
			cp := s
			return &cp, nil
		}
	}
	return nil, identity.ErrUnauthorized
}

func (r *fakeSessionRepo) Revoke(_ context.Context, id string, revokedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[id]
	if !ok {
		return identity.ErrUnauthorized
	}
	t := revokedAt
	s.RevokedAt = &t
	r.sessions[id] = s
	return nil
}

type fakeRateLimiter struct {
	mu      sync.Mutex
	clock   *FakeClock
	buckets map[string][]time.Time
}

func newFakeRateLimiter(clock *FakeClock) *fakeRateLimiter {
	return &fakeRateLimiter{clock: clock, buckets: make(map[string][]time.Time)}
}

func (rl *fakeRateLimiter) Allow(_ context.Context, key string, limit int, window time.Duration) (bool, error) {
	rl.mu.Lock()
	defer rl.mu.Unlock()
	now := rl.clock.Now()
	cutoff := now.Add(-window)
	hits := rl.buckets[key]
	kept := hits[:0]
	for _, ts := range hits {
		if ts.After(cutoff) {
			kept = append(kept, ts)
		}
	}
	if len(kept) >= limit {
		rl.buckets[key] = kept
		return false, nil
	}
	kept = append(kept, now)
	rl.buckets[key] = kept
	return true, nil
}

type fakeOTPNotifier struct {
	mu   sync.Mutex
	sent map[string][]string
}

func newFakeOTPNotifier() *fakeOTPNotifier {
	return &fakeOTPNotifier{sent: make(map[string][]string)}
}

func (n *fakeOTPNotifier) SendOTP(_ context.Context, _ identity.Channel, destination string, code string, _ identity.OTPPurpose) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.sent[destination] = append(n.sent[destination], code)
	return nil
}

func (n *fakeOTPNotifier) lastOTP(destination string) (string, bool) {
	n.mu.Lock()
	defer n.mu.Unlock()
	codes := n.sent[strings.ToLower(strings.TrimSpace(destination))]
	if len(codes) == 0 {
		codes = n.sent[strings.TrimSpace(destination)]
	}
	if len(codes) == 0 {
		return "", false
	}
	return codes[len(codes)-1], true
}

type fakeTherapistRepo struct {
	mu         sync.Mutex
	clock      *FakeClock
	domains    *fakeDomainRepo
	therapists map[string]tenant.Therapist
}

func newFakeTherapistRepo(clock *FakeClock, domains *fakeDomainRepo) *fakeTherapistRepo {
	return &fakeTherapistRepo{clock: clock, domains: domains, therapists: make(map[string]tenant.Therapist)}
}

func (r *fakeTherapistRepo) seed(t tenant.Therapist) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if t.ID == "" {
		t.ID = uuid.Must(uuid.NewV7()).String()
	}
	if t.Timezone == "" {
		t.Timezone = "Asia/Tehran"
	}
	r.therapists[t.ID] = t
	return nil
}

func (r *fakeTherapistRepo) GetByID(_ context.Context, id string) (*tenant.Therapist, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	t, ok := r.therapists[id]
	if !ok {
		return nil, tenant.ErrTherapistNotFound
	}
	cp := t
	return &cp, nil
}

func (r *fakeTherapistRepo) GetByUserID(_ context.Context, userID string) (*tenant.Therapist, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.therapists {
		if t.UserID == userID {
			cp := t
			return &cp, nil
		}
	}
	return nil, tenant.ErrTherapistNotFound
}

func (r *fakeTherapistRepo) GetBySlug(_ context.Context, slug string) (*tenant.Therapist, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, t := range r.therapists {
		if t.Slug == slug {
			cp := t
			return &cp, nil
		}
	}
	return nil, tenant.ErrTherapistNotFound
}

func (r *fakeTherapistRepo) GetByVerifiedHostname(ctx context.Context, hostname string) (*tenant.Therapist, error) {
	if r.domains == nil {
		return nil, tenant.ErrTherapistNotFound
	}
	d, err := r.domains.GetByHostname(ctx, hostname)
	if err != nil || d.Status != tenant.DomainStatusVerified {
		return nil, tenant.ErrTherapistNotFound
	}
	return r.GetByID(ctx, d.TherapistID)
}

func (r *fakeTherapistRepo) ListOptedInDirectory(_ context.Context) ([]tenant.Therapist, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []tenant.Therapist
	for _, t := range r.therapists {
		if t.DirectoryOptIn {
			out = append(out, t)
		}
	}
	return out, nil
}

func (r *fakeTherapistRepo) UpdateProfile(_ context.Context, t tenant.Therapist) (*tenant.Therapist, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.therapists[t.ID]; !ok {
		return nil, tenant.ErrTherapistNotFound
	}
	t.UpdatedAt = r.clock.Now()
	r.therapists[t.ID] = t
	cp := t
	return &cp, nil
}

type fakeDomainRepo struct {
	mu      sync.Mutex
	clock   *FakeClock
	domains map[string]tenant.TenantDomain
}

func newFakeDomainRepo(clock *FakeClock) *fakeDomainRepo {
	return &fakeDomainRepo{clock: clock, domains: make(map[string]tenant.TenantDomain)}
}

func (r *fakeDomainRepo) GetByID(_ context.Context, id string) (*tenant.TenantDomain, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.domains[id]
	if !ok {
		return nil, tenant.ErrDomainNotFound
	}
	cp := d
	return &cp, nil
}

func (r *fakeDomainRepo) GetByHostname(_ context.Context, hostname string) (*tenant.TenantDomain, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, d := range r.domains {
		if d.Hostname == hostname {
			cp := d
			return &cp, nil
		}
	}
	return nil, tenant.ErrDomainNotFound
}

func (r *fakeDomainRepo) ListByTherapist(_ context.Context, therapistID string) ([]tenant.TenantDomain, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []tenant.TenantDomain
	for _, d := range r.domains {
		if d.TherapistID == therapistID {
			out = append(out, d)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].IsPrimary != out[j].IsPrimary {
			return out[i].IsPrimary
		}
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out, nil
}

func (r *fakeDomainRepo) Create(_ context.Context, d tenant.TenantDomain) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.domains {
		if existing.Hostname == d.Hostname {
			return tenant.ErrDomainAlreadyClaimed
		}
	}
	r.domains[d.ID] = d
	return nil
}

func (r *fakeDomainRepo) MarkVerified(_ context.Context, id string, isPrimary bool, verifiedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	d, ok := r.domains[id]
	if !ok {
		return tenant.ErrDomainNotFound
	}
	if isPrimary {
		for k, other := range r.domains {
			if other.TherapistID == d.TherapistID && other.ID != id && other.IsPrimary {
				other.IsPrimary = false
				r.domains[k] = other
			}
		}
	}
	d.Status = tenant.DomainStatusVerified
	d.IsPrimary = isPrimary
	t := verifiedAt
	d.VerifiedAt = &t
	r.domains[id] = d
	return nil
}

type fakePaymentAccountRepo struct {
	mu       sync.Mutex
	clock    *FakeClock
	accounts map[string]tenant.PaymentAccount
}

func newFakePaymentAccountRepo(clock *FakeClock) *fakePaymentAccountRepo {
	return &fakePaymentAccountRepo{clock: clock, accounts: make(map[string]tenant.PaymentAccount)}
}

func (r *fakePaymentAccountRepo) GetByID(_ context.Context, id string) (*tenant.PaymentAccount, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	acc, ok := r.accounts[id]
	if !ok {
		return nil, tenant.ErrPaymentAccountNotFound
	}
	cp := acc
	return &cp, nil
}

func (r *fakePaymentAccountRepo) ListActiveByTherapistAndTrack(_ context.Context, therapistID string, track tenant.Track) ([]tenant.PaymentAccount, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []tenant.PaymentAccount
	for _, acc := range r.accounts {
		if acc.TherapistID == therapistID && acc.Track == track && acc.IsActive {
			out = append(out, acc)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.Before(out[j].CreatedAt)
	})
	return out, nil
}

func (r *fakePaymentAccountRepo) Upsert(_ context.Context, acc tenant.PaymentAccount) (*tenant.PaymentAccount, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.clock.Now()
	if acc.ID == "" {
		acc.ID = uuid.Must(uuid.NewV7()).String()
		acc.CreatedAt = now
	} else if existing, ok := r.accounts[acc.ID]; ok {
		if existing.TherapistID != acc.TherapistID {
			return nil, tenant.ErrForbidden
		}
		acc.CreatedAt = existing.CreatedAt
	} else {
		acc.CreatedAt = now
	}
	acc.UpdatedAt = now
	r.accounts[acc.ID] = acc
	cp := acc
	return &cp, nil
}

type fakeTXTLookup struct {
	mu      sync.Mutex
	records map[string][]string
}

func newFakeTXTLookup() *fakeTXTLookup {
	return &fakeTXTLookup{records: make(map[string][]string)}
}

func (l *fakeTXTLookup) set(hostname string, records []string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.records[strings.ToLower(strings.TrimSpace(hostname))] = append([]string(nil), records...)
}

func (l *fakeTXTLookup) LookupTXT(_ context.Context, hostname string) ([]string, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	recs := l.records[strings.ToLower(strings.TrimSpace(hostname))]
	return append([]string(nil), recs...), nil
}

type fakeOfferingRepo struct {
	mu        sync.Mutex
	clock     *FakeClock
	offerings map[string]scheduling.ServiceOffering
}

func newFakeOfferingRepo(clock *FakeClock) *fakeOfferingRepo {
	return &fakeOfferingRepo{clock: clock, offerings: make(map[string]scheduling.ServiceOffering)}
}

func (r *fakeOfferingRepo) GetByID(_ context.Context, id string) (*scheduling.ServiceOffering, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	o, ok := r.offerings[id]
	if !ok {
		return nil, scheduling.ErrOfferingNotFound
	}
	cp := o
	return &cp, nil
}

func (r *fakeOfferingRepo) ListActiveByTherapist(_ context.Context, therapistID string, track string) ([]scheduling.ServiceOffering, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []scheduling.ServiceOffering
	for _, o := range r.offerings {
		if o.TherapistID == therapistID && o.Track == track && o.IsActive {
			out = append(out, o)
		}
	}
	return out, nil
}

func (r *fakeOfferingRepo) Upsert(_ context.Context, o scheduling.ServiceOffering) (*scheduling.ServiceOffering, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if o.ID == "" {
		o.ID = uuid.Must(uuid.NewV7()).String()
		o.CreatedAt = r.clock.Now()
	} else if existing, ok := r.offerings[o.ID]; ok {
		if existing.TherapistID != o.TherapistID {
			return nil, scheduling.ErrForbidden
		}
		o.CreatedAt = existing.CreatedAt
	} else if o.CreatedAt.IsZero() {
		o.CreatedAt = r.clock.Now()
	}
	r.offerings[o.ID] = o
	cp := o
	return &cp, nil
}

type fakeWeeklyRuleRepo struct {
	mu    sync.Mutex
	rules map[string][]scheduling.WeeklyAvailabilityRule
}

func newFakeWeeklyRuleRepo() *fakeWeeklyRuleRepo {
	return &fakeWeeklyRuleRepo{rules: make(map[string][]scheduling.WeeklyAvailabilityRule)}
}

func (r *fakeWeeklyRuleRepo) ListActiveByTherapist(_ context.Context, therapistID string) ([]scheduling.WeeklyAvailabilityRule, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []scheduling.WeeklyAvailabilityRule
	for _, rule := range r.rules[therapistID] {
		if rule.IsActive {
			out = append(out, rule)
		}
	}
	return out, nil
}

func (r *fakeWeeklyRuleRepo) ReplaceForTherapist(_ context.Context, therapistID string, rules []scheduling.WeeklyAvailabilityRule) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	cp := make([]scheduling.WeeklyAvailabilityRule, len(rules))
	copy(cp, rules)
	r.rules[therapistID] = cp
	return nil
}

type fakeOverrideRepo struct {
	mu        sync.Mutex
	overrides map[string]scheduling.AvailabilityOverride
}

func newFakeOverrideRepo() *fakeOverrideRepo {
	return &fakeOverrideRepo{overrides: make(map[string]scheduling.AvailabilityOverride)}
}

func (r *fakeOverrideRepo) GetByID(_ context.Context, id string) (*scheduling.AvailabilityOverride, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ov, ok := r.overrides[id]
	if !ok {
		return nil, scheduling.ErrOverrideNotFound
	}
	cp := ov
	return &cp, nil
}

func (r *fakeOverrideRepo) ListByTherapistInRange(_ context.Context, therapistID string, from time.Time, to time.Time) ([]scheduling.AvailabilityOverride, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	fromDay := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	toDay := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC)
	var out []scheduling.AvailabilityOverride
	for _, ov := range r.overrides {
		if ov.TherapistID != therapistID {
			continue
		}
		ovDay := time.Date(ov.OverrideDate.Year(), ov.OverrideDate.Month(), ov.OverrideDate.Day(), 0, 0, 0, 0, time.UTC)
		if !ovDay.Before(fromDay) && !ovDay.After(toDay) {
			out = append(out, ov)
		}
	}
	return out, nil
}

func (r *fakeOverrideRepo) Upsert(_ context.Context, ov scheduling.AvailabilityOverride) (*scheduling.AvailabilityOverride, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	idWasEmpty := strings.TrimSpace(ov.ID) == ""
	if idWasEmpty {
		ov.ID = uuid.Must(uuid.NewV7()).String()
	} else if existing, ok := r.overrides[ov.ID]; ok && existing.TherapistID != ov.TherapistID {
		return nil, scheduling.ErrForbidden
	}

	ovDay := time.Date(ov.OverrideDate.Year(), ov.OverrideDate.Month(), ov.OverrideDate.Day(), 0, 0, 0, 0, time.UTC)
	ov.OverrideDate = ovDay
	for k, existing := range r.overrides {
		if existing.TherapistID != ov.TherapistID || k == ov.ID {
			continue
		}
		exDay := time.Date(existing.OverrideDate.Year(), existing.OverrideDate.Month(), existing.OverrideDate.Day(), 0, 0, 0, 0, time.UTC)
		if !exDay.Equal(ovDay) {
			continue
		}
		if ov.IsClosed || idWasEmpty {
			delete(r.overrides, k)
		} else if existing.IsClosed {
			delete(r.overrides, k)
		} else if ov.StartMinute != nil && existing.StartMinute != nil && *ov.StartMinute == *existing.StartMinute {
			delete(r.overrides, k)
		}
	}

	r.overrides[ov.ID] = ov
	cp := ov
	return &cp, nil
}

type fakeBookingRepo struct {
	mu       sync.Mutex
	bookings map[string]booking.Booking
	receipts map[string]booking.BookingReceipt
	events   []booking.BookingStatusEvent
}

func newFakeBookingRepo() *fakeBookingRepo {
	return &fakeBookingRepo{
		bookings: make(map[string]booking.Booking),
		receipts: make(map[string]booking.BookingReceipt),
	}
}

func (r *fakeBookingRepo) seed(b booking.Booking) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if b.ID == "" {
		b.ID = uuid.Must(uuid.NewV7()).String()
	}
	r.bookings[b.ID] = b
	return nil
}

func (r *fakeBookingRepo) AcquireClientHoldLock(_ context.Context, _ string) error {
	return nil
}

func (r *fakeBookingRepo) FindByIdempotencyKey(_ context.Context, clientUserID string, idempotencyKey string) (*booking.Booking, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, b := range r.bookings {
		if b.ClientUserID == clientUserID && b.IdempotencyKey == idempotencyKey {
			cp := b
			return &cp, nil
		}
	}
	return nil, nil
}

func (r *fakeBookingRepo) GetByID(_ context.Context, id string) (*booking.Booking, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	b, ok := r.bookings[id]
	if !ok {
		return nil, booking.ErrBookingNotFound
	}
	cp := b
	return &cp, nil
}

func (r *fakeBookingRepo) GetByIDForUpdate(ctx context.Context, id string) (*booking.Booking, error) {
	return r.GetByID(ctx, id)
}

func (r *fakeBookingRepo) CountActiveHoldsByClientAndTherapist(_ context.Context, clientUserID string, therapistID string, now time.Time) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	count := 0
	for _, b := range r.bookings {
		if b.ClientUserID == clientUserID && b.TherapistID == therapistID && b.Status == booking.StatusHeld {
			if b.HoldExpiresAt == nil || b.HoldExpiresAt.After(now) {
				count++
			}
		}
	}
	return count, nil
}

func (r *fakeBookingRepo) CreateHold(_ context.Context, b booking.Booking) (*booking.Booking, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.bookings {
		if existing.ClientUserID == b.ClientUserID && existing.IdempotencyKey == b.IdempotencyKey {
			return nil, errors.New("duplicate idempotency key")
		}
		if existing.TherapistID == b.TherapistID && isBlockingStatus(existing.Status) {
			if b.SlotStart.Before(existing.SlotEnd) && b.SlotEnd.After(existing.SlotStart) {
				return nil, booking.ErrSlotConflict
			}
		}
	}
	r.bookings[b.ID] = b
	cp := b
	return &cp, nil
}

func (r *fakeBookingRepo) UpdateStatus(_ context.Context, id string, status booking.BookingStatus, rejectionReason *string, callJoinURL *string, updatedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	b, ok := r.bookings[id]
	if !ok {
		return booking.ErrBookingNotFound
	}
	b.Status = status
	b.RejectionReason = rejectionReason
	b.CallJoinURL = callJoinURL
	b.UpdatedAt = updatedAt
	r.bookings[id] = b
	return nil
}

func (r *fakeBookingRepo) CreateReceipt(_ context.Context, rec booking.BookingReceipt) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.receipts[rec.BookingID]; exists {
		return booking.ErrInvalidTransition
	}
	for _, existing := range r.receipts {
		if existing.MediaObjectID == rec.MediaObjectID {
			return booking.ErrReceiptAlreadyUsed
		}
	}
	r.receipts[rec.BookingID] = rec
	return nil
}

func (r *fakeBookingRepo) GetReceiptByBookingID(_ context.Context, bookingID string) (*booking.BookingReceipt, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	rec, ok := r.receipts[bookingID]
	if !ok {
		return nil, booking.ErrBookingNotFound
	}
	cp := rec
	return &cp, nil
}

func (r *fakeBookingRepo) AppendStatusEvent(_ context.Context, ev booking.BookingStatusEvent) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, ev)
	return nil
}

func (r *fakeBookingRepo) ExpireStaleHoldsBatch(_ context.Context, cutoff time.Time, limit int) (int, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	count := 0
	for id, b := range r.bookings {
		if count >= limit {
			break
		}
		if b.Status == booking.StatusHeld && b.HoldExpiresAt != nil && b.HoldExpiresAt.Before(cutoff) {
			from := booking.StatusHeld
			b.Status = booking.StatusExpired
			b.UpdatedAt = cutoff
			r.bookings[id] = b
			r.events = append(r.events, booking.BookingStatusEvent{
				ID:         uuid.Must(uuid.NewV7()).String(),
				BookingID:  id,
				FromStatus: &from,
				ToStatus:   booking.StatusExpired,
				Reason:     "hold_ttl_expired",
				CreatedAt:  cutoff,
			})
			count++
		}
	}
	return count, nil
}

func (r *fakeBookingRepo) ListByTherapist(_ context.Context, therapistID string, status *booking.BookingStatus) ([]booking.Booking, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []booking.Booking
	for _, b := range r.bookings {
		if b.TherapistID == therapistID && (status == nil || b.Status == *status) {
			out = append(out, b)
		}
	}
	return out, nil
}

func (r *fakeBookingRepo) ListByClient(_ context.Context, clientUserID string) ([]booking.Booking, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []booking.Booking
	for _, b := range r.bookings {
		if b.ClientUserID == clientUserID {
			out = append(out, b)
		}
	}
	return out, nil
}

func (r *fakeBookingRepo) listBusySlots(_ context.Context, therapistID string, from time.Time, to time.Time) ([]scheduling.BusySlot, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []scheduling.BusySlot
	for _, b := range r.bookings {
		if b.TherapistID == therapistID && isBlockingStatus(b.Status) {
			if b.SlotStart.Before(to) && b.SlotEnd.After(from) {
				out = append(out, scheduling.BusySlot{StartAt: b.SlotStart, EndAt: b.SlotEnd})
			}
		}
	}
	return out, nil
}

func (r *fakeBookingRepo) hasActiveHold(bookingID string, clientUserID string, now time.Time) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	b, ok := r.bookings[bookingID]
	if !ok {
		return false
	}
	if b.ClientUserID != clientUserID || b.Status != booking.StatusHeld {
		return false
	}
	return b.HoldExpiresAt == nil || b.HoldExpiresAt.After(now)
}

func (r *fakeBookingRepo) findByReceiptMediaID(mediaObjectID string) (booking.Booking, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, rec := range r.receipts {
		if rec.MediaObjectID == mediaObjectID {
			if b, ok := r.bookings[rec.BookingID]; ok {
				return b, true
			}
		}
	}
	return booking.Booking{}, false
}

func isBlockingStatus(s booking.BookingStatus) bool {
	switch s {
	case booking.StatusHeld, booking.StatusPendingVerification, booking.StatusConfirmed, booking.StatusCompleted:
		return true
	default:
		return false
	}
}

type fakeBookingNotifier struct {
	mu     sync.Mutex
	events []BookingNotification
}

func newFakeBookingNotifier() *fakeBookingNotifier {
	return &fakeBookingNotifier{}
}

func (n *fakeBookingNotifier) NotifyReceiptSubmitted(_ context.Context, b booking.Booking) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.events = append(n.events, BookingNotification{Event: "receipt_submitted", BookingID: b.ID, Status: b.Status})
	return nil
}

func (n *fakeBookingNotifier) NotifyBookingApproved(_ context.Context, b booking.Booking) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.events = append(n.events, BookingNotification{Event: "booking_approved", BookingID: b.ID, Status: b.Status})
	return nil
}

func (n *fakeBookingNotifier) NotifyBookingRejected(_ context.Context, b booking.Booking) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.events = append(n.events, BookingNotification{Event: "booking_rejected", BookingID: b.ID, Status: b.Status})
	return nil
}

func (n *fakeBookingNotifier) list() []BookingNotification {
	n.mu.Lock()
	defer n.mu.Unlock()
	out := make([]BookingNotification, len(n.events))
	copy(out, n.events)
	return out
}

type fakeMediaRepo struct {
	mu      sync.Mutex
	objects map[string]media.MediaObject
}

func newFakeMediaRepo() *fakeMediaRepo {
	return &fakeMediaRepo{objects: make(map[string]media.MediaObject)}
}

func (r *fakeMediaRepo) Create(_ context.Context, obj media.MediaObject) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.objects[obj.ID] = obj
	return nil
}

func (r *fakeMediaRepo) GetByID(_ context.Context, id string) (*media.MediaObject, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	obj, ok := r.objects[id]
	if !ok {
		return nil, media.ErrMediaNotFound
	}
	cp := obj
	return &cp, nil
}

func (r *fakeMediaRepo) MarkConfirmed(_ context.Context, id string, sha256Hex string, confirmedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	obj, ok := r.objects[id]
	if !ok {
		return media.ErrMediaNotFound
	}
	obj.Status = media.MediaStatusConfirmed
	h := sha256Hex
	obj.SHA256Hex = &h
	t := confirmedAt
	obj.ConfirmedAt = &t
	r.objects[id] = obj
	return nil
}

func (r *fakeMediaRepo) MarkDeleted(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	obj, ok := r.objects[id]
	if !ok {
		return media.ErrMediaNotFound
	}
	obj.Status = media.MediaStatusDeleted
	r.objects[id] = obj
	return nil
}

type fakeObjectStorage struct {
	mu      sync.Mutex
	objects map[string][]byte
}

func newFakeObjectStorage() *fakeObjectStorage {
	return &fakeObjectStorage{objects: make(map[string][]byte)}
}

func storageKey(bucket media.BucketKind, key string) string {
	return string(bucket) + "/" + key
}

func (s *fakeObjectStorage) putObject(bucket media.BucketKind, key string, data []byte) {
	s.mu.Lock()
	defer s.mu.Unlock()
	cp := make([]byte, len(data))
	copy(cp, data)
	s.objects[storageKey(bucket, key)] = cp
}

func (s *fakeObjectStorage) hasObject(bucket media.BucketKind, key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, ok := s.objects[storageKey(bucket, key)]
	return ok
}

func (s *fakeObjectStorage) PresignPut(_ context.Context, bucket media.BucketKind, key string, _ media.AllowedMIMEType, _ int64, _ time.Duration) (string, error) {
	return "https://s3.local/" + string(bucket) + "/" + key + "?presign=put", nil
}

func (s *fakeObjectStorage) PresignGet(_ context.Context, bucket media.BucketKind, key string, _ time.Duration) (string, error) {
	return "https://s3.local/" + string(bucket) + "/" + key + "?presign=get", nil
}

func (s *fakeObjectStorage) HeadObject(_ context.Context, bucket media.BucketKind, key string) (*media.ObjectMetadata, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.objects[storageKey(bucket, key)]
	if !ok {
		return nil, media.ErrInvalidReceiptFile
	}
	return &media.ObjectMetadata{
		ContentLength: int64(len(data)),
		ETag:          "etag-fake",
	}, nil
}

func (s *fakeObjectStorage) GetObjectRange(_ context.Context, bucket media.BucketKind, key string, startByte int64, endByte int64) ([]byte, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	data, ok := s.objects[storageKey(bucket, key)]
	if !ok {
		return nil, media.ErrInvalidReceiptFile
	}
	if startByte < 0 || startByte >= int64(len(data)) {
		return nil, nil
	}
	end := endByte + 1
	if end > int64(len(data)) {
		end = int64(len(data))
	}
	out := make([]byte, end-startByte)
	copy(out, data[startByte:end])
	return out, nil
}

func (s *fakeObjectStorage) DeleteObject(_ context.Context, bucket media.BucketKind, key string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.objects, storageKey(bucket, key))
	return nil
}

type fakeBlogRepo struct {
	mu    sync.Mutex
	clock *FakeClock
	posts map[string]content.BlogPost
}

func newFakeBlogRepo(clock *FakeClock) *fakeBlogRepo {
	return &fakeBlogRepo{clock: clock, posts: make(map[string]content.BlogPost)}
}

func (r *fakeBlogRepo) GetByID(_ context.Context, id string) (*content.BlogPost, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	p, ok := r.posts[id]
	if !ok {
		return nil, content.ErrPostNotFound
	}
	cp := p
	return &cp, nil
}

func (r *fakeBlogRepo) ListPublishedByTherapist(_ context.Context, therapistID string) ([]content.BlogPost, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []content.BlogPost
	for _, p := range r.posts {
		if p.TherapistID == therapistID && p.Status == content.PostStatusPublished {
			out = append(out, p)
		}
	}
	return out, nil
}

func (r *fakeBlogRepo) ListAllByTherapist(_ context.Context, therapistID string) ([]content.BlogPost, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []content.BlogPost
	for _, p := range r.posts {
		if p.TherapistID == therapistID {
			out = append(out, p)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].UpdatedAt.After(out[j].UpdatedAt)
	})
	return out, nil
}

func (r *fakeBlogRepo) GetPublishedBySlug(_ context.Context, therapistID string, slug string) (*content.BlogPost, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, p := range r.posts {
		if p.TherapistID == therapistID && p.Slug == slug && p.Status == content.PostStatusPublished {
			cp := p
			return &cp, nil
		}
	}
	return nil, content.ErrPostNotFound
}

func (r *fakeBlogRepo) Upsert(_ context.Context, post content.BlogPost) (*content.BlogPost, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	now := r.clock.Now()
	if post.ID == "" {
		post.ID = uuid.Must(uuid.NewV7()).String()
	}
	if existing, ok := r.posts[post.ID]; ok {
		if existing.TherapistID != post.TherapistID {
			return nil, content.ErrForbidden
		}
		for k, other := range r.posts {
			if k != post.ID && other.TherapistID == post.TherapistID && other.Slug == post.Slug {
				return nil, content.ErrSlugConflict
			}
		}
		post.CreatedAt = existing.CreatedAt
		post.UpdatedAt = now
		r.posts[post.ID] = post
		cp := post
		return &cp, nil
	}
	for _, existing := range r.posts {
		if existing.TherapistID == post.TherapistID && existing.Slug == post.Slug {
			return nil, content.ErrSlugConflict
		}
	}
	post.CreatedAt = now
	post.UpdatedAt = now
	r.posts[post.ID] = post
	cp := post
	return &cp, nil
}

type fakeReviewRepo struct {
	mu      sync.Mutex
	reviews map[string]content.Review
}

func newFakeReviewRepo() *fakeReviewRepo {
	return &fakeReviewRepo{reviews: make(map[string]content.Review)}
}

func (r *fakeReviewRepo) GetByBookingID(_ context.Context, bookingID string) (*content.Review, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, rev := range r.reviews {
		if rev.BookingID == bookingID {
			cp := rev
			return &cp, nil
		}
	}
	return nil, nil
}

func (r *fakeReviewRepo) Create(_ context.Context, rev content.Review) (*content.Review, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, existing := range r.reviews {
		if existing.BookingID == rev.BookingID {
			return nil, content.ErrReviewAlreadyExists
		}
	}
	r.reviews[rev.ID] = rev
	cp := rev
	return &cp, nil
}

func (r *fakeReviewRepo) ListPublishedByTherapist(_ context.Context, therapistID string) ([]content.Review, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []content.Review
	for _, rev := range r.reviews {
		if rev.TherapistID == therapistID && rev.IsPublished {
			out = append(out, rev)
		}
	}
	return out, nil
}
