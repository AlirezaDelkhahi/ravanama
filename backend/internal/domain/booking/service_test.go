package booking_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

func seedBookingFixtures(t *testing.T, app *bootstrap.App) (therapistID, therapistUserID, clientID, offeringID string) {
	t.Helper()
	ctx := context.Background()
	env := app.TestEnv()

	therapistID = "30000000-0000-0000-0000-000000000001"
	therapistUserID = "30000000-0000-0000-0000-000000000002"
	clientID = "30000000-0000-0000-0000-000000000003"

	if err := env.SeedTherapist(tenant.Therapist{
		ID:          therapistID,
		UserID:      therapistUserID,
		Slug:        "dr-booking",
		DisplayName: "دکتر رزرو",
		Headline:    "روانشناس",
		Timezone:    "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist: %v", err)
	}

	if _, err := app.Services().Tenant.UpsertPaymentAccount(ctx, tenant.PaymentAccount{
		TherapistID:    therapistID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodCardToCard,
		AccountLabel:   "کارت بانک سامان",
		DestinationVal: "6219861012345678",
		HolderName:     "دکتر رزرو",
		IsActive:       true,
	}); err != nil {
		t.Fatalf("UpsertPaymentAccount: %v", err)
	}

	off, err := app.Services().Scheduling.UpsertOffering(ctx, scheduling.ServiceOffering{
		TherapistID: therapistID,
		Track:       "iran",
		Title:       "مشاوره فردی",
		DurationMin: 50,
		Currency:    scheduling.CurrencyIRT,
		PriceAmount: 1500000,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("UpsertOffering: %v", err)
	}
	return therapistID, therapistUserID, clientID, off.ID
}

func TestCreateHold_IdempotencyAndHoardingGuard(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Booking

	// Verify exact integer commission split (zero floats)
	fee, net, err := booking.CalculateCommissionSplit(1500000, 1250) // 12.50%
	if err != nil || fee != 187500 || net != 1312500 {
		t.Fatalf("unexpected commission split: fee=%d net=%d err=%v", fee, net, err)
	}
	if _, _, err := booking.CalculateCommissionSplit(1000, 10001); !errors.Is(err, booking.ErrInvalidCommission) {
		t.Fatalf("expected ErrInvalidCommission for bps > 10000, got %v", err)
	}

	therapistID, _, clientID, offeringID := seedBookingFixtures(t, app)
	slot1 := env.Clock.Now().Add(24 * time.Hour)

	res1, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      clientID,
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1,
		IdempotencyKey:    "idem-1",
	})
	if err != nil {
		t.Fatalf("CreateHold 1 failed: %v", err)
	}
	if res1.Booking.Status != booking.StatusHeld || len(res1.PaymentAccounts) != 1 {
		t.Fatalf("expected held booking with 1 payment account, got status=%s accounts=%d", res1.Booking.Status, len(res1.PaymentAccounts))
	}
	if res1.Booking.CallJoinURL != nil {
		t.Fatal("CallJoinURL must be nil on held booking")
	}

	// Idempotent replay with padded vs trimmed key returns original booking
	resReplay, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      clientID,
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1,
		IdempotencyKey:    "  idem-1  ",
	})
	if err != nil {
		t.Fatalf("CreateHold replay failed: %v", err)
	}
	if resReplay.Booking.ID != res1.Booking.ID {
		t.Fatalf("expected idempotent replay ID %s, got %s", res1.Booking.ID, resReplay.Booking.ID)
	}

	// Different client overlapping exact slot -> ErrSlotConflict
	if _, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      "other-client",
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1.Add(15 * time.Minute),
		IdempotencyKey:    "idem-other",
	}); !errors.Is(err, booking.ErrSlotConflict) {
		t.Fatalf("expected ErrSlotConflict on overlapping slot, got %v", err)
	}

	// 2nd active hold for same client+therapist succeeds; 3rd hits hoarding guard
	if _, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      clientID,
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1.Add(2 * time.Hour),
		IdempotencyKey:    "idem-2",
	}); err != nil {
		t.Fatalf("CreateHold 2 failed: %v", err)
	}

	if _, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      clientID,
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1.Add(4 * time.Hour),
		IdempotencyKey:    "idem-3",
	}); !errors.Is(err, booking.ErrHoldLimitExceeded) {
		t.Fatalf("expected ErrHoldLimitExceeded on 3rd hold, got %v", err)
	}
}

func uploadConfirmedJPEG(t *testing.T, app *bootstrap.App, ownerUserID, bookingID string) string {
	t.Helper()
	ctx := context.Background()
	env := app.TestEnv()
	mediaSvc := app.Services().Media

	jpegBytes := append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 128)...)
	presign, err := mediaSvc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
		OwnerUserID: ownerUserID,
		BookingID:   bookingID,
		MIMEType:    media.MIMETypeJPEG,
		SizeBytes:   int64(len(jpegBytes)),
	})
	if err != nil {
		t.Fatalf("PresignReceiptUpload failed: %v", err)
	}
	env.PutStorageObject(media.BucketPrivate, presign.ObjectKey, jpegBytes)
	obj, err := mediaSvc.ConfirmReceiptUpload(ctx, ownerUserID, presign.MediaObjectID)
	if err != nil {
		t.Fatalf("ConfirmReceiptUpload failed: %v", err)
	}
	return obj.ID
}

func TestSubmitReceipt_TransitionsToPendingOr410IfExpired(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Booking

	therapistID, _, clientID, offeringID := seedBookingFixtures(t, app)
	slot1 := env.Clock.Now().Add(24 * time.Hour)

	hold1, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      clientID,
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1,
		IdempotencyKey:    "idem-sr-1",
	})
	if err != nil {
		t.Fatalf("CreateHold 1: %v", err)
	}
	mediaID1 := uploadConfirmedJPEG(t, app, clientID, hold1.Booking.ID)

	submitted, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
		BookingID:     hold1.Booking.ID,
		ClientUserID:  clientID,
		MediaObjectID: mediaID1,
		TrackingCode:  "TRK-100",
	})
	if err != nil {
		t.Fatalf("SubmitReceipt failed: %v", err)
	}
	if submitted.Status != booking.StatusPendingVerification {
		t.Fatalf("expected pending_verification, got %s", submitted.Status)
	}
	if len(env.Notifications()) != 1 {
		t.Fatalf("expected 1 post-commit notification, got %d", len(env.Notifications()))
	}

	// Idempotent replay with same mediaObjectID returns 200 without duplicate notification
	replay, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
		BookingID:     hold1.Booking.ID,
		ClientUserID:  clientID,
		MediaObjectID: mediaID1,
		TrackingCode:  "TRK-100",
	})
	if err != nil {
		t.Fatalf("SubmitReceipt replay failed: %v", err)
	}
	if replay.Status != booking.StatusPendingVerification || len(env.Notifications()) != 1 {
		t.Fatalf("expected idempotent replay without re-notify")
	}

	// Hold past hold_expires_at -> transitions to expired and returns ErrHoldExpired (410)
	hold2, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID:       therapistID,
		ClientUserID:      clientID,
		ServiceOfferingID: offeringID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         slot1.Add(3 * time.Hour),
		IdempotencyKey:    "idem-sr-2",
	})
	if err != nil {
		t.Fatalf("CreateHold 2: %v", err)
	}
	mediaID2 := uploadConfirmedJPEG(t, app, clientID, hold2.Booking.ID)

	env.Clock.Advance(16 * time.Minute)
	_, err = svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
		BookingID:     hold2.Booking.ID,
		ClientUserID:  clientID,
		MediaObjectID: mediaID2,
	})
	if !errors.Is(err, booking.ErrHoldExpired) {
		t.Fatalf("expected ErrHoldExpired after 16m, got %v", err)
	}
	raw2, _ := env.GetBookingRaw(hold2.Booking.ID)
	if raw2.Status != booking.StatusExpired {
		t.Fatalf("expected expired status persisted on late receipt, got %s", raw2.Status)
	}

	// Submitting again on already-expired row also returns ErrHoldExpired
	_, err = svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
		BookingID:     hold2.Booking.ID,
		ClientUserID:  clientID,
		MediaObjectID: mediaID2,
	})
	if !errors.Is(err, booking.ErrHoldExpired) {
		t.Fatalf("expected ErrHoldExpired on already-expired row, got %v", err)
	}

	// Submitting on terminal confirmed row returns ErrInvalidTransition
	if err := env.SeedBooking(booking.Booking{
		ID:           "b-confirmed",
		TherapistID:  therapistID,
		ClientUserID: clientID,
		Status:       booking.StatusConfirmed,
	}); err != nil {
		t.Fatalf("SeedBooking: %v", err)
	}
	if _, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{
		BookingID:     "b-confirmed",
		ClientUserID:  clientID,
		MediaObjectID: mediaID2,
	}); !errors.Is(err, booking.ErrInvalidTransition) {
		t.Fatalf("expected ErrInvalidTransition on confirmed booking, got %v", err)
	}
}

func TestApproveAndRejectBooking_StateAndSlotRelease(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Booking

	therapistID, therapistUserID, clientID, offeringID := seedBookingFixtures(t, app)
	slot1 := env.Clock.Now().Add(24 * time.Hour)
	slot2 := env.Clock.Now().Add(26 * time.Hour)

	// 1. Approve flow
	h1, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID: therapistID, ClientUserID: clientID, ServiceOfferingID: offeringID,
		Track: "iran", ClientTimezone: "Asia/Tehran", SlotStart: slot1, IdempotencyKey: "idem-app-1",
	})
	if err != nil {
		t.Fatalf("CreateHold 1: %v", err)
	}
	m1 := uploadConfirmedJPEG(t, app, clientID, h1.Booking.ID)
	if _, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{BookingID: h1.Booking.ID, ClientUserID: clientID, MediaObjectID: m1}); err != nil {
		t.Fatalf("SubmitReceipt 1: %v", err)
	}

	if _, err := svc.ApproveBooking(ctx, booking.ApproveBookingRequest{
		BookingID: h1.Booking.ID, TherapistID: therapistID, ActorUserID: therapistUserID, CallJoinURL: "http://meet.example.com/1",
	}); !errors.Is(err, booking.ErrInvalidCallURL) {
		t.Fatalf("expected ErrInvalidCallURL for http://, got %v", err)
	}

	approved, err := svc.ApproveBooking(ctx, booking.ApproveBookingRequest{
		BookingID: " " + h1.Booking.ID + " ", TherapistID: therapistID, ActorUserID: therapistUserID, CallJoinURL: "HTTPS://meet.example.com/room-1",
	})
	if err != nil {
		t.Fatalf("ApproveBooking failed: %v", err)
	}
	if approved.Status != booking.StatusConfirmed || approved.CallJoinURL == nil || *approved.CallJoinURL != "https://meet.example.com/room-1" {
		t.Fatalf("expected confirmed booking with normalized lowercase https CallJoinURL, got %+v", approved)
	}

	// 2. Reject flow + immediate slot release
	h2, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID: therapistID, ClientUserID: clientID, ServiceOfferingID: offeringID,
		Track: "iran", ClientTimezone: "Asia/Tehran", SlotStart: slot2, IdempotencyKey: "idem-rej-1",
	})
	if err != nil {
		t.Fatalf("CreateHold 2: %v", err)
	}
	m2 := uploadConfirmedJPEG(t, app, clientID, h2.Booking.ID)
	if _, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{BookingID: h2.Booking.ID, ClientUserID: clientID, MediaObjectID: m2}); err != nil {
		t.Fatalf("SubmitReceipt 2: %v", err)
	}

	if _, err := svc.RejectBooking(ctx, booking.RejectBookingRequest{
		BookingID: h2.Booking.ID, TherapistID: therapistID, ActorUserID: therapistUserID, RejectionReason: "   ",
	}); !errors.Is(err, booking.ErrInvalidRejection) {
		t.Fatalf("expected ErrInvalidRejection on empty reason, got %v", err)
	}

	rejected, err := svc.RejectBooking(ctx, booking.RejectBookingRequest{
		BookingID: h2.Booking.ID, TherapistID: therapistID, ActorUserID: therapistUserID, RejectionReason: "رسید خوانا نیست",
	})
	if err != nil {
		t.Fatalf("RejectBooking failed: %v", err)
	}
	if rejected.Status != booking.StatusRejected || rejected.CallJoinURL != nil {
		t.Fatalf("expected rejected booking with nil CallJoinURL, got %+v", rejected)
	}

	// Rebooking exact same slot2 immediately succeeds!
	rebooked, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID: therapistID, ClientUserID: clientID, ServiceOfferingID: offeringID,
		Track: "iran", ClientTimezone: "Asia/Tehran", SlotStart: slot2, IdempotencyKey: "idem-rebook-1",
	})
	if err != nil {
		t.Fatalf("expected immediate rebook after rejection, got %v", err)
	}
	if rebooked.Booking.Status != booking.StatusHeld {
		t.Fatalf("expected held status on rebook, got %s", rebooked.Booking.Status)
	}
}

func TestExpireStaleHolds_SweepsOnlyExpiredHeldRows(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Booking

	therapistID, _, clientID, offeringID := seedBookingFixtures(t, app)
	slot1 := env.Clock.Now().Add(24 * time.Hour)
	slot2 := env.Clock.Now().Add(26 * time.Hour)

	// Hold 1: will expire
	h1, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID: therapistID, ClientUserID: clientID, ServiceOfferingID: offeringID,
		Track: "iran", ClientTimezone: "Asia/Tehran", SlotStart: slot1, IdempotencyKey: "idem-exp-1",
	})
	if err != nil {
		t.Fatalf("CreateHold 1: %v", err)
	}

	// Hold 2: moved to pending_verification before expiry
	h2, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID: therapistID, ClientUserID: clientID, ServiceOfferingID: offeringID,
		Track: "iran", ClientTimezone: "Asia/Tehran", SlotStart: slot2, IdempotencyKey: "idem-exp-2",
	})
	if err != nil {
		t.Fatalf("CreateHold 2: %v", err)
	}
	m2 := uploadConfirmedJPEG(t, app, clientID, h2.Booking.ID)
	if _, err := svc.SubmitReceipt(ctx, booking.SubmitReceiptRequest{BookingID: h2.Booking.ID, ClientUserID: clientID, MediaObjectID: m2}); err != nil {
		t.Fatalf("SubmitReceipt 2: %v", err)
	}

	// Advance 10m -> Hold 3 created (unexpired at +16m!)
	env.Clock.Advance(10 * time.Minute)
	h3, err := svc.CreateHold(ctx, booking.HoldRequest{
		TherapistID: therapistID, ClientUserID: "another-client", ServiceOfferingID: offeringID,
		Track: "iran", ClientTimezone: "Asia/Tehran", SlotStart: slot2.Add(2 * time.Hour), IdempotencyKey: "idem-exp-3",
	})
	if err != nil {
		t.Fatalf("CreateHold 3: %v", err)
	}

	// Advance another 6m (total 16m from h1, 6m from h3) -> only h1 should expire!
	env.Clock.Advance(6 * time.Minute)
	swept, err := svc.ExpireStaleHolds(ctx, env.Clock.Now())
	if err != nil {
		t.Fatalf("ExpireStaleHolds failed: %v", err)
	}
	if swept != 1 {
		t.Fatalf("expected 1 swept booking, got %d", swept)
	}

	b1, _ := env.GetBookingRaw(h1.Booking.ID)
	b2, _ := env.GetBookingRaw(h2.Booking.ID)
	b3, _ := env.GetBookingRaw(h3.Booking.ID)
	if b1.Status != booking.StatusExpired || b2.Status != booking.StatusPendingVerification || b3.Status != booking.StatusHeld {
		t.Fatalf("unexpected statuses: b1=%s b2=%s b3=%s", b1.Status, b2.Status, b3.Status)
	}
}
