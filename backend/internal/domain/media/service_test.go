package media_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

func TestConfirmReceipt_MagicBytesAcceptsJpgPngWebp_RejectsSvgPdfHtml(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Media

	clientID := "client-media-1"
	bookingID := "booking-media-1"
	exp := env.Clock.Now().Add(15 * time.Minute)
	if err := env.SeedBooking(booking.Booking{
		ID:            bookingID,
		TherapistID:   "therapist-media-1",
		ClientUserID:  clientID,
		Status:        booking.StatusHeld,
		HoldExpiresAt: &exp,
	}); err != nil {
		t.Fatalf("SeedBooking: %v", err)
	}

	// Reject disallowed MIME & > 5 MiB at presign
	if _, err := svc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
		OwnerUserID: clientID,
		BookingID:   bookingID,
		MIMEType:    "application/pdf",
		SizeBytes:   1024,
	}); !errors.Is(err, media.ErrUnsupportedMIME) {
		t.Fatalf("expected ErrUnsupportedMIME for PDF, got %v", err)
	}
	if _, err := svc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
		OwnerUserID: clientID,
		BookingID:   bookingID,
		MIMEType:    media.MIMETypeJPEG,
		SizeBytes:   media.MaxReceiptBytes + 1,
	}); !errors.Is(err, media.ErrFileTooLarge) {
		t.Fatalf("expected ErrFileTooLarge for > 5 MiB, got %v", err)
	}

	validCases := []struct {
		name string
		mime media.AllowedMIMEType
		data []byte
	}{
		{"jpeg", media.MIMETypeJPEG, append([]byte{0xFF, 0xD8, 0xFF, 0xE0}, make([]byte, 32)...)},
		{"png", media.MIMETypePNG, append([]byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A}, make([]byte, 32)...)},
		{"webp", media.MIMETypeWEBP, append([]byte("RIFF\x24\x00\x00\x00WEBP"), make([]byte, 32)...)},
	}

	for _, tc := range validCases {
		res, err := svc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
			OwnerUserID: clientID,
			BookingID:   bookingID,
			MIMEType:    tc.mime,
			SizeBytes:   int64(len(tc.data)),
		})
		if err != nil {
			t.Fatalf("%s presign failed: %v", tc.name, err)
		}
		env.PutStorageObject(media.BucketPrivate, res.ObjectKey, tc.data)
		obj, err := svc.ConfirmReceiptUpload(ctx, clientID, res.MediaObjectID)
		if err != nil {
			t.Fatalf("%s confirm failed: %v", tc.name, err)
		}
		if obj.Status != media.MediaStatusConfirmed || obj.BucketKind != media.BucketPrivate {
			t.Fatalf("%s expected confirmed private object, got %+v", tc.name, obj)
		}
		// Idempotent confirm
		if _, err := svc.ConfirmReceiptUpload(ctx, clientID, res.MediaObjectID); err != nil {
			t.Fatalf("%s idempotent confirm failed: %v", tc.name, err)
		}
	}

	// Disguised SVG, PDF, HTML must be rejected AND deleted from S3
	disguisedCases := []struct {
		name string
		data []byte
	}{
		{"svg", []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)},
		{"pdf", []byte(`%PDF-1.7 disguised`)},
		{"html", []byte(`<!DOCTYPE html><html><script>alert(1)</script></html>`)},
	}

	for _, tc := range disguisedCases {
		res, err := svc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
			OwnerUserID: clientID,
			BookingID:   bookingID,
			MIMEType:    media.MIMETypeJPEG,
			SizeBytes:   int64(len(tc.data)),
		})
		if err != nil {
			t.Fatalf("%s presign failed: %v", tc.name, err)
		}
		env.PutStorageObject(media.BucketPrivate, res.ObjectKey, tc.data)
		if _, err := svc.ConfirmReceiptUpload(ctx, clientID, res.MediaObjectID); !errors.Is(err, media.ErrInvalidReceiptFile) {
			t.Fatalf("%s expected ErrInvalidReceiptFile, got %v", tc.name, err)
		}
		if env.HasStorageObject(media.BucketPrivate, res.ObjectKey) {
			t.Fatalf("%s expected disguised S3 object to be deleted immediately", tc.name)
		}
	}

	// MintReceiptDownloadURL TTL enforcement (>60s rejected)
	if _, err := svc.MintReceiptDownloadURL(ctx, clientID, "any", 61*time.Second); !errors.Is(err, media.ErrInvalidDownloadTTL) {
		t.Fatalf("expected ErrInvalidDownloadTTL for > 60s, got %v", err)
	}

	// Fail closed when holdChecker or accessCheck is nil
	nilCheckSvc := media.NewService(nil, nil, nil, nil, nil)
	if _, err := nilCheckSvc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
		OwnerUserID: clientID,
		BookingID:   bookingID,
		MIMEType:    media.MIMETypeJPEG,
		SizeBytes:   128,
	}); err == nil {
		t.Fatal("expected PresignReceiptUpload to fail closed when holdChecker is nil")
	}
	if _, err := nilCheckSvc.MintReceiptDownloadURL(ctx, clientID, "any", 30*time.Second); err == nil {
		t.Fatal("expected MintReceiptDownloadURL to fail closed when accessCheck is nil")
	}
}
