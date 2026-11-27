-- name: CreateMediaObject :exec
INSERT INTO media.media_objects (
    id, owner_user_id, bucket_kind, object_key, mime_type, size_bytes,
    status, sha256_hex, created_at, confirmed_at
) VALUES (
    $1, $2, $3, $4, $5, $6,
    $7, $8, $9, $10
);

-- name: GetMediaObjectByID :one
SELECT id, owner_user_id, bucket_kind, object_key, mime_type, size_bytes,
       status, sha256_hex, created_at, confirmed_at
FROM media.media_objects
WHERE id = $1;

-- name: MarkMediaObjectConfirmed :exec
UPDATE media.media_objects
SET status = 'confirmed',
    sha256_hex = $2,
    confirmed_at = $3
WHERE id = $1;

-- name: MarkMediaObjectDeleted :exec
UPDATE media.media_objects
SET status = 'deleted'
WHERE id = $1;

-- name: HasActiveHeldBooking :one
SELECT EXISTS (
    SELECT 1
    FROM booking.bookings
    WHERE id = $1
      AND client_user_id = $2
      AND status = 'held'
      AND (hold_expires_at IS NULL OR hold_expires_at > $3)
) AS active;

-- name: CanAccessReceipt :one
SELECT EXISTS (
    SELECT 1
    FROM booking.booking_receipts r
    JOIN booking.bookings b ON b.id = r.booking_id
    JOIN tenant.therapists t ON t.id = b.therapist_id
    WHERE r.media_object_id = $1
      AND (b.client_user_id = $2 OR t.user_id = $2)
) AS allowed;
