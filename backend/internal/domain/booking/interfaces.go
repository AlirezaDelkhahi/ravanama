package booking

import (
	"context"
	"time"
)

// BookingStatus represents the booking lifecycle state machine.
type BookingStatus string

const (
	StatusHeld                BookingStatus = "held"
	StatusPendingVerification BookingStatus = "pending_verification"
	StatusConfirmed           BookingStatus = "confirmed"
	StatusRejected            BookingStatus = "rejected"
	StatusExpired             BookingStatus = "expired"
	StatusCancelled           BookingStatus = "cancelled"
	StatusCompleted           BookingStatus = "completed"
)

// PaymentSource identifies how a booking was paid or settled.
type PaymentSource string

const (
	PaymentSourceManualReceipt PaymentSource = "manual_receipt"
	PaymentSourceGateway       PaymentSource = "gateway"
	PaymentSourceClinicCash    PaymentSource = "clinic_cash"
)

// Booking represents a session reservation in booking.bookings.
// AmountExpected uses integer minor units (Toman for IRT, cents for USD/EUR).
// CommissionBPS uses integer basis points (0..10000). Zero floats are permitted.
type Booking struct {
	ID                string
	ReferenceCode     string
	TherapistID       string
	ClientUserID      string
	ServiceOfferingID string
	ClinicID          *string
	RoomID            *string
	PaymentSource     PaymentSource
	Track             string
	ClientTimezone    string
	SlotStart         time.Time
	SlotEnd           time.Time
	Currency          string
	AmountExpected    int64
	CommissionBPS     int32
	Status            BookingStatus
	IdempotencyKey    string
	HoldExpiresAt     *time.Time
	ClientNote        string
	RejectionReason   *string
	CallJoinURL       *string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// BookingReceipt links a confirmed private receipt media object to a booking.
type BookingReceipt struct {
	ID            string
	BookingID     string
	MediaObjectID string
	TrackingCode  string
	SubmittedAt   time.Time
}

// BookingStatusEvent records an immutable state transition in booking.booking_status_events.
type BookingStatusEvent struct {
	ID          string
	BookingID   string
	ActorUserID *string
	FromStatus  *BookingStatus
	ToStatus    BookingStatus
	Reason      string
	CreatedAt   time.Time
}

// HoldRequest captures inputs required to place a 15-minute slot hold.
type HoldRequest struct {
	TherapistID       string
	ClientUserID      string
	ServiceOfferingID string
	Track             string
	ClientTimezone    string
	SlotStart         time.Time
	ClientNote        string
	IdempotencyKey    string
}

// SubmitReceiptRequest captures a client's uploaded receipt submission.
type SubmitReceiptRequest struct {
	BookingID     string
	ClientUserID  string
	MediaObjectID string
	TrackingCode  string
}

// ApproveBookingRequest captures a therapist's 1-tap approval with call link.
type ApproveBookingRequest struct {
	BookingID   string
	TherapistID string
	ActorUserID string
	CallJoinURL string
}

// RejectBookingRequest captures a therapist's 1-tap rejection with reason.
type RejectBookingRequest struct {
	BookingID       string
	TherapistID     string
	ActorUserID     string
	RejectionReason string
}

// HoldResult returns the held booking alongside track-scoped therapist payment destinations.
type HoldResult struct {
	Booking         Booking
	PaymentAccounts []PaymentDestination
}

// OfferingSnapshot captures immutable pricing/duration metadata from scheduling.
type OfferingSnapshot struct {
	ID          string
	TherapistID string
	Track       string
	DurationMin int16
	Currency    string
	PriceAmount int64
	IsActive    bool
}

// PaymentDestination represents a track-scoped manual payment account revealed only after hold.
type PaymentDestination struct {
	ID             string
	Track          string
	Method         string
	AccountLabel   string
	DestinationVal string
	HolderName     string
}

// MediaObjectSnapshot captures verified private receipt ownership and confirmation status.
type MediaObjectSnapshot struct {
	ID          string
	OwnerUserID string
	BucketKind  string
	Status      string
}

// BookingService defines booking hold, receipt verification, approval, rejection, and expiry workflows.
type BookingService interface {
	CreateHold(ctx context.Context, req HoldRequest) (*HoldResult, error)
	SubmitReceipt(ctx context.Context, req SubmitReceiptRequest) (*Booking, error)
	ApproveBooking(ctx context.Context, req ApproveBookingRequest) (*Booking, error)
	RejectBooking(ctx context.Context, req RejectBookingRequest) (*Booking, error)
	ExpireStaleHolds(ctx context.Context, now time.Time) (int, error)
	GetBookingForClient(ctx context.Context, bookingID string, clientUserID string) (*Booking, error)
	GetBookingReceiptForActor(ctx context.Context, bookingID string, actorUserID string, actorTherapistID string) (*BookingReceipt, error)
	ListTherapistBookings(ctx context.Context, therapistID string, status *BookingStatus) ([]Booking, error)
	ListClientBookings(ctx context.Context, clientUserID string) ([]Booking, error)
}

// BookingRepository persists and locks bookings, receipts, and status audit events.
type BookingRepository interface {
	AcquireClientHoldLock(ctx context.Context, clientUserID string) error
	FindByIdempotencyKey(ctx context.Context, clientUserID string, idempotencyKey string) (*Booking, error)
	GetByID(ctx context.Context, id string) (*Booking, error)
	GetByIDForUpdate(ctx context.Context, id string) (*Booking, error)
	CountActiveHoldsByClientAndTherapist(ctx context.Context, clientUserID string, therapistID string, now time.Time) (int, error)
	CreateHold(ctx context.Context, b Booking) (*Booking, error)
	UpdateStatus(ctx context.Context, id string, status BookingStatus, rejectionReason *string, callJoinURL *string, updatedAt time.Time) error
	CreateReceipt(ctx context.Context, receipt BookingReceipt) error
	GetReceiptByBookingID(ctx context.Context, bookingID string) (*BookingReceipt, error)
	AppendStatusEvent(ctx context.Context, event BookingStatusEvent) error
	ExpireStaleHoldsBatch(ctx context.Context, cutoff time.Time, limit int) (int, error)
	ListByTherapist(ctx context.Context, therapistID string, status *BookingStatus) ([]Booking, error)
	ListByClient(ctx context.Context, clientUserID string) ([]Booking, error)
}

// OfferingLookupPort retrieves offering metadata without importing scheduling internals.
type OfferingLookupPort interface {
	GetOffering(ctx context.Context, id string) (*OfferingSnapshot, error)
}

// PaymentAccountLookupPort retrieves therapist payment accounts without importing tenant internals.
type PaymentAccountLookupPort interface {
	ListActiveDestinations(ctx context.Context, therapistID string, track string) ([]PaymentDestination, error)
}

// MediaLookupPort verifies receipt media object state without importing media internals.
type MediaLookupPort interface {
	GetMediaObject(ctx context.Context, id string) (*MediaObjectSnapshot, error)
}

// BookingNotifierPort sends strictly post-commit booking lifecycle notifications.
type BookingNotifierPort interface {
	NotifyReceiptSubmitted(ctx context.Context, b Booking) error
	NotifyBookingApproved(ctx context.Context, b Booking) error
	NotifyBookingRejected(ctx context.Context, b Booking) error
}

// Clock provides current timestamps for hold TTL and audit events.
type Clock interface {
	Now() time.Time
}

// TxManager executes booking workflows inside an atomic database transaction.
type TxManager interface {
	WithinTx(ctx context.Context, fn func(txCtx context.Context) error) error
}

// GatewayRedirect describes an online payment gateway initiation response (Phase 2 seam).
type GatewayRedirect struct {
	Authority   string
	RedirectURL string
}

// GatewayCallbackResult describes verified gateway settlement details (Phase 2 seam).
type GatewayCallbackResult struct {
	Verified    bool
	ReferenceID string
	Amount      int64
	Currency    string
}

// PaymentGatewayPort defines Phase 2 online gateway integration (e.g., ZarinPal/Zibal).
type PaymentGatewayPort interface {
	InitiatePayment(ctx context.Context, bookingID string, amount int64, currency string, callbackURL string) (*GatewayRedirect, error)
	VerifyCallback(ctx context.Context, authority string, expectedAmount int64, currency string) (*GatewayCallbackResult, error)
}

// CommissionSplit captures deterministic integer basis-point fee allocation (zero floats).
type CommissionSplit struct {
	BookingID     string
	ClinicID      string
	TherapistID   string
	Currency      string
	GrossAmount   int64
	CommissionBPS int32
	PlatformFee   int64
	TherapistNet  int64
}

// CommissionLedgerPort records Phase 2 deterministic integer basis-point commission splits.
type CommissionLedgerPort interface {
	RecordSplit(ctx context.Context, split CommissionSplit) error
}
