package media

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	presignUploadTTL  = 5 * time.Minute
	maxDownloadURLTTL = 60 * time.Second
)

// Service implements MediaService with strict private-bucket and magic-byte validation.
type Service struct {
	repo        MediaRepository
	storage     ObjectStoragePort
	holdChecker HeldBookingChecker
	accessCheck ReceiptAccessChecker
	clock       Clock
}

// NewService constructs a media Service with injected ports.
func NewService(
	repo MediaRepository,
	storage ObjectStoragePort,
	holdChecker HeldBookingChecker,
	accessCheck ReceiptAccessChecker,
	clock Clock,
) *Service {
	return &Service{
		repo:        repo,
		storage:     storage,
		holdChecker: holdChecker,
		accessCheck: accessCheck,
		clock:       clock,
	}
}

func (s *Service) PresignReceiptUpload(ctx context.Context, req PresignReceiptRequest) (*PresignReceiptResult, error) {
	if strings.TrimSpace(req.OwnerUserID) == "" || strings.TrimSpace(req.BookingID) == "" {
		return nil, ErrInvalidInput
	}
	if !isAllowedMIME(req.MIMEType) {
		return nil, ErrUnsupportedMIME
	}
	if req.SizeBytes <= 0 {
		return nil, ErrInvalidInput
	}
	if req.SizeBytes > MaxReceiptBytes {
		return nil, ErrFileTooLarge
	}

	if s.repo == nil || s.storage == nil || s.holdChecker == nil || s.clock == nil {
		return nil, ErrInvalidInput
	}
	now := s.clock.Now()
	ok, err := s.holdChecker.HasActiveHeldBooking(ctx, req.BookingID, req.OwnerUserID, now)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNoActiveHold
	}

	id := uuid.Must(uuid.NewV7()).String()
	ext := extensionForMIME(req.MIMEType)
	objectKey := fmt.Sprintf("receipts/%s/%s%s", req.OwnerUserID, id, ext)

	obj := MediaObject{
		ID:          id,
		OwnerUserID: req.OwnerUserID,
		BucketKind:  BucketPrivate,
		ObjectKey:   objectKey,
		MIMEType:    req.MIMEType,
		SizeBytes:   req.SizeBytes,
		Status:      MediaStatusPendingUpload,
		CreatedAt:   now,
	}
	if err := s.repo.Create(ctx, obj); err != nil {
		return nil, err
	}

	uploadURL, err := s.storage.PresignPut(ctx, BucketPrivate, objectKey, req.MIMEType, req.SizeBytes, presignUploadTTL)
	if err != nil {
		return nil, err
	}

	return &PresignReceiptResult{
		MediaObjectID: id,
		ObjectKey:     objectKey,
		UploadURL:     uploadURL,
		ExpiresAt:     now.Add(presignUploadTTL),
	}, nil
}

func (s *Service) ConfirmReceiptUpload(ctx context.Context, ownerUserID string, mediaObjectID string) (*MediaObject, error) {
	if strings.TrimSpace(ownerUserID) == "" || strings.TrimSpace(mediaObjectID) == "" {
		return nil, ErrInvalidInput
	}
	obj, err := s.repo.GetByID(ctx, mediaObjectID)
	if err != nil {
		return nil, err
	}
	if obj.OwnerUserID != ownerUserID {
		return nil, ErrForbidden
	}
	if obj.BucketKind != BucketPrivate {
		return nil, ErrInvalidReceiptFile
	}
	if obj.Status == MediaStatusConfirmed {
		return obj, nil
	}
	if obj.Status == MediaStatusDeleted {
		return nil, ErrMediaDeleted
	}

	meta, err := s.storage.HeadObject(ctx, BucketPrivate, obj.ObjectKey)
	if err != nil || meta == nil || meta.ContentLength <= 0 || meta.ContentLength > MaxReceiptBytes {
		_ = s.storage.DeleteObject(ctx, BucketPrivate, obj.ObjectKey)
		_ = s.repo.MarkDeleted(ctx, obj.ID)
		return nil, ErrInvalidReceiptFile
	}

	headerBytes, err := s.storage.GetObjectRange(ctx, BucketPrivate, obj.ObjectKey, 0, 511)
	if err != nil || !matchesMagicBytes(obj.MIMEType, headerBytes) {
		_ = s.storage.DeleteObject(ctx, BucketPrivate, obj.ObjectKey)
		_ = s.repo.MarkDeleted(ctx, obj.ID)
		return nil, ErrInvalidReceiptFile
	}

	sum := sha256.Sum256(headerBytes)
	shaHex := hex.EncodeToString(sum[:])
	now := s.clock.Now()
	if err := s.repo.MarkConfirmed(ctx, obj.ID, shaHex, now); err != nil {
		return nil, err
	}
	return s.repo.GetByID(ctx, obj.ID)
}

func (s *Service) MintReceiptDownloadURL(ctx context.Context, actorUserID string, mediaObjectID string, ttl time.Duration) (string, error) {
	if strings.TrimSpace(actorUserID) == "" || strings.TrimSpace(mediaObjectID) == "" {
		return "", ErrInvalidInput
	}
	if ttl <= 0 || ttl > maxDownloadURLTTL {
		return "", ErrInvalidDownloadTTL
	}
	if s.accessCheck == nil {
		return "", ErrInvalidInput
	}
	allowed, err := s.accessCheck.CanAccessReceipt(ctx, mediaObjectID, actorUserID)
	if err != nil {
		return "", err
	}
	if !allowed {
		return "", ErrForbidden
	}
	obj, err := s.repo.GetByID(ctx, mediaObjectID)
	if err != nil {
		return "", err
	}
	if obj.BucketKind != BucketPrivate || obj.Status != MediaStatusConfirmed {
		return "", ErrInvalidReceiptFile
	}
	return s.storage.PresignGet(ctx, BucketPrivate, obj.ObjectKey, ttl)
}

func isAllowedMIME(m AllowedMIMEType) bool {
	switch m {
	case MIMETypeJPEG, MIMETypePNG, MIMETypeWEBP:
		return true
	default:
		return false
	}
}

func extensionForMIME(m AllowedMIMEType) string {
	switch m {
	case MIMETypeJPEG:
		return ".jpg"
	case MIMETypePNG:
		return ".png"
	case MIMETypeWEBP:
		return ".webp"
	default:
		return ""
	}
}

func matchesMagicBytes(mime AllowedMIMEType, data []byte) bool {
	switch mime {
	case MIMETypeJPEG:
		return len(data) >= 3 && data[0] == 0xFF && data[1] == 0xD8 && data[2] == 0xFF
	case MIMETypePNG:
		return len(data) >= 8 && bytes.Equal(data[:8], []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})
	case MIMETypeWEBP:
		return len(data) >= 12 && bytes.Equal(data[:4], []byte("RIFF")) && bytes.Equal(data[8:12], []byte("WEBP"))
	default:
		return false
	}
}
