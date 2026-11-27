package storage_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/adapters/storage"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

func TestS3Client_PresignPutAndGet(t *testing.T) {
	fixedNow := time.Date(2026, 11, 27, 12, 0, 0, 0, time.UTC)
	client, err := storage.NewS3Client(storage.S3Config{
		InternalEndpoint: "http://minio:9000",
		PublicEndpoint:   "http://localhost:8088",
		Region:           "ir-thr-at1",
		AccessKey:        "minioadmin",
		SecretKey:        "minioadmin_local_dev",
		PublicBucket:     "ravannama-public",
		PrivateBucket:    "ravannama-private",
		Now:              func() time.Time { return fixedNow },
	})
	if err != nil {
		t.Fatalf("NewS3Client failed: %v", err)
	}

	ctx := context.Background()
	putURL, err := client.PresignPut(ctx, media.BucketPrivate, "receipts/u1/obj1.png", media.MIMETypePNG, 12345, 5*time.Minute)
	if err != nil {
		t.Fatalf("PresignPut failed: %v", err)
	}
	parsedPut, err := url.Parse(putURL)
	if err != nil {
		t.Fatalf("parse PresignPut URL: %v", err)
	}
	if parsedPut.Host != "localhost:8088" {
		t.Fatalf("expected PublicEndpoint host localhost:8088, got %s", parsedPut.Host)
	}
	if parsedPut.Path != "/ravannama-private/receipts/u1/obj1.png" {
		t.Fatalf("unexpected path: %s", parsedPut.Path)
	}
	q := parsedPut.Query()
	if q.Get("X-Amz-Algorithm") != "AWS4-HMAC-SHA256" {
		t.Fatalf("unexpected algorithm: %s", q.Get("X-Amz-Algorithm"))
	}
	if q.Get("X-Amz-SignedHeaders") != "content-type;host" {
		t.Fatalf("expected X-Amz-SignedHeaders=content-type;host (never content-length), got %q", q.Get("X-Amz-SignedHeaders"))
	}
	if q.Get("X-Amz-Expires") != "300" {
		t.Fatalf("expected 300s expiry, got %q", q.Get("X-Amz-Expires"))
	}
	if q.Get("X-Amz-Signature") == "" {
		t.Fatal("expected non-empty signature")
	}

	// PresignGet > 60s must fail
	if _, err := client.PresignGet(ctx, media.BucketPrivate, "receipts/u1/obj1.png", 61*time.Second); !errors.Is(err, media.ErrInvalidDownloadTTL) {
		t.Fatalf("expected ErrInvalidDownloadTTL for >60s, got %v", err)
	}

	getURL, err := client.PresignGet(ctx, media.BucketPrivate, "receipts/u1/obj1.png", 60*time.Second)
	if err != nil {
		t.Fatalf("PresignGet failed: %v", err)
	}
	parsedGet, err := url.Parse(getURL)
	if err != nil {
		t.Fatalf("parse PresignGet URL: %v", err)
	}
	gq := parsedGet.Query()
	if gq.Get("response-content-disposition") != "attachment" {
		t.Fatalf("expected response-content-disposition=attachment, got %q", gq.Get("response-content-disposition"))
	}
	if gq.Get("X-Amz-SignedHeaders") != "host" {
		t.Fatalf("expected X-Amz-SignedHeaders=host, got %q", gq.Get("X-Amz-SignedHeaders"))
	}
}

func TestS3Client_InternalOperations(t *testing.T) {
	payload := []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x01, 0x02, 0x03}
	var deleted bool
	var putBody []byte

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		if !strings.HasPrefix(auth, "AWS4-HMAC-SHA256 ") {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		if r.URL.Path != "/ravannama-private/receipts/u1/test.png" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		switch r.Method {
		case http.MethodPut:
			b, _ := io.ReadAll(r.Body)
			putBody = b
			w.WriteHeader(http.StatusOK)
		case http.MethodHead:
			w.Header().Set("Content-Type", "image/png")
			w.Header().Set("Content-Length", "12")
			w.Header().Set("ETag", `"abc123"`)
			w.WriteHeader(http.StatusOK)
		case http.MethodGet:
			if r.Header.Get("Range") != "bytes=0-7" {
				w.WriteHeader(http.StatusBadRequest)
				return
			}
			w.WriteHeader(http.StatusPartialContent)
			_, _ = w.Write(payload[:8])
		case http.MethodDelete:
			deleted = true
			w.WriteHeader(http.StatusNoContent)
		}
	}))
	defer srv.Close()

	client, err := storage.NewS3Client(storage.S3Config{
		InternalEndpoint: srv.URL,
		PublicEndpoint:   "http://localhost:8088",
		Region:           "ir-thr-at1",
		AccessKey:        "minioadmin",
		SecretKey:        "minioadmin_local_dev",
		PublicBucket:     "ravannama-public",
		PrivateBucket:    "ravannama-private",
	})
	if err != nil {
		t.Fatalf("NewS3Client: %v", err)
	}

	ctx := context.Background()
	if err := client.PutObject(ctx, media.BucketPrivate, "receipts/u1/test.png", media.MIMETypePNG, payload); err != nil {
		t.Fatalf("PutObject: %v", err)
	}
	if len(putBody) != len(payload) {
		t.Fatalf("expected put body len %d, got %d", len(payload), len(putBody))
	}

	meta, err := client.HeadObject(ctx, media.BucketPrivate, "receipts/u1/test.png")
	if err != nil {
		t.Fatalf("HeadObject: %v", err)
	}
	if meta.ContentLength != 12 || meta.ETag != "abc123" {
		t.Fatalf("unexpected HeadObject meta: %+v", meta)
	}

	gotRange, err := client.GetObjectRange(ctx, media.BucketPrivate, "receipts/u1/test.png", 0, 7)
	if err != nil {
		t.Fatalf("GetObjectRange: %v", err)
	}
	if len(gotRange) != 8 {
		t.Fatalf("expected 8 range bytes, got %d", len(gotRange))
	}

	if err := client.DeleteObject(ctx, media.BucketPrivate, "receipts/u1/test.png"); err != nil {
		t.Fatalf("DeleteObject: %v", err)
	}
	if !deleted {
		t.Fatal("expected DeleteObject to execute")
	}
}
