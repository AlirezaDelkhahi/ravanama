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

// BookingService defines booking hold, receipt verification, approval, rejection, and expiry workflows.
type BookingService interface {
	CreateHold(ctx context.Context, req HoldRequest) (*Booking, error)
	SubmitReceipt(ctx context.Context, req SubmitReceiptRequest) (*Booking, error)
	ApproveBooking(ctx context.Context, req ApproveBookingRequest) (*Booking, error)
	RejectBooking(ctx context.Context, req RejectBookingRequest) (*Booking, error)
	ExpireStaleHolds(ctx context.Context, now time.Time) (int, error)
	GetBookingForClient(ctx context.Context, bookingID string, clientUserID string) (*Booking, error)
	ListTherapistBookings(ctx context.Context, therapistID string, status *BookingStatus) ([]Booking, error)
	ListClientBookings(ctx context.Context, clientUserID string) ([]Booking, error)
}

// BookingRepository persists and locks bookings, receipts, and status audit events.
type BookingRepository interface {
	FindByIdempotencyKey(ctx context.Context, clientUserID string, idempotencyKey string) (*Booking, error)
	GetByID(ctx context.Context, id string) (*Booking, error)
	GetByIDForUpdate(ctx context.Context, id string) (*Booking, error)
	CountActiveHoldsByClientAndTherapist(ctx context.Context, clientUserID string, therapistID string) (int, error)
	CreateHold(ctx context.Context, b Booking) (*Booking, error)
	UpdateStatus(ctx context.Context, id string, status BookingStatus, rejectionReason *string, callJoinURL *string, updatedAt time.Time) error
	CreateReceipt(ctx context.Context, receipt BookingReceipt) error
	GetReceiptByBookingID(ctx context.Context, bookingID string) (*BookingReceipt, error)
	AppendStatusEvent(ctx context.Context, event BookingStatusEvent) error
	ExpireStaleHoldsBatch(ctx context.Context, cutoff time.Time, limit int) (int, error)
	ListByTherapist(ctx context.Context, therapistID string, status *BookingStatus) ([]Booking, error)
	ListByClient(ctx context.Context, clientUserID string) ([]Booking, error)
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
