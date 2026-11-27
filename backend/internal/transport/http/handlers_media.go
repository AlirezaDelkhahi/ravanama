package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

type presignReceiptReq struct {
	BookingID string `json:"booking_id"`
	MIMEType  string `json:"mime_type"`
	SizeBytes int64  `json:"size_bytes"`
}

type confirmReceiptReq struct {
	MediaObjectID string `json:"media_object_id"`
}

func handlePresignReceiptUpload(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req presignReceiptReq
		if !decodeJSON(w, r, &req) {
			return
		}

		res, err := deps.Media.PresignReceiptUpload(r.Context(), media.PresignReceiptRequest{
			OwnerUserID: user.ID,
			BookingID:   strings.TrimSpace(req.BookingID),
			MIMEType:    media.AllowedMIMEType(strings.TrimSpace(req.MIMEType)),
			SizeBytes:   req.SizeBytes,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		writeJSON(w, http.StatusCreated, map[string]any{
			"media_object_id": res.MediaObjectID,
			"object_key":      res.ObjectKey,
			"upload_url":      res.UploadURL,
			"expires_at":      res.ExpiresAt.UTC().Format(time.RFC3339),
		})
	})
}

func handleConfirmReceiptUpload(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req confirmReceiptReq
		if !decodeJSON(w, r, &req) {
			return
		}

		obj, err := deps.Media.ConfirmReceiptUpload(r.Context(), user.ID, strings.TrimSpace(req.MediaObjectID))
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"media_object": map[string]any{
				"id":          obj.ID,
				"bucket_kind": string(obj.BucketKind),
				"object_key":  obj.ObjectKey,
				"mime_type":   string(obj.MIMEType),
				"size_bytes":  obj.SizeBytes,
				"status":      string(obj.Status),
				"sha256_hex":  obj.SHA256Hex,
				"confirmed_at": obj.ConfirmedAt,
			},
		})
	})
}
