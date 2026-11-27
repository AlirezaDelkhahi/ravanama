//go:build integration

package postgres_test

import (
	"context"
	"errors"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
	"github.com/ravannama/ravannama/backend/migrations"
)

type controllableClock struct {
	mu  sync.Mutex
	now time.Time
}

func newControllableClock(t time.Time) *controllableClock {
	return &controllableClock{now: t.UTC()}
}

func (c *controllableClock) Now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.now
}

func (c *controllableClock) Set(t time.Time) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.now = t.UTC()
}

type noopBookingNotifier struct{}

func (noopBookingNotifier) NotifyReceiptSubmitted(_ context.Context, _ booking.Booking) error {
	return nil
}
func (noopBookingNotifier) NotifyBookingApproved(_ context.Context, _ booking.Booking) error {
	return nil
}
func (noopBookingNotifier) NotifyBookingRejected(_ context.Context, _ booking.Booking) error {
	return nil
}

func openTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is not set; skipping postgres integration tests")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("pgxpool.New failed: %v", err)
	}
	t.Cleanup(pool.Close)

	if err := applyMigrationsIdempotently(ctx, pool); err != nil {
		t.Fatalf("applyMigrationsIdempotently failed: %v", err)
	}
	return pool
}

func applyMigrationsIdempotently(ctx context.Context, pool *pgxpool.Pool) error {
	var reg *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('booking.bookings')::text`).Scan(&reg); err != nil {
		return err
	}
	if reg != nil {
		return nil
	}
	_, err := pool.Exec(ctx, migrations.InitUpSQL())
	return err
}

type seededFixtures struct {
	therapistUserID string
	therapistID     string
	client1ID       string
	client2ID       string
	offeringID      string
}

func seedIntegrationFixtures(t *testing.T, ctx context.Context, pool *pgxpool.Pool) seededFixtures {
	t.Helper()
	raw := uuid.Must(uuid.NewV7()).String()
	suffix := raw[24:]
	f := seededFixtures{
		therapistUserID: uuid.Must(uuid.NewV7()).String(),
		therapistID:     uuid.Must(uuid.NewV7()).String(),
		client1ID:       uuid.Must(uuid.NewV7()).String(),
		client2ID:       uuid.Must(uuid.NewV7()).String(),
		offeringID:      uuid.Must(uuid.NewV7()).String(),
	}

	_, err := pool.Exec(ctx, `
		INSERT INTO identity.users (id, role, full_name, phone_e164)
		VALUES
			($1, 'therapist', 'Dr Test', $2),
			($3, 'client', 'Client 1', $4),
			($5, 'client', 'Client 2', $6)
	`, f.therapistUserID, "+98910"+suffix+"1", f.client1ID, "+98910"+suffix+"2", f.client2ID, "+98910"+suffix+"3")
	if err != nil {
		t.Fatalf("seed users: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO tenant.therapists (id, user_id, slug, display_name, headline)
		VALUES ($1, $2, $3, 'دکتر تست', 'روانشناس بالینی')
	`, f.therapistID, f.therapistUserID, "dr-test-"+suffix)
	if err != nil {
		t.Fatalf("seed therapist: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO tenant.therapist_payment_accounts (id, therapist_id, track, method, account_label, destination_val, holder_name, is_active)
		VALUES ($1, $2, 'iran', 'card_to_card', 'کارت سامان', '6219861000000001', 'دکتر تست', true)
	`, uuid.Must(uuid.NewV7()).String(), f.therapistID)
	if err != nil {
		t.Fatalf("seed payment account: %v", err)
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO scheduling.service_offerings (id, therapist_id, track, title, duration_min, currency, price_amount, is_active)
		VALUES ($1, $2, 'iran', 'جلسه تست', 50, 'IRT', 1200000, true)
	`, f.offeringID, f.therapistID)
	if err != nil {
		t.Fatalf("seed offering: %v", err)
	}

	t.Cleanup(func() {
		cleanCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = pool.Exec(cleanCtx, `DELETE FROM booking.bookings WHERE therapist_id = $1`, f.therapistID)
		_, _ = pool.Exec(cleanCtx, `DELETE FROM media.media_objects WHERE owner_user_id IN ($1, $2)`, f.client1ID, f.client2ID)
		_, _ = pool.Exec(cleanCtx, `DELETE FROM tenant.therapists WHERE id = $1`, f.therapistID)
		_, _ = pool.Exec(cleanCtx, `DELETE FROM identity.users WHERE id IN ($1, $2, $3)`, f.therapistUserID, f.client1ID, f.client2ID)
	})

	return f
}

func seedConfirmedPrivateMedia(t *testing.T, ctx context.Context, pool *pgxpool.Pool, ownerUserID string) string {
	t.Helper()
	mid := uuid.Must(uuid.NewV7()).String()
	_, err := pool.Exec(ctx, `
		INSERT INTO media.media_objects (id, owner_user_id, bucket_kind, object_key, mime_type, size_bytes, status, sha256_hex, confirmed_at)
		VALUES ($1, $2, 'private', $3, 'image/jpeg', 1024, 'confirmed', 'deadbeef', now())
	`, mid, ownerUserID, fmt.Sprintf("receipts/%s/%s.jpg", ownerUserID, mid))
	if err != nil {
		t.Fatalf("seed media_object: %v", err)
	}
	return mid
}

func newRealBookingService(pool *pgxpool.Pool, clock *controllableClock) *booking.Service {
	txMgr := postgres.NewTxManager(pool)
	repo := postgres.NewBookingRepository(pool, txMgr)
	lookups := postgres.NewBookingLookupAdapters(pool)
	return booking.NewService(repo, txMgr, lookups, lookups, lookups, noopBookingNotifier{}, clock)
}

func TestConcurrentCreateHold_GistExclusion23P01(t *testing.T) {
	pool := openTestPool(t)
	ctx := context.Background()
	f := seedIntegrationFixtures(t, ctx, pool)

	clock := newControllableClock(time.Now().UTC())
	svc := newRealBookingService(pool, clock)
	slotStart := clock.Now().Add(24 * time.Hour).Truncate(time.Second)

	startBarrier := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, 2)
	results := make([]*booking.HoldResult, 2)

	clients := []string{f.client1ID, f.client2ID}
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-startBarrier
			res, err := svc.CreateHold(ctx, booking.HoldRequest{
				TherapistID:       f.therapistID,
				ClientUserID:      clients[idx],
				ServiceOfferingID: f.offeringID,
				Track:             "iran",
				ClientTimezone:    "Asia/Tehran",
				SlotStart:         slotStart,
				IdempotencyKey:    fmt.Sprintf("conc-hold-%d-%s", idx, uuid.Must(uuid.NewV7()).String()),
			})
			results[idx] = res
			errs[idx] = err
		}(i)
	}
	close(startBarrier)
	wg.Wait()

	successes := 0
	conflicts := 0
	for i := 0; i < 2; i++ {
		if errs[i] == nil && results[i] != nil && results[i].Booking.Status == booking.StatusHeld {
			successes++
		} else if errors.Is(errs[i], booking.ErrSlotConflict) {
			conflicts++
		} else {
			t.Fatalf("goroutine %d unexpected outcome: res=%+v err=%v", i, results[i], errs[i])
		}
	}
	if successes != 1 || conflicts != 1 {
		t.Fatalf("expected exactly 1 success and 1 ErrSlotConflict (23P01), got successes=%d conflicts=%d", successes, conflicts)
	}
}

func TestConcurrentSubmitReceiptVsExpireStaleHolds(t *testing.T) {
	pool := openTestPool(t)
	ctx := context.Background()
	f := seedIntegrationFixtures(t, ctx, pool)

	const iterations = 10
	for i := 0; i < iterations; i++ {
		baseNow := time.Now().UTC().Truncate(time.Millisecond)
		clock := newControllableClock(baseNow)
		svc := newRealBookingService(pool, clock)

		slotStart := baseNow.Add(time.Duration(48+i*2) * time.Hour)
		holdRes, err := svc.CreateHold(ctx, booking.HoldRequest{
			TherapistID:       f.therapistID,
			ClientUserID:      f.client1ID,
			ServiceOfferingID: f.offeringID,
			Track:             "iran",
			ClientTimezone:    "Asia/Tehran",
			SlotStart:         slotStart,
			IdempotencyKey:    fmt.Sprintf("race-sr-%d-%s", i, uuid.Must(uuid.NewV7()).String()),
		})
		if err != nil {
			t.Fatalf("iter %d CreateHold failed: %v", i, err)
		}
		mediaID := seedConfirmedPrivateMedia(t, ctx, pool, f.client1ID)

		// Alternate between racing just before expiry (either outcome valid) and just past expiry (must end expired).
		cutoff := holdRes.Booking.HoldExpiresAt.Add(1 * time.Second)
		if i%2 == 0 {
			clock.Set(holdRes.Booking.HoldExpiresAt.Add(-1 * time.Millisecond))
		} else {
			clock.Set(holdRes.Booking.HoldExpiresAt.Add(500 * time.Millisecond))
		}

		startBarrier := make(chan struct{})
		var wg sync.WaitGroup
		var submitErr error
		var submitRes *booking.Booking
		var swept int
		var expireErr error

		wg.Add(2)
		go func() {
			defer wg.Done()
			<-startBarrier
			submitRes, submitErr = svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
				BookingID:     holdRes.Booking.ID,
				ClientUserID:  f.client1ID,
				MediaObjectID: mediaID,
				TrackingCode:  fmt.Sprintf("TRK-%d", i),
			})
		}()
		go func() {
			defer wg.Done()
			<-startBarrier
			swept, expireErr = svc.ExpireStaleHolds(ctx, cutoff)
		}()
		close(startBarrier)
		wg.Wait()

		if expireErr != nil {
			t.Fatalf("iter %d ExpireStaleHolds error: %v", i, expireErr)
		}

		var dbStatus string
		if err := pool.QueryRow(ctx, `SELECT status FROM booking.bookings WHERE id = $1`, holdRes.Booking.ID).Scan(&dbStatus); err != nil {
			t.Fatalf("iter %d query booking status: %v", i, err)
		}
		var receiptCount int
		if err := pool.QueryRow(ctx, `SELECT count(*)::int FROM booking.booking_receipts WHERE booking_id = $1`, holdRes.Booking.ID).Scan(&receiptCount); err != nil {
			t.Fatalf("iter %d query receipt count: %v", i, err)
		}

		switch dbStatus {
		case string(booking.StatusPendingVerification):
			if submitErr != nil || submitRes == nil || receiptCount != 1 || swept != 0 {
				t.Fatalf("iter %d inconsistent pending_verification state: submitErr=%v receiptCount=%d swept=%d", i, submitErr, receiptCount, swept)
			}
		case string(booking.StatusExpired):
			if !errors.Is(submitErr, booking.ErrHoldExpired) || receiptCount != 0 {
				t.Fatalf("iter %d inconsistent expired state: submitErr=%v receiptCount=%d swept=%d", i, submitErr, receiptCount, swept)
			}
		default:
			t.Fatalf("iter %d unexpected final db status %q (submitErr=%v swept=%d)", i, dbStatus, submitErr, swept)
		}
	}
}

func TestRejectedBookingFreesSlotForImmediateRebook(t *testing.T) {
	pool := openTestPool(t)
	ctx := context.Background()
	f := seedIntegrationFixtures(t, ctx, pool)

	clock := newControllableClock(time.Now().UTC())
	svc := newRealBookingService(pool, clock)
	slotStart := clock.Now().Add(72 * time.Hour).Truncate(time.Second)

	hold1, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       f.therapistID,
		ClientUserID:      f.client1ID,
		ServiceOfferingID: f.offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slotStart,
		IdempotencyKey:    "rej-flow-1",
	})
	if err != nil {
		t.Fatalf("CreateHold 1 failed: %v", err)
	}
	mediaID := seedConfirmedPrivateMedia(t, ctx, pool, f.client1ID)

	if _, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
		BookingID:     hold1.Booking.ID,
		ClientUserID:  f.client1ID,
		MediaObjectID: mediaID,
		TrackingCode:  "TRK-REJ",
	}); err != nil {
		t.Fatalf("SubmitReceipt failed: %v", err)
	}

	rejected, err := svc.RejectBooking(ctx, booking.RejectBookingRequest{
		BookingID:       hold1.Booking.ID,
		TherapistID:     f.therapistID,
		ActorUserID:     f.therapistUserID,
		RejectionReason: "تصویر رسید تار است",
	})
	if err != nil {
		t.Fatalf("RejectBooking failed: %v", err)
	}
	if rejected.Status != booking.StatusRejected {
		t.Fatalf("expected rejected status, got %s", rejected.Status)
	}

	// Immediate rebook on exact same slot_range must succeed with zero 23P01 conflict
	rebook, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       f.therapistID,
		ClientUserID:      f.client2ID,
		ServiceOfferingID: f.offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slotStart,
		IdempotencyKey:    "rej-flow-rebook",
	})
	if err != nil {
		t.Fatalf("expected immediate rebook to succeed after rejection, got %v", err)
	}
	if rebook.Booking.Status != booking.StatusHeld {
		t.Fatalf("expected held status on rebook, got %s", rebook.Booking.Status)
	}
}

func TestRepoSecurity_CrossTenantIDORAndSameDateOverride(t *testing.T) {
	pool := openTestPool(t)
	ctx := context.Background()
	victim := seedIntegrationFixtures(t, ctx, pool)
	attacker := seedIntegrationFixtures(t, ctx, pool)

	txMgr := postgres.NewTxManager(pool)
	payRepo := postgres.NewPaymentAccountRepository(pool)
	offRepo := postgres.NewOfferingRepository(pool)
	ovRepo := postgres.NewOverrideRepository(pool, txMgr)
	blogRepo := postgres.NewBlogRepository(pool)

	// Seed victim payment account & blog post via repositories
	victimPay, err := payRepo.Upsert(ctx, tenant.PaymentAccount{
		TherapistID:    victim.therapistID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodCardToCard,
		AccountLabel:   "کارت قربانی",
		DestinationVal: "6219861000001111",
		HolderName:     "دکتر قربانی",
		IsActive:       true,
	})
	if err != nil {
		t.Fatalf("seed victim payment account: %v", err)
	}

	targetDate := time.Date(2026, 12, 5, 0, 0, 0, 0, time.UTC)
	victimOv, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victim.therapistID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "تعطیل اولیه",
	})
	if err != nil {
		t.Fatalf("seed victim override: %v", err)
	}

	now := time.Now().UTC()
	victimPost, err := blogRepo.Upsert(ctx, content.BlogPost{
		TherapistID:  victim.therapistID,
		Slug:         "victim-original-slug",
		Title:        "عنوان قربانی",
		BodyMarkdown: "متن قربانی",
		ReadingMin:   4,
		Status:       content.PostStatusPublished,
		PublishedAt:  &now,
		CreatedAt:    now,
		UpdatedAt:    now,
	})
	if err != nil {
		t.Fatalf("seed victim blog post: %v", err)
	}

	// 1. Cross-tenant IDOR UpsertPaymentAccount -> tenant.ErrForbidden
	if _, err := payRepo.Upsert(ctx, tenant.PaymentAccount{
		ID:             victimPay.ID,
		TherapistID:    attacker.therapistID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodCardToCard,
		AccountLabel:   "Hacked",
		DestinationVal: "6219861099999999",
		HolderName:     "Attacker",
		IsActive:       true,
	}); !errors.Is(err, tenant.ErrForbidden) {
		t.Fatalf("expected tenant.ErrForbidden on cross-tenant UpsertPaymentAccount, got %v", err)
	}

	// 2. Cross-tenant IDOR UpsertOffering -> scheduling.ErrForbidden
	if _, err := offRepo.Upsert(ctx, scheduling.ServiceOffering{
		ID:          victim.offeringID,
		TherapistID: attacker.therapistID,
		Track:       "iran",
		Title:       "Hacked",
		DurationMin: 50,
		Currency:    scheduling.CurrencyIRT,
		PriceAmount: 1000,
		IsActive:    true,
	}); !errors.Is(err, scheduling.ErrForbidden) {
		t.Fatalf("expected scheduling.ErrForbidden on cross-tenant UpsertOffering, got %v", err)
	}

	// 3. Cross-tenant IDOR UpsertOverride -> scheduling.ErrForbidden
	if _, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		ID:           victimOv.ID,
		TherapistID:  attacker.therapistID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "Hacked",
	}); !errors.Is(err, scheduling.ErrForbidden) {
		t.Fatalf("expected scheduling.ErrForbidden on cross-tenant UpsertOverride, got %v", err)
	}

	// 4. Cross-tenant IDOR UpsertBlogPost -> content.ErrForbidden
	if _, err := blogRepo.Upsert(ctx, content.BlogPost{
		ID:           victimPost.ID,
		TherapistID:  attacker.therapistID,
		Slug:         "hijacked-post",
		Title:        "Hacked",
		BodyMarkdown: "Hacked",
		ReadingMin:   3,
		Status:       content.PostStatusPublished,
		UpdatedAt:    now,
	}); !errors.Is(err, content.ErrForbidden) {
		t.Fatalf("expected content.ErrForbidden on cross-tenant UpsertBlogPost, got %v", err)
	}

	// Verify victim records are completely intact in PostgreSQL
	var dest string
	if err := pool.QueryRow(ctx, `SELECT destination_val FROM tenant.therapist_payment_accounts WHERE id = $1`, victimPay.ID).Scan(&dest); err != nil || dest != "6219861000001111" {
		t.Fatalf("victim payment account mutated: dest=%q err=%v", dest, err)
	}
	var offTitle string
	if err := pool.QueryRow(ctx, `SELECT title FROM scheduling.service_offerings WHERE id = $1`, victim.offeringID).Scan(&offTitle); err != nil || offTitle != "جلسه تست" {
		t.Fatalf("victim offering mutated: title=%q err=%v", offTitle, err)
	}
	var ovReason string
	if err := pool.QueryRow(ctx, `SELECT reason FROM scheduling.availability_overrides WHERE id = $1`, victimOv.ID).Scan(&ovReason); err != nil || ovReason != "تعطیل اولیه" {
		t.Fatalf("victim override mutated: reason=%q err=%v", ovReason, err)
	}
	var postTitle string
	if err := pool.QueryRow(ctx, `SELECT title FROM content.blog_posts WHERE id = $1`, victimPost.ID).Scan(&postTitle); err != nil || postTitle != "عنوان قربانی" {
		t.Fatalf("victim blog post mutated: title=%q err=%v", postTitle, err)
	}

	// 5. Same-date override replacement without ID (closed -> closed -> custom -> same start_minute -> different start_minute -> closed)
	if _, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victim.therapistID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "تعطیل مجدد",
	}); err != nil {
		t.Fatalf("repeat closed UpsertOverride without ID failed (23505?): %v", err)
	}

	s1, e1 := int16(600), int16(840)
	if _, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victim.therapistID,
		OverrideDate: targetDate,
		IsClosed:     false,
		StartMinute:  &s1,
		EndMinute:    &e1,
		Reason:       "ساعت ویژه ۱",
	}); err != nil {
		t.Fatalf("closed -> custom_hours without ID failed: %v", err)
	}

	e1Updated := int16(900)
	if _, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victim.therapistID,
		OverrideDate: targetDate,
		IsClosed:     false,
		StartMinute:  &s1,
		EndMinute:    &e1Updated,
		Reason:       "ساعت ویژه ۱ تمدید",
	}); err != nil {
		t.Fatalf("same start_minute custom_hours without ID failed: %v", err)
	}

	s2, e2 := int16(720), int16(960)
	if _, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victim.therapistID,
		OverrideDate: targetDate,
		IsClosed:     false,
		StartMinute:  &s2,
		EndMinute:    &e2,
		Reason:       "ساعت ویژه ۲",
	}); err != nil {
		t.Fatalf("different start_minute custom_hours without ID failed: %v", err)
	}

	if _, err := ovRepo.Upsert(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victim.therapistID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "تعطیل نهایی",
	}); err != nil {
		t.Fatalf("custom_hours -> closed without ID failed: %v", err)
	}

	rows, err := ovRepo.ListByTherapistInRange(ctx, victim.therapistID, targetDate, targetDate)
	if err != nil || len(rows) != 1 || !rows[0].IsClosed || rows[0].Reason != "تعطیل نهایی" {
		t.Fatalf("expected single final closed override, got %+v err=%v", rows, err)
	}

	// 6. Blog slug rename works & colliding slug returns content.ErrSlugConflict
	renamed, err := blogRepo.Upsert(ctx, content.BlogPost{
		ID:           victimPost.ID,
		TherapistID:  victim.therapistID,
		Slug:         "victim-renamed-slug",
		Title:        "عنوان جدید",
		BodyMarkdown: "متن جدید",
		ReadingMin:   5,
		Status:       content.PostStatusPublished,
		PublishedAt:  &now,
		UpdatedAt:    now,
	})
	if err != nil || renamed.ID != victimPost.ID || renamed.Slug != "victim-renamed-slug" {
		t.Fatalf("expected clean slug rename, got %+v err=%v", renamed, err)
	}

	if _, err := blogRepo.Upsert(ctx, content.BlogPost{
		TherapistID:  victim.therapistID,
		Slug:         "victim-renamed-slug",
		Title:        "مقاله تکراری",
		BodyMarkdown: "متن تکراری",
		ReadingMin:   3,
		Status:       content.PostStatusDraft,
		CreatedAt:    now,
		UpdatedAt:    now,
	}); !errors.Is(err, content.ErrSlugConflict) {
		t.Fatalf("expected content.ErrSlugConflict on duplicate slug, got %v", err)
	}
}
