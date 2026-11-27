-- name: AcquireClientHoldLock :exec
SELECT pg_advisory_xact_lock(hashtextextended(sqlc.arg(client_user_id)::text, 0));

-- name: FindBookingByIdempotencyKey :one
SELECT id, reference_code, therapist_id, client_user_id, service_offering_id,
       clinic_id, room_id, payment_source, track, client_timezone,
       lower(slot_range)::timestamptz AS slot_start,
       upper(slot_range)::timestamptz AS slot_end,
       currency, amount_expected, commission_bps, status, idempotency_key,
       hold_expires_at, client_note, rejection_reason, call_join_url,
       created_at, updated_at
FROM booking.bookings
WHERE client_user_id = $1 AND idempotency_key = $2;

-- name: GetBookingByID :one
SELECT id, reference_code, therapist_id, client_user_id, service_offering_id,
       clinic_id, room_id, payment_source, track, client_timezone,
       lower(slot_range)::timestamptz AS slot_start,
       upper(slot_range)::timestamptz AS slot_end,
       currency, amount_expected, commission_bps, status, idempotency_key,
       hold_expires_at, client_note, rejection_reason, call_join_url,
       created_at, updated_at
FROM booking.bookings
WHERE id = $1;

-- name: GetBookingByIDForUpdate :one
SELECT id, reference_code, therapist_id, client_user_id, service_offering_id,
       clinic_id, room_id, payment_source, track, client_timezone,
       lower(slot_range)::timestamptz AS slot_start,
       upper(slot_range)::timestamptz AS slot_end,
       currency, amount_expected, commission_bps, status, idempotency_key,
       hold_expires_at, client_note, rejection_reason, call_join_url,
       created_at, updated_at
FROM booking.bookings
WHERE id = $1
FOR UPDATE;

-- name: CountActiveHoldsByClientAndTherapist :one
SELECT count(*)::int
FROM booking.bookings
WHERE client_user_id = $1
  AND therapist_id = $2
  AND status = 'held'
  AND (hold_expires_at IS NULL OR hold_expires_at > $3);

-- name: CreateBookingHold :one
INSERT INTO booking.bookings (
    id, reference_code, therapist_id, client_user_id, service_offering_id,
    clinic_id, room_id, payment_source, track, client_timezone,
    slot_range, currency, amount_expected, commission_bps, status,
    idempotency_key, hold_expires_at, client_note, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5,
    $6, $7, $8, $9, $10,
    tstzrange(sqlc.arg(slot_start)::timestamptz, sqlc.arg(slot_end)::timestamptz, '[)'), $11, $12, $13, $14,
    $15, $16, $17, $18, $19
)
RETURNING id, reference_code, therapist_id, client_user_id, service_offering_id,
          clinic_id, room_id, payment_source, track, client_timezone,
          lower(slot_range)::timestamptz AS slot_start,
          upper(slot_range)::timestamptz AS slot_end,
          currency, amount_expected, commission_bps, status, idempotency_key,
          hold_expires_at, client_note, rejection_reason, call_join_url,
          created_at, updated_at;

-- name: UpdateBookingStatus :exec
UPDATE booking.bookings
SET status = $2,
    rejection_reason = $3,
    call_join_url = $4,
    updated_at = $5
WHERE id = $1;

-- name: CreateBookingReceipt :exec
INSERT INTO booking.booking_receipts (
    id, booking_id, media_object_id, tracking_code, submitted_at
) VALUES (
    $1, $2, $3, $4, $5
);

-- name: GetBookingReceiptByBookingID :one
SELECT id, booking_id, media_object_id, tracking_code, submitted_at
FROM booking.booking_receipts
WHERE booking_id = $1;

-- name: AppendBookingStatusEvent :exec
INSERT INTO booking.booking_status_events (
    id, booking_id, actor_user_id, from_status, to_status, reason, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
);

-- name: ListStaleHoldIDsForUpdateSkipLocked :many
SELECT id
FROM booking.bookings
WHERE status = 'held' AND hold_expires_at < $1
ORDER BY hold_expires_at ASC
FOR UPDATE SKIP LOCKED
LIMIT $2;

-- name: ExpireBookingHoldByID :exec
UPDATE booking.bookings
SET status = 'expired',
    updated_at = $2
WHERE id = $1 AND status = 'held';

-- name: ListBookingsByTherapist :many
SELECT id, reference_code, therapist_id, client_user_id, service_offering_id,
       clinic_id, room_id, payment_source, track, client_timezone,
       lower(slot_range)::timestamptz AS slot_start,
       upper(slot_range)::timestamptz AS slot_end,
       currency, amount_expected, commission_bps, status, idempotency_key,
       hold_expires_at, client_note, rejection_reason, call_join_url,
       created_at, updated_at
FROM booking.bookings
WHERE therapist_id = $1
  AND (sqlc.narg(status)::text IS NULL OR status = sqlc.narg(status)::text)
ORDER BY created_at DESC;

-- name: ListBookingsByClient :many
SELECT id, reference_code, therapist_id, client_user_id, service_offering_id,
       clinic_id, room_id, payment_source, track, client_timezone,
       lower(slot_range)::timestamptz AS slot_start,
       upper(slot_range)::timestamptz AS slot_end,
       currency, amount_expected, commission_bps, status, idempotency_key,
       hold_expires_at, client_note, rejection_reason, call_join_url,
       created_at, updated_at
FROM booking.bookings
WHERE client_user_id = $1
ORDER BY created_at DESC;

-- name: ListBusySlotRangesByTherapist :many
SELECT lower(slot_range)::timestamptz AS slot_start,
       upper(slot_range)::timestamptz AS slot_end
FROM booking.bookings
WHERE therapist_id = $1
  AND status IN ('held', 'pending_verification', 'confirmed', 'completed')
  AND slot_range && tstzrange(sqlc.arg(range_start)::timestamptz, sqlc.arg(range_end)::timestamptz, '[)')
ORDER BY slot_start ASC;
