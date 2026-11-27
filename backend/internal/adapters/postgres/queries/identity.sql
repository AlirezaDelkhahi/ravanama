-- name: GetUserByID :one
SELECT id, role, full_name, phone_e164, email, locale, created_at, updated_at
FROM identity.users
WHERE id = $1;

-- name: GetUserByPhoneE164 :one
SELECT id, role, full_name, phone_e164, email, locale, created_at, updated_at
FROM identity.users
WHERE phone_e164 = $1;

-- name: GetUserByEmail :one
SELECT id, role, full_name, phone_e164, email, locale, created_at, updated_at
FROM identity.users
WHERE email = $1;

-- name: UpsertClientByPhone :one
INSERT INTO identity.users (id, role, full_name, phone_e164, locale)
VALUES ($1, 'client', $2, $3, $4)
ON CONFLICT (phone_e164) DO UPDATE
SET full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE identity.users.full_name END,
    updated_at = now()
RETURNING id, role, full_name, phone_e164, email, locale, created_at, updated_at;

-- name: UpsertClientByEmail :one
INSERT INTO identity.users (id, role, full_name, email, locale)
VALUES ($1, 'client', $2, $3, $4)
ON CONFLICT (email) DO UPDATE
SET full_name = CASE WHEN EXCLUDED.full_name <> '' THEN EXCLUDED.full_name ELSE identity.users.full_name END,
    updated_at = now()
RETURNING id, role, full_name, phone_e164, email, locale, created_at, updated_at;

-- name: CreateOTPChallenge :exec
INSERT INTO identity.otp_challenges (
    id, destination, channel, purpose, code_hmac, attempts, expires_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
);

-- name: GetLatestActiveOTPChallenge :one
SELECT id, destination, channel, purpose, code_hmac, attempts, expires_at, consumed_at, created_at
FROM identity.otp_challenges
WHERE destination = $1
  AND purpose = $2
  AND channel = $3
  AND consumed_at IS NULL
ORDER BY created_at DESC, id DESC
LIMIT 1;

-- name: IncrementOTPChallengeAttempts :one
UPDATE identity.otp_challenges
SET attempts = attempts + 1
WHERE id = $1 AND attempts < 5
RETURNING attempts;

-- name: MarkOTPChallengeConsumed :one
UPDATE identity.otp_challenges
SET consumed_at = $2
WHERE id = $1
  AND consumed_at IS NULL
  AND attempts < 5
RETURNING id;

-- name: CreateUserSession :exec
INSERT INTO identity.user_sessions (
    id, user_id, token_hash, expires_at, created_at
) VALUES (
    $1, $2, $3, $4, $5
);

-- name: GetSessionByTokenHash :one
SELECT id, user_id, token_hash, expires_at, revoked_at, created_at
FROM identity.user_sessions
WHERE token_hash = $1;

-- name: RevokeSession :exec
UPDATE identity.user_sessions
SET revoked_at = $2
WHERE id = $1;
