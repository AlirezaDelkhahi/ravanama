//go:build integration

package storage_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/ravannama/ravannama/backend/internal/adapters/storage"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

type utcClock struct{}

func (utcClock) Now() time.Time {
	return time.Now().UTC()
}

type alwaysHeldBookingChecker struct{}

func (alwaysHeldBookingChecker) HasActiveHeldBooking(_ context.Context, _ string, _ string, _ time.Time) (bool, error) {
	return true, nil
}

type alwaysAllowReceiptAccessChecker struct{}

func (alwaysAllowReceiptAccessChecker) CanAccessReceipt(_ context.Context, _ string, _ string) (bool, error) {
	return true, nil
}

type inMemoryMediaRepo struct {
	mu   sync.RWMutex
	objs map[string]media.MediaObject
}

func newInMemoryMediaRepo() *inMemoryMediaRepo {
	return &inMemoryMediaRepo{
		objs: make(map[string]media.MediaObject),
	}
}

func (r *inMemoryMediaRepo) Create(_ context.Context, obj media.MediaObject) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.objs[obj.ID] = obj
	return nil
}

func (r *inMemoryMediaRepo) GetByID(_ context.Context, id string) (*media.MediaObject, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	obj, ok := r.objs[id]
	if !ok {
		return nil, media.ErrMediaNotFound
	}
	copyObj := obj
	return &copyObj, nil
}

func (r *inMemoryMediaRepo) MarkConfirmed(_ context.Context, id string, sha256Hex string, confirmedAt time.Time) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	obj, ok := r.objs[id]
	if !ok {
		return media.ErrMediaNotFound
	}
	sha := sha256Hex
	confirmed := confirmedAt.UTC()
	obj.Status = media.MediaStatusConfirmed
	obj.SHA256Hex = &sha
	obj.ConfirmedAt = &confirmed
	r.objs[id] = obj
	return nil
}

func (r *inMemoryMediaRepo) MarkDeleted(_ context.Context, id string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	obj, ok := r.objs[id]
	if !ok {
		return media.ErrMediaNotFound
	}
	obj.Status = media.MediaStatusDeleted
	r.objs[id] = obj
	return nil
}

func envOrDefault(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}

func newIntegrationS3Client(t *testing.T) *storage.S3Client {
	t.Helper()
	endpoint := strings.TrimSpace(os.Getenv("TEST_S3_ENDPOINT"))
	if endpoint == "" {
		t.Skip("TEST_S3_ENDPOINT is not set; skipping MinIO/S3 integration tests")
	}

	publicEndpoint := envOrDefault("TEST_S3_PUBLIC_ENDPOINT", endpoint)
	client, err := storage.NewS3Client(storage.S3Config{
		InternalEndpoint: endpoint,
		PublicEndpoint:   publicEndpoint,
		Region:           envOrDefault("TEST_S3_REGION", "ir-thr-at1"),
		AccessKey:        envOrDefault("TEST_S3_ACCESS_KEY", "minioadmin"),
		SecretKey:        envOrDefault("TEST_S3_SECRET_KEY", "minioadmin_local_dev"),
		PublicBucket:     envOrDefault("TEST_S3_PUBLIC_BUCKET", "ravannama-public"),
		PrivateBucket:    envOrDefault("TEST_S3_PRIVATE_BUCKET", "ravannama-private"),
	})
	if err != nil {
		t.Fatalf("storage.NewS3Client failed: %v", err)
	}
	return client
}

func TestMinIOPrivateReceiptLifecycle(t *testing.T) {
	s3Client := newIntegrationS3Client(t)
	httpClient := &http.Client{Timeout: 15 * time.Second}

	repo := newInMemoryMediaRepo()
	svc := media.NewService(
		repo,
		s3Client,
		alwaysHeldBookingChecker{},
		alwaysAllowReceiptAccessChecker{},
		utcClock{},
	)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	ownerUserID := "itest-user-" + uuid.Must(uuid.NewV7()).String()
	bookingID := "itest-booking-" + uuid.Must(uuid.NewV7()).String()

	t.Run("ValidPNG_PresignPut_Confirm_MintGet_UnauthForbidden", func(t *testing.T) {
		// Minimal valid 1x1 PNG.
		pngBytes := []byte{
			0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
			0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
			0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
			0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
			0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41,
			0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
			0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
			0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
			0x42, 0x60, 0x82,
		}

		presignRes, err := svc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
			OwnerUserID: ownerUserID,
			BookingID:   bookingID,
			MIMEType:    media.MIMETypePNG,
			SizeBytes:   int64(len(pngBytes)),
		})
		if err != nil {
			t.Fatalf("PresignReceiptUpload failed: %v", err)
		}
		t.Cleanup(func() {
			cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cleanCancel()
			_ = s3Client.DeleteObject(cleanCtx, media.BucketPrivate, presignRes.ObjectKey)
		})

		putReq, err := http.NewRequestWithContext(ctx, http.MethodPut, presignRes.UploadURL, bytes.NewReader(pngBytes))
		if err != nil {
			t.Fatalf("http.NewRequest PUT failed: %v", err)
		}
		putReq.Header.Set("Content-Type", string(media.MIMETypePNG))

		putResp, err := httpClient.Do(putReq)
		if err != nil {
			t.Fatalf("presigned PUT request failed: %v", err)
		}
		putBody, _ := io.ReadAll(putResp.Body)
		putResp.Body.Close()
		if putResp.StatusCode != http.StatusOK {
			t.Fatalf("expected PUT status 200 OK, got %d (%s)", putResp.StatusCode, string(putBody))
		}

		confirmed, err := svc.ConfirmReceiptUpload(ctx, ownerUserID, presignRes.MediaObjectID)
		if err != nil {
			t.Fatalf("ConfirmReceiptUpload failed: %v", err)
		}
		if confirmed.Status != media.MediaStatusConfirmed {
			t.Fatalf("expected Status %q, got %q", media.MediaStatusConfirmed, confirmed.Status)
		}
		if confirmed.SizeBytes != int64(len(pngBytes)) {
			t.Fatalf("expected SizeBytes %d, got %d", len(pngBytes), confirmed.SizeBytes)
		}
		if confirmed.SHA256Hex == nil || *confirmed.SHA256Hex == "" {
			t.Fatalf("expected non-empty SHA256Hex, got %v", confirmed.SHA256Hex)
		}

		downloadURL, err := svc.MintReceiptDownloadURL(ctx, ownerUserID, presignRes.MediaObjectID, 60*time.Second)
		if err != nil {
			t.Fatalf("MintReceiptDownloadURL failed: %v", err)
		}

		getReq, err := http.NewRequestWithContext(ctx, http.MethodGet, downloadURL, nil)
		if err != nil {
			t.Fatalf("http.NewRequest GET signed failed: %v", err)
		}
		getResp, err := httpClient.Do(getReq)
		if err != nil {
			t.Fatalf("signed GET request failed: %v", err)
		}
		gotBytes, readErr := io.ReadAll(getResp.Body)
		getResp.Body.Close()
		if readErr != nil {
			t.Fatalf("reading signed GET body failed: %v", readErr)
		}
		if getResp.StatusCode != http.StatusOK {
			t.Fatalf("expected signed GET status 200 OK, got %d (%s)", getResp.StatusCode, string(gotBytes))
		}
		disp := getResp.Header.Get("Content-Disposition")
		if !strings.Contains(disp, "attachment") {
			t.Fatalf("expected Content-Disposition to contain attachment, got %q", disp)
		}
		if !bytes.Equal(gotBytes, pngBytes) {
			t.Fatalf("downloaded bytes mismatch: got %d bytes, want %d bytes", len(gotBytes), len(pngBytes))
		}

		unsignedURL := strings.SplitN(downloadURL, "?", 2)[0]
		unauthReq, err := http.NewRequestWithContext(ctx, http.MethodGet, unsignedURL, nil)
		if err != nil {
			t.Fatalf("http.NewRequest GET unsigned failed: %v", err)
		}
		unauthResp, err := httpClient.Do(unauthReq)
		if err != nil {
			t.Fatalf("unsigned GET request failed: %v", err)
		}
		_, _ = io.Copy(io.Discard, unauthResp.Body)
		unauthResp.Body.Close()
		if unauthResp.StatusCode != http.StatusForbidden {
			t.Fatalf("expected unsigned GET to private bucket to return 403 Forbidden, got %d", unauthResp.StatusCode)
		}
	})

	t.Run("DisguisedSVG_RejectedFailClosed_AndDeletedFromMinIO", func(t *testing.T) {
		svgBytes := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`)

		presignRes, err := svc.PresignReceiptUpload(ctx, media.PresignReceiptRequest{
			OwnerUserID: ownerUserID,
			BookingID:   bookingID,
			MIMEType:    media.MIMETypePNG,
			SizeBytes:   int64(len(svgBytes)),
		})
		if err != nil {
			t.Fatalf("PresignReceiptUpload failed: %v", err)
		}
		t.Cleanup(func() {
			cleanCtx, cleanCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer cleanCancel()
			_ = s3Client.DeleteObject(cleanCtx, media.BucketPrivate, presignRes.ObjectKey)
		})

		putReq, err := http.NewRequestWithContext(ctx, http.MethodPut, presignRes.UploadURL, bytes.NewReader(svgBytes))
		if err != nil {
			t.Fatalf("http.NewRequest PUT failed: %v", err)
		}
		putReq.Header.Set("Content-Type", string(media.MIMETypePNG))

		putResp, err := httpClient.Do(putReq)
		if err != nil {
			t.Fatalf("presigned PUT request failed: %v", err)
		}
		putBody, _ := io.ReadAll(putResp.Body)
		putResp.Body.Close()
		if putResp.StatusCode != http.StatusOK {
			t.Fatalf("expected PUT status 200 OK, got %d (%s)", putResp.StatusCode, string(putBody))
		}

		if _, err := svc.ConfirmReceiptUpload(ctx, ownerUserID, presignRes.MediaObjectID); !errors.Is(err, media.ErrInvalidReceiptFile) {
			t.Fatalf("expected ConfirmReceiptUpload to return ErrInvalidReceiptFile, got %v", err)
		}

		if meta, err := s3Client.HeadObject(ctx, media.BucketPrivate, presignRes.ObjectKey); err == nil {
			t.Fatalf("expected disguised SVG object %q to be deleted from MinIO, but HeadObject succeeded: %+v", presignRes.ObjectKey, meta)
		}
	})
}
