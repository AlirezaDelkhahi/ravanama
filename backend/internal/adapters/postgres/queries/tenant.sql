-- name: GetTherapistByID :one
SELECT id, user_id, slug, display_name, headline, bio_markdown, license_number,
       years_experience, focus_tags, education_timeline, avatar_object_key,
       default_call_url, directory_opt_in, reviews_enabled, timezone,
       cancellation_policy_fa, created_at, updated_at
FROM tenant.therapists
WHERE id = $1;

-- name: GetTherapistByUserID :one
SELECT id, user_id, slug, display_name, headline, bio_markdown, license_number,
       years_experience, focus_tags, education_timeline, avatar_object_key,
       default_call_url, directory_opt_in, reviews_enabled, timezone,
       cancellation_policy_fa, created_at, updated_at
FROM tenant.therapists
WHERE user_id = $1;

-- name: GetTherapistBySlug :one
SELECT id, user_id, slug, display_name, headline, bio_markdown, license_number,
       years_experience, focus_tags, education_timeline, avatar_object_key,
       default_call_url, directory_opt_in, reviews_enabled, timezone,
       cancellation_policy_fa, created_at, updated_at
FROM tenant.therapists
WHERE slug = $1;

-- name: GetTherapistByVerifiedHostname :one
SELECT t.id, t.user_id, t.slug, t.display_name, t.headline, t.bio_markdown, t.license_number,
       t.years_experience, t.focus_tags, t.education_timeline, t.avatar_object_key,
       t.default_call_url, t.directory_opt_in, t.reviews_enabled, t.timezone,
       t.cancellation_policy_fa, t.created_at, t.updated_at
FROM tenant.therapists t
JOIN tenant.tenant_domains d ON d.therapist_id = t.id
WHERE d.hostname = $1
  AND d.status = 'verified'
LIMIT 1;

-- name: ListOptedInDirectoryTherapists :many
SELECT id, user_id, slug, display_name, headline, bio_markdown, license_number,
       years_experience, focus_tags, education_timeline, avatar_object_key,
       default_call_url, directory_opt_in, reviews_enabled, timezone,
       cancellation_policy_fa, created_at, updated_at
FROM tenant.therapists
WHERE directory_opt_in = true
ORDER BY created_at DESC;

-- name: UpdateTherapistProfile :one
UPDATE tenant.therapists
SET display_name = $2,
    headline = $3,
    bio_markdown = $4,
    license_number = $5,
    years_experience = $6,
    focus_tags = $7,
    education_timeline = $8,
    avatar_object_key = $9,
    default_call_url = $10,
    directory_opt_in = $11,
    reviews_enabled = $12,
    timezone = $13,
    cancellation_policy_fa = $14,
    updated_at = $15
WHERE id = $1
RETURNING id, user_id, slug, display_name, headline, bio_markdown, license_number,
          years_experience, focus_tags, education_timeline, avatar_object_key,
          default_call_url, directory_opt_in, reviews_enabled, timezone,
          cancellation_policy_fa, created_at, updated_at;

-- name: GetDomainByHostname :one
SELECT id, therapist_id, hostname, is_primary, status, txt_token, verified_at, created_at
FROM tenant.tenant_domains
WHERE hostname = $1;

-- name: GetDomainByID :one
SELECT id, therapist_id, hostname, is_primary, status, txt_token, verified_at, created_at
FROM tenant.tenant_domains
WHERE id = $1;

-- name: ListDomainsByTherapist :many
SELECT id, therapist_id, hostname, is_primary, status, txt_token, verified_at, created_at
FROM tenant.tenant_domains
WHERE therapist_id = $1
ORDER BY is_primary DESC, created_at ASC;

-- name: CreateTenantDomain :exec
INSERT INTO tenant.tenant_domains (
    id, therapist_id, hostname, is_primary, status, txt_token, verified_at, created_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8
);

-- name: ClearPrimaryDomainForTherapist :exec
UPDATE tenant.tenant_domains
SET is_primary = false
WHERE therapist_id = $1 AND is_primary = true AND id <> $2;

-- name: MarkDomainVerified :exec
UPDATE tenant.tenant_domains
SET status = 'verified',
    is_primary = $2,
    verified_at = $3
WHERE id = $1;

-- name: IsVerifiedCustomDomain :one
SELECT EXISTS (
    SELECT 1
    FROM tenant.tenant_domains
    WHERE hostname = $1 AND status = 'verified'
) AS verified;

-- name: GetPaymentAccountByID :one
SELECT id, therapist_id, track, method, account_label, destination_val,
       holder_name, is_active, created_at, updated_at
FROM tenant.therapist_payment_accounts
WHERE id = $1;

-- name: ListActivePaymentAccountsByTherapistAndTrack :many
SELECT id, therapist_id, track, method, account_label, destination_val,
       holder_name, is_active, created_at, updated_at
FROM tenant.therapist_payment_accounts
WHERE therapist_id = $1
  AND track = $2
  AND is_active = true
ORDER BY created_at ASC;

-- name: UpsertPaymentAccount :one
INSERT INTO tenant.therapist_payment_accounts (
    id, therapist_id, track, method, account_label, destination_val,
    holder_name, is_active, created_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
)
ON CONFLICT (id) DO UPDATE
SET track = EXCLUDED.track,
    method = EXCLUDED.method,
    account_label = EXCLUDED.account_label,
    destination_val = EXCLUDED.destination_val,
    holder_name = EXCLUDED.holder_name,
    is_active = EXCLUDED.is_active,
    updated_at = EXCLUDED.updated_at
WHERE tenant.therapist_payment_accounts.therapist_id = EXCLUDED.therapist_id
RETURNING id, therapist_id, track, method, account_label, destination_val,
          holder_name, is_active, created_at, updated_at;
