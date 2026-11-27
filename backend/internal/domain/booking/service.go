package booking

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	holdTTL                    = 15 * time.Minute
	maxActiveHoldsPerTherapist = 2
	expireBatchLimit           = 100
)

// CalculateCommissionSplit computes deterministic integer basis-point commission splits with zero floats.
func CalculateCommissionSplit(grossAmount int64, commissionBPS int32) (platformFee int64, therapistNet int64, err error) {
	if grossAmount <= 0 || commissionBPS < 0 || commissionBPS > 10000 {
		return 0, 0, ErrInvalidCommission
	}
	num := new(big.Int).Mul(big.NewInt(grossAmount), big.NewInt(int64(commissionBPS)))
	den := big.NewInt(10000)
	feeBig := new(big.Int).Div(num, den)
	platformFee = feeBig.Int64()
	therapistNet = grossAmount - platformFee
	return platformFee, therapistNet, nil
}

// Service implements BookingService with strict transaction locking and post-commit notifications.
type Service struct {
	repo            BookingRepository
	txManager       TxManager
	offerings       OfferingLookupPort
	paymentAccounts PaymentAccountLookupPort
	media           MediaLookupPort
	notifier        BookingNotifierPort
	clock           Clock
}

// NewService constructs a booking Service with injected repositories and ports.
func NewService(
	repo BookingRepository,
	txManager TxManager,
	offerings OfferingLookupPort,
	paymentAccounts PaymentAccountLookupPort,
	media MediaLookupPort,
	notifier BookingNotifierPort,
	clock Clock,
) *Service {
	return &Service{
		repo:            repo,
		txManager:       txManager,
		offerings:       offerings,
		paymentAccounts: paymentAccounts,
		media:           media,
		notifier:        notifier,
		clock:           clock,
	}
}

func (s *Service) CreateHold(ctx context.Context, req HoldRequest) (*HoldResult, error) {
	req.TherapistID = strings.TrimSpace(req.TherapistID)
	req.ClientUserID = strings.TrimSpace(req.ClientUserID)
	req.ServiceOfferingID = strings.TrimSpace(req.ServiceOfferingID)
	req.IdempotencyKey = strings.TrimSpace(req.IdempotencyKey)
	req.Track = strings.TrimSpace(req.Track)
	req.ClientTimezone = strings.TrimSpace(req.ClientTimezone)

	if req.TherapistID == "" ||
		req.ClientUserID == "" ||
		req.ServiceOfferingID == "" ||
		req.IdempotencyKey == "" ||
		req.SlotStart.IsZero() ||
		(req.Track != "iran" && req.Track != "abroad") {
		return nil, ErrInvalidInput
	}
	if _, err := time.LoadLocation(req.ClientTimezone); err != nil {
		return nil, ErrInvalidTimezone
	}

	var held *Booking
	err := s.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		if err := s.repo.AcquireClientHoldLock(txCtx, req.ClientUserID); err != nil {
			return err
		}

		existing, err := s.repo.FindByIdempotencyKey(txCtx, req.ClientUserID, req.IdempotencyKey)
		if err != nil {
			return err
		}
		if existing != nil {
			held = sanitizeBooking(*existing)
			return nil
		}

		now := s.clock.Now()
		activeCount, err := s.repo.CountActiveHoldsByClientAndTherapist(txCtx, req.ClientUserID, req.TherapistID, now)
		if err != nil {
			return err
		}
		if activeCount >= maxActiveHoldsPerTherapist {
			return ErrHoldLimitExceeded
		}

		offering, err := s.offerings.GetOffering(txCtx, req.ServiceOfferingID)
		if err != nil {
			return ErrOfferingNotFound
		}
		if !offering.IsActive || offering.TherapistID != req.TherapistID || offering.Track != req.Track {
			return ErrOfferingInactive
		}

		refCode, err := generateReferenceCode()
		if err != nil {
			return err
		}
		exp := now.Add(holdTTL)
		slotStart := req.SlotStart.UTC()
		slotEnd := slotStart.Add(time.Duration(offering.DurationMin) * time.Minute)
		bookingID := uuid.Must(uuid.NewV7()).String()

		created, err := s.repo.CreateHold(txCtx, Booking{
			ID:                bookingID,
			ReferenceCode:     refCode,
			TherapistID:       req.TherapistID,
			ClientUserID:      req.ClientUserID,
			ServiceOfferingID: req.ServiceOfferingID,
			PaymentSource:     PaymentSourceManualReceipt,
			Track:             req.Track,
			ClientTimezone:    strings.TrimSpace(req.ClientTimezone),
			SlotStart:         slotStart,
			SlotEnd:           slotEnd,
			Currency:          offering.Currency,
			AmountExpected:    offering.PriceAmount,
			CommissionBPS:     0,
			Status:            StatusHeld,
			IdempotencyKey:    strings.TrimSpace(req.IdempotencyKey),
			HoldExpiresAt:     &exp,
			ClientNote:        req.ClientNote,
			CreatedAt:         now,
			UpdatedAt:         now,
		})
		if err != nil {
			return err
		}

		actor := req.ClientUserID
		if err := s.repo.AppendStatusEvent(txCtx, BookingStatusEvent{
			ID:          uuid.Must(uuid.NewV7()).String(),
			BookingID:   created.ID,
			ActorUserID: &actor,
			FromStatus:  nil,
			ToStatus:    StatusHeld,
			Reason:      "hold_created",
			CreatedAt:   now,
		}); err != nil {
			return err
		}

		held = sanitizeBooking(*created)
		return nil
	})
	if err != nil {
		return nil, err
	}

	var accounts []PaymentDestination
	if s.paymentAccounts != nil {
		accounts, err = s.paymentAccounts.ListActiveDestinations(ctx, held.TherapistID, held.Track)
		if err != nil {
			return nil, err
		}
	}

	return &HoldResult{
		Booking:         *held,
		PaymentAccounts: accounts,
	}, nil
}

func (s *Service) SubmitReceipt(ctx context.Context, req SubmitReceiptRequest) (*Booking, error) {
	req.BookingID = strings.TrimSpace(req.BookingID)
	req.ClientUserID = strings.TrimSpace(req.ClientUserID)
	req.MediaObjectID = strings.TrimSpace(req.MediaObjectID)
	req.TrackingCode = strings.TrimSpace(req.TrackingCode)

	if req.BookingID == "" ||
		req.ClientUserID == "" ||
		req.MediaObjectID == "" {
		return nil, ErrInvalidInput
	}

	var (
		out              *Booking
		idempotentReplay bool
		expired          bool
	)

	err := s.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		b, err := s.repo.GetByIDForUpdate(txCtx, req.BookingID)
		if err != nil {
			return err
		}
		if b.ClientUserID != req.ClientUserID {
			return ErrForbidden
		}

		// 1. Idempotent replay check FIRST
		if b.Status == StatusPendingVerification {
			rec, err := s.repo.GetReceiptByBookingID(txCtx, b.ID)
			if err == nil && rec != nil && rec.MediaObjectID == req.MediaObjectID {
				out = sanitizeBooking(*b)
				idempotentReplay = true
				return nil
			}
			return ErrInvalidTransition
		}

		now := s.clock.Now()

		// 2. Expiry check SECOND (commits 'expired' if stale held row)
		if b.Status == StatusExpired {
			expired = true
			return nil
		}
		if b.Status == StatusHeld && (b.HoldExpiresAt == nil || !now.Before(*b.HoldExpiresAt)) {
			if err := s.repo.UpdateStatus(txCtx, b.ID, StatusExpired, nil, nil, now); err != nil {
				return err
			}
			from := StatusHeld
			actor := req.ClientUserID
			if err := s.repo.AppendStatusEvent(txCtx, BookingStatusEvent{
				ID:          uuid.Must(uuid.NewV7()).String(),
				BookingID:   b.ID,
				ActorUserID: &actor,
				FromStatus:  &from,
				ToStatus:    StatusExpired,
				Reason:      "hold_ttl_expired",
				CreatedAt:   now,
			}); err != nil {
				return err
			}
			expired = true
			return nil
		}

		// 3. Require held status
		if b.Status != StatusHeld {
			return ErrInvalidTransition
		}

		mediaObj, err := s.media.GetMediaObject(txCtx, req.MediaObjectID)
		if err != nil || mediaObj == nil {
			return ErrInvalidMedia
		}
		if mediaObj.OwnerUserID != req.ClientUserID {
			return ErrForbidden
		}
		if mediaObj.BucketKind != "private" || mediaObj.Status != "confirmed" {
			return ErrInvalidMedia
		}

		if err := s.repo.CreateReceipt(txCtx, BookingReceipt{
			ID:            uuid.Must(uuid.NewV7()).String(),
			BookingID:     b.ID,
			MediaObjectID: req.MediaObjectID,
			TrackingCode:  strings.TrimSpace(req.TrackingCode),
			SubmittedAt:   now,
		}); err != nil {
			return err
		}

		if err := s.repo.UpdateStatus(txCtx, b.ID, StatusPendingVerification, nil, nil, now); err != nil {
			return err
		}

		from := StatusHeld
		actor := req.ClientUserID
		if err := s.repo.AppendStatusEvent(txCtx, BookingStatusEvent{
			ID:          uuid.Must(uuid.NewV7()).String(),
			BookingID:   b.ID,
			ActorUserID: &actor,
			FromStatus:  &from,
			ToStatus:    StatusPendingVerification,
			Reason:      "receipt_submitted",
			CreatedAt:   now,
		}); err != nil {
			return err
		}

		b.Status = StatusPendingVerification
		b.UpdatedAt = now
		out = sanitizeBooking(*b)
		return nil
	})
	if err != nil {
		return nil, err
	}
	if expired {
		return nil, ErrHoldExpired
	}
	if !idempotentReplay && s.notifier != nil {
		_ = s.notifier.NotifyReceiptSubmitted(ctx, *out)
	}
	return out, nil
}

func (s *Service) ApproveBooking(ctx context.Context, req ApproveBookingRequest) (*Booking, error) {
	req.BookingID = strings.TrimSpace(req.BookingID)
	req.TherapistID = strings.TrimSpace(req.TherapistID)
	req.ActorUserID = strings.TrimSpace(req.ActorUserID)
	req.CallJoinURL = strings.TrimSpace(req.CallJoinURL)

	if req.BookingID == "" || req.TherapistID == "" || req.ActorUserID == "" {
		return nil, ErrInvalidInput
	}
	callURL, err := validateHTTPSURL(req.CallJoinURL)
	if err != nil {
		return nil, err
	}

	var out *Booking
	err = s.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		b, err := s.repo.GetByIDForUpdate(txCtx, req.BookingID)
		if err != nil {
			return err
		}
		if b.TherapistID != req.TherapistID {
			return ErrForbidden
		}
		if b.Status != StatusPendingVerification {
			return ErrInvalidTransition
		}

		now := s.clock.Now()
		if err := s.repo.UpdateStatus(txCtx, b.ID, StatusConfirmed, nil, &callURL, now); err != nil {
			return err
		}

		from := StatusPendingVerification
		actor := req.ActorUserID
		if err := s.repo.AppendStatusEvent(txCtx, BookingStatusEvent{
			ID:          uuid.Must(uuid.NewV7()).String(),
			BookingID:   b.ID,
			ActorUserID: &actor,
			FromStatus:  &from,
			ToStatus:    StatusConfirmed,
			Reason:      "therapist_approved",
			CreatedAt:   now,
		}); err != nil {
			return err
		}

		b.Status = StatusConfirmed
		b.CallJoinURL = &callURL
		b.UpdatedAt = now
		out = sanitizeBooking(*b)
		return nil
	})
	if err != nil {
		return nil, err
	}

	if s.notifier != nil {
		_ = s.notifier.NotifyBookingApproved(ctx, *out)
	}
	return out, nil
}

func (s *Service) RejectBooking(ctx context.Context, req RejectBookingRequest) (*Booking, error) {
	req.BookingID = strings.TrimSpace(req.BookingID)
	req.TherapistID = strings.TrimSpace(req.TherapistID)
	req.ActorUserID = strings.TrimSpace(req.ActorUserID)
	reason := strings.TrimSpace(req.RejectionReason)

	if req.BookingID == "" || req.TherapistID == "" || req.ActorUserID == "" {
		return nil, ErrInvalidInput
	}
	if reason == "" {
		return nil, ErrInvalidRejection
	}

	var out *Booking
	err := s.txManager.WithinTx(ctx, func(txCtx context.Context) error {
		b, err := s.repo.GetByIDForUpdate(txCtx, req.BookingID)
		if err != nil {
			return err
		}
		if b.TherapistID != req.TherapistID {
			return ErrForbidden
		}
		if b.Status != StatusPendingVerification {
			return ErrInvalidTransition
		}

		now := s.clock.Now()
		if err := s.repo.UpdateStatus(txCtx, b.ID, StatusRejected, &reason, nil, now); err != nil {
			return err
		}

		from := StatusPendingVerification
		actor := req.ActorUserID
		if err := s.repo.AppendStatusEvent(txCtx, BookingStatusEvent{
			ID:          uuid.Must(uuid.NewV7()).String(),
			BookingID:   b.ID,
			ActorUserID: &actor,
			FromStatus:  &from,
			ToStatus:    StatusRejected,
			Reason:      reason,
			CreatedAt:   now,
		}); err != nil {
			return err
		}

		b.Status = StatusRejected
		b.RejectionReason = &reason
		b.CallJoinURL = nil
		b.UpdatedAt = now
		out = sanitizeBooking(*b)
		return nil
	})
	if err != nil {
		return nil, err
	}

	if s.notifier != nil {
		_ = s.notifier.NotifyBookingRejected(ctx, *out)
	}
	return out, nil
}

func (s *Service) ExpireStaleHolds(ctx context.Context, now time.Time) (int, error) {
	if now.IsZero() {
		now = s.clock.Now()
	}
	return s.repo.ExpireStaleHoldsBatch(ctx, now.UTC(), expireBatchLimit)
}

func (s *Service) GetBookingForClient(ctx context.Context, bookingID string, clientUserID string) (*Booking, error) {
	bookingID = strings.TrimSpace(bookingID)
	clientUserID = strings.TrimSpace(clientUserID)
	if bookingID == "" || clientUserID == "" {
		return nil, ErrInvalidInput
	}
	b, err := s.repo.GetByID(ctx, bookingID)
	if err != nil {
		return nil, err
	}
	if b.ClientUserID != clientUserID {
		return nil, ErrForbidden
	}
	return sanitizeBooking(*b), nil
}

func (s *Service) GetBookingReceiptForActor(ctx context.Context, bookingID string, actorUserID string, actorTherapistID string) (*BookingReceipt, error) {
	bookingID = strings.TrimSpace(bookingID)
	actorUserID = strings.TrimSpace(actorUserID)
	actorTherapistID = strings.TrimSpace(actorTherapistID)
	if bookingID == "" || actorUserID == "" {
		return nil, ErrInvalidInput
	}
	b, err := s.repo.GetByID(ctx, bookingID)
	if err != nil {
		return nil, err
	}
	isClient := b.ClientUserID == actorUserID
	isTherapist := actorTherapistID != "" && b.TherapistID == actorTherapistID
	if !isClient && !isTherapist {
		return nil, ErrForbidden
	}
	return s.repo.GetReceiptByBookingID(ctx, bookingID)
}

func (s *Service) ListTherapistBookings(ctx context.Context, therapistID string, status *BookingStatus) ([]Booking, error) {
	therapistID = strings.TrimSpace(therapistID)
	if therapistID == "" {
		return nil, ErrInvalidInput
	}
	rows, err := s.repo.ListByTherapist(ctx, therapistID, status)
	if err != nil {
		return nil, err
	}
	return sanitizeBookings(rows), nil
}

func (s *Service) ListClientBookings(ctx context.Context, clientUserID string) ([]Booking, error) {
	clientUserID = strings.TrimSpace(clientUserID)
	if clientUserID == "" {
		return nil, ErrInvalidInput
	}
	rows, err := s.repo.ListByClient(ctx, clientUserID)
	if err != nil {
		return nil, err
	}
	return sanitizeBookings(rows), nil
}

func sanitizeBooking(b Booking) *Booking {
	if b.Status != StatusConfirmed && b.Status != StatusCompleted {
		b.CallJoinURL = nil
	}
	return &b
}

func sanitizeBookings(rows []Booking) []Booking {
	out := make([]Booking, len(rows))
	for i, r := range rows {
		out[i] = *sanitizeBooking(r)
	}
	return out
}

func validateHTTPSURL(raw string) (string, error) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil || !strings.EqualFold(u.Scheme, "https") || u.Host == "" {
		return "", ErrInvalidCallURL
	}
	u.Scheme = "https"
	return u.String(), nil
}

func generateReferenceCode() (string, error) {
	buf := make([]byte, 3)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return "RN-" + strings.ToUpper(hex.EncodeToString(buf)), nil
}
