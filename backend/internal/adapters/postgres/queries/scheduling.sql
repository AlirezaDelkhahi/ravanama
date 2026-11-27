-- name: GetOfferingByID :one
SELECT id, therapist_id, track, title, description, duration_min, currency,
       price_amount, is_active, sort_order, created_at
FROM scheduling.service_offerings
WHERE id = $1;

-- name: ListActiveOfferingsByTherapist :many
SELECT id, therapist_id, track, title, description, duration_min, currency,
       price_amount, is_active, sort_order, created_at
FROM scheduling.service_offerings
WHERE therapist_id = $1
  AND track = $2
  AND is_active = true
ORDER BY sort_order ASC, created_at ASC;

-- name: UpsertOffering :one
INSERT INTO scheduling.service_offerings (
    id, therapist_id, track, title, description, duration_min, currency,
    price_amount, is_active, sort_order, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
ON CONFLICT (id) DO UPDATE
SET track = EXCLUDED.track,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    duration_min = EXCLUDED.duration_min,
    currency = EXCLUDED.currency,
    price_amount = EXCLUDED.price_amount,
    is_active = EXCLUDED.is_active,
    sort_order = EXCLUDED.sort_order
WHERE scheduling.service_offerings.therapist_id = EXCLUDED.therapist_id
RETURNING id, therapist_id, track, title, description, duration_min, currency,
          price_amount, is_active, sort_order, created_at;

-- name: ListActiveWeeklyRulesByTherapist :many
SELECT id, therapist_id, weekday_sat0, start_minute, end_minute,
       buffer_min, min_notice_hr, is_active
FROM scheduling.weekly_availability_rules
WHERE therapist_id = $1
  AND is_active = true
ORDER BY weekday_sat0 ASC, start_minute ASC;

-- name: DeleteWeeklyRulesByTherapist :exec
DELETE FROM scheduling.weekly_availability_rules
WHERE therapist_id = $1;

-- name: InsertWeeklyRule :exec
INSERT INTO scheduling.weekly_availability_rules (
    id, therapist_id, weekday_sat0, start_minute, end_minute,
    buffer_min, min_notice_hr, is_active
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
);

-- name: ListOverridesByTherapistInRange :many
SELECT id, therapist_id, override_date, is_closed, start_minute, end_minute, reason
FROM scheduling.availability_overrides
WHERE therapist_id = $1
  AND override_date >= $2
  AND override_date <= $3
ORDER BY override_date ASC, start_minute ASC NULLS FIRST;

-- name: GetOverrideByID :one
SELECT id, therapist_id, override_date, is_closed, start_minute, end_minute, reason
FROM scheduling.availability_overrides
WHERE id = $1;

-- name: DeleteOverridesByTherapistAndDateExceptID :exec
DELETE FROM scheduling.availability_overrides
WHERE therapist_id = $1
  AND override_date = $2
  AND id <> $3;

-- name: DeleteClosedOverrideByTherapistAndDateExceptID :exec
DELETE FROM scheduling.availability_overrides
WHERE therapist_id = $1
  AND override_date = $2
  AND is_closed = true
  AND id <> $3;

-- name: DeleteOverrideByTherapistDateStartMinuteExceptID :exec
DELETE FROM scheduling.availability_overrides
WHERE therapist_id = $1
  AND override_date = $2
  AND start_minute = $3
  AND id <> $4;

-- name: UpsertOverride :one
INSERT INTO scheduling.availability_overrides (
    id, therapist_id, override_date, is_closed, start_minute, end_minute, reason
) VALUES (
    $1, $2, $3, $4, $5, $6, $7
)
ON CONFLICT (id) DO UPDATE
SET override_date = EXCLUDED.override_date,
    is_closed = EXCLUDED.is_closed,
    start_minute = EXCLUDED.start_minute,
    end_minute = EXCLUDED.end_minute,
    reason = EXCLUDED.reason
WHERE scheduling.availability_overrides.therapist_id = EXCLUDED.therapist_id
RETURNING id, therapist_id, override_date, is_closed, start_minute, end_minute, reason;
