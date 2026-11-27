package media

import (
	"context"
	"time"
)

// BucketKind separates public CDN assets from private payment receipts.
type BucketKind string

const (
	BucketPublic  BucketKind = "public"
	BucketPrivate BucketKind = "private"
)

// AllowedMIMEType restricts Phase 1 uploads strictly to raster receipt/image formats.
type AllowedMIMEType string

const (
	MIMETypeJPEG AllowedMIMEType = "image/jpeg"
	MIMETypePNG  AllowedMIMEType = "image/png"
	MIMETypeWEBP AllowedMIMEType = "image/webp"
)

// MaxReceiptBytes enforces the strict 5 MiB ceiling on receipt uploads.
const MaxReceiptBytes int64 = 5 * 1024 * 1024

// MediaStatus tracks the upload verification lifecycle.
type MediaStatus string

const (
	MediaStatusPendingUpload MediaStatus = "pending_upload"
	MediaStatusConfirmed     MediaStatus = "confirmed"
	MediaStatusDeleted       MediaStatus = "deleted"
)

// MediaObject represents a stored object record in media.media_objects.
type MediaObject struct {
	ID          string
	OwnerUserID string
	BucketKind  BucketKind
	ObjectKey   string
	MIMEType    AllowedMIMEType
	SizeBytes   int64
	Status      MediaStatus
	SHA256Hex   *string
	CreatedAt   time.Time
	ConfirmedAt *time.Time
}

// PresignReceiptRequest requests a short-lived private S3 upload URL.
type PresignReceiptRequest struct {
	OwnerUserID string
	BookingID   string
	MIMEType    AllowedMIMEType
	SizeBytes   int64
}

// PresignReceiptResult returns the created media object ID and short-lived PUT URL.
type PresignReceiptResult struct {
	MediaObjectID string
	ObjectKey     string
	UploadURL     string
	ExpiresAt     time.Time
}

// ObjectMetadata represents S3 HeadObject attributes.
type ObjectMetadata struct {
	ContentLength int64
	ContentType   string
	ETag          string
}

// MediaService handles presigned uploads, magic-byte confirmation, and signed downloads.
type MediaService interface {
	PresignReceiptUpload(ctx context.Context, req PresignReceiptRequest) (*PresignReceiptResult, error)
	ConfirmReceiptUpload(ctx context.Context, ownerUserID string, mediaObjectID string) (*MediaObject, error)
	MintReceiptDownloadURL(ctx context.Context, mediaObjectID string, ttl time.Duration) (string, error)
}

// ObjectStoragePort abstracts S3-compatible object storage operations.
type ObjectStoragePort interface {
	PresignPut(ctx context.Context, bucket BucketKind, key string, mimeType AllowedMIMEType, sizeBytes int64, ttl time.Duration) (string, error)
	PresignGet(ctx context.Context, bucket BucketKind, key string, ttl time.Duration) (string, error)
	HeadObject(ctx context.Context, bucket BucketKind, key string) (*ObjectMetadata, error)
	GetObjectRange(ctx context.Context, bucket BucketKind, key string, startByte int64, endByte int64) ([]byte, error)
	DeleteObject(ctx context.Context, bucket BucketKind, key string) error
}

// MediaRepository persists media.media_objects records.
type MediaRepository interface {
	Create(ctx context.Context, obj MediaObject) error
	GetByID(ctx context.Context, id string) (*MediaObject, error)
	MarkConfirmed(ctx context.Context, id string, sha256Hex string, confirmedAt time.Time) error
	MarkDeleted(ctx context.Context, id string) error
}
