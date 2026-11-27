-- +goose Up
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==========================================
-- 1. IDENTITY SCHEMA
-- ==========================================
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
    id            UUID PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('client', 'therapist', 'admin')),
    full_name     TEXT NOT NULL,
    phone_e164    TEXT UNIQUE,
    email         TEXT UNIQUE,
    locale        TEXT NOT NULL DEFAULT 'fa-IR',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE identity.otp_challenges (
    id            UUID PRIMARY KEY,
    destination   TEXT NOT NULL,
    channel       TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    purpose       TEXT NOT NULL CHECK (purpose IN ('login', 'booking_verify')),
    code_hmac     TEXT NOT NULL,
    attempts      SMALLINT NOT NULL DEFAULT 0 CHECK (attempts >= 0 AND attempts <= 5),
    expires_at    TIMESTAMPTZ NOT NULL,
    consumed_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_otp_active_dest ON identity.otp_challenges (destination, purpose, created_at DESC)
    WHERE consumed_at IS NULL;

CREATE TABLE identity.user_sessions (
    id            UUID PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE CASCADE,
    token_hash    TEXT NOT NULL UNIQUE,
    expires_at    TIMESTAMPTZ NOT NULL,
    revoked_at    TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessions_user ON identity.user_sessions (user_id) WHERE revoked_at IS NULL;

-- ==========================================
-- 2. TENANT SCHEMA (Solo + Phase 2 Clinic M2M)
-- ==========================================
CREATE SCHEMA IF NOT EXISTS tenant;

CREATE TABLE tenant.therapists (
    id                      UUID PRIMARY KEY,
    user_id                 UUID NOT NULL UNIQUE REFERENCES identity.users(id) ON DELETE RESTRICT,
    slug                    TEXT NOT NULL UNIQUE
                            CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$')
                            CHECK (slug NOT IN (
                                'api', 'www', 'app', 'admin', 'dashboard',
                                'my-sessions', 'therapists', 'for-therapists', 'tenants',
                                'fonts', 'images', 'login', 'logout', 'auth', 'blog',
                                'assets', 'static', 'internal', 'health', 'sitemap', 'robots'
                            )),
    display_name            TEXT NOT NULL,
    headline                TEXT NOT NULL,
    bio_markdown            TEXT NOT NULL DEFAULT '',
    license_number          TEXT NOT NULL DEFAULT '',
    years_experience        SMALLINT NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
    focus_tags              TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(focus_tags) <= 8),
    education_timeline      JSONB NOT NULL DEFAULT '[]'::jsonb,
    avatar_object_key       TEXT,
    default_call_url        TEXT CHECK (default_call_url IS NULL OR default_call_url ~ '^https://'),
    directory_opt_in        BOOLEAN NOT NULL DEFAULT false,
    reviews_enabled         BOOLEAN NOT NULL DEFAULT false,
    timezone                TEXT NOT NULL DEFAULT 'Asia/Tehran',
    cancellation_policy_fa  TEXT NOT NULL DEFAULT '',
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_therapists_directory ON tenant.therapists (directory_opt_in) WHERE directory_opt_in = true;

CREATE TABLE tenant.tenant_domains (
    id            UUID PRIMARY KEY,
    therapist_id  UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    hostname      TEXT NOT NULL UNIQUE,
    is_primary    BOOLEAN NOT NULL DEFAULT false,
    status        TEXT NOT NULL CHECK (status IN ('pending_dns', 'verified', 'disabled')),
    txt_token     TEXT NOT NULL,
    verified_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_tenant_primary_domain ON tenant.tenant_domains (therapist_id)
    WHERE is_primary = true AND status = 'verified';

CREATE TABLE tenant.therapist_payment_accounts (
    id               UUID PRIMARY KEY,
    therapist_id     UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    track            TEXT NOT NULL CHECK (track IN ('iran', 'abroad')),
    method           TEXT NOT NULL CHECK (method IN ('card_to_card', 'sheba', 'paypal', 'iban', 'usdt')),
    account_label    TEXT NOT NULL,
    destination_val  TEXT NOT NULL,
    holder_name      TEXT NOT NULL,
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (
        (track = 'iran' AND method IN ('card_to_card', 'sheba')) OR
        (track = 'abroad' AND method IN ('paypal', 'iban', 'usdt'))
    )
);
CREATE INDEX idx_payment_accounts_therapist ON tenant.therapist_payment_accounts (therapist_id, track)
    WHERE is_active = true;

-- Phase 2 Schema Seam: Multi-Therapist Clinics (M2M) & Rooms
CREATE TABLE tenant.clinics (
    id            UUID PRIMARY KEY,
    slug          TEXT NOT NULL UNIQUE,
    name          TEXT NOT NULL,
    owner_user_id UUID NOT NULL REFERENCES identity.users(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tenant.clinic_therapists (
    clinic_id        UUID NOT NULL REFERENCES tenant.clinics(id) ON DELETE CASCADE,
    therapist_id     UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    commission_bps   INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps >= 0 AND commission_bps <= 10000),
    is_active        BOOLEAN NOT NULL DEFAULT true,
    PRIMARY KEY (clinic_id, therapist_id)
);

CREATE TABLE tenant.clinic_rooms (
    id            UUID PRIMARY KEY,
    clinic_id     UUID NOT NULL REFERENCES tenant.clinics(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true
);

-- ==========================================
-- 3. SCHEDULING SCHEMA
-- ==========================================
CREATE SCHEMA IF NOT EXISTS scheduling;

CREATE TABLE scheduling.service_offerings (
    id              UUID PRIMARY KEY,
    therapist_id    UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    track           TEXT NOT NULL CHECK (track IN ('iran', 'abroad')),
    title           TEXT NOT NULL,
    description     TEXT NOT NULL DEFAULT '',
    duration_min    SMALLINT NOT NULL CHECK (duration_min IN (30, 45, 50, 60, 75, 90, 120)),
    currency        TEXT NOT NULL CHECK (currency IN ('IRT', 'USD', 'EUR')),
    price_amount    BIGINT NOT NULL CHECK (price_amount > 0),
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offerings_therapist ON scheduling.service_offerings (therapist_id, track, is_active);

CREATE TABLE scheduling.weekly_availability_rules (
    id              UUID PRIMARY KEY,
    therapist_id    UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    weekday_sat0    SMALLINT NOT NULL CHECK (weekday_sat0 BETWEEN 0 AND 6),
    start_minute    SMALLINT NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute      SMALLINT NOT NULL CHECK (end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
    buffer_min      SMALLINT NOT NULL DEFAULT 10 CHECK (buffer_min BETWEEN 0 AND 60),
    min_notice_hr   SMALLINT NOT NULL DEFAULT 12 CHECK (min_notice_hr BETWEEN 1 AND 168),
    is_active       BOOLEAN NOT NULL DEFAULT true
);
CREATE INDEX idx_weekly_rules_therapist ON scheduling.weekly_availability_rules (therapist_id, weekday_sat0)
    WHERE is_active = true;

CREATE TABLE scheduling.availability_overrides (
    id              UUID PRIMARY KEY,
    therapist_id    UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    override_date   DATE NOT NULL,
    is_closed       BOOLEAN NOT NULL DEFAULT true,
    start_minute    SMALLINT CHECK (start_minute BETWEEN 0 AND 1439),
    end_minute      SMALLINT CHECK (end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
    reason          TEXT NOT NULL DEFAULT '',
    CHECK (
        (is_closed = true AND start_minute IS NULL AND end_minute IS NULL) OR
        (is_closed = false AND start_minute IS NOT NULL AND end_minute IS NOT NULL)
    ),
    UNIQUE NULLS NOT DISTINCT (therapist_id, override_date, start_minute)
);

-- ==========================================
-- 4. MEDIA, BOOKING & CONTENT SCHEMAS
-- ==========================================
CREATE SCHEMA IF NOT EXISTS media;

CREATE TABLE media.media_objects (
    id            UUID PRIMARY KEY,
    owner_user_id UUID NOT NULL REFERENCES identity.users(id),
    bucket_kind   TEXT NOT NULL CHECK (bucket_kind IN ('public', 'private')),
    object_key    TEXT NOT NULL UNIQUE,
    mime_type     TEXT NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
    size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
    status        TEXT NOT NULL CHECK (status IN ('pending_upload', 'confirmed', 'deleted')),
    sha256_hex    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at  TIMESTAMPTZ
);

CREATE SCHEMA IF NOT EXISTS booking;

CREATE TABLE booking.bookings (
    id                   UUID PRIMARY KEY,
    reference_code       TEXT NOT NULL UNIQUE,
    therapist_id         UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE RESTRICT,
    client_user_id       UUID NOT NULL REFERENCES identity.users(id) ON DELETE RESTRICT,
    service_offering_id  UUID NOT NULL REFERENCES scheduling.service_offerings(id) ON DELETE RESTRICT,
    -- Phase 2 Nullable Seams
    clinic_id            UUID REFERENCES tenant.clinics(id),
    room_id              UUID REFERENCES tenant.clinic_rooms(id),
    payment_source       TEXT NOT NULL DEFAULT 'manual_receipt'
                         CHECK (payment_source IN ('manual_receipt', 'gateway', 'clinic_cash')),
    -- Track & Time
    track                TEXT NOT NULL CHECK (track IN ('iran', 'abroad')),
    client_timezone      TEXT NOT NULL,
    slot_range           TSTZRANGE NOT NULL,
    -- Financial Snapshot (Exact Integer Money, Zero Floats)
    currency             TEXT NOT NULL CHECK (currency IN ('IRT', 'USD', 'EUR')),
    amount_expected      BIGINT NOT NULL CHECK (amount_expected > 0),
    commission_bps       INTEGER NOT NULL DEFAULT 0 CHECK (commission_bps >= 0 AND commission_bps <= 10000),
    -- State Machine
    status               TEXT NOT NULL CHECK (status IN (
                             'held',
                             'pending_verification',
                             'confirmed',
                             'rejected',
                             'expired',
                             'cancelled',
                             'completed'
                         )),
    idempotency_key      TEXT NOT NULL,
    hold_expires_at      TIMESTAMPTZ,
    client_note          TEXT NOT NULL DEFAULT '',
    rejection_reason     TEXT,
    call_join_url        TEXT CHECK (call_join_url IS NULL OR call_join_url ~ '^https://'),
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (client_user_id, idempotency_key),
    CONSTRAINT bookings_no_therapist_overlap EXCLUDE USING gist (therapist_id WITH =, slot_range WITH &&)
        WHERE (status IN ('held', 'pending_verification', 'confirmed', 'completed'))
);

CREATE INDEX idx_bookings_held_expires ON booking.bookings (hold_expires_at)
    WHERE status = 'held';

CREATE INDEX idx_bookings_therapist_status ON booking.bookings (therapist_id, status, created_at DESC);
CREATE INDEX idx_bookings_client_created ON booking.bookings (client_user_id, created_at DESC);

ALTER TABLE booking.bookings
    ADD CONSTRAINT excl_bookings_room_slot
    EXCLUDE USING gist (room_id WITH =, slot_range WITH &&)
    WHERE (room_id IS NOT NULL AND status IN ('held', 'pending_verification', 'confirmed', 'completed'));

CREATE TABLE booking.booking_receipts (
    id               UUID PRIMARY KEY,
    booking_id       UUID NOT NULL UNIQUE REFERENCES booking.bookings(id) ON DELETE CASCADE,
    media_object_id  UUID NOT NULL UNIQUE REFERENCES media.media_objects(id) ON DELETE RESTRICT,
    tracking_code    TEXT NOT NULL DEFAULT '',
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE booking.booking_status_events (
    id             UUID PRIMARY KEY,
    booking_id     UUID NOT NULL REFERENCES booking.bookings(id) ON DELETE CASCADE,
    actor_user_id  UUID REFERENCES identity.users(id),
    from_status    TEXT,
    to_status      TEXT NOT NULL,
    reason         TEXT NOT NULL DEFAULT '',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_booking_events_booking ON booking.booking_status_events (booking_id, created_at ASC);

CREATE SCHEMA IF NOT EXISTS content;

CREATE TABLE content.blog_posts (
    id                UUID PRIMARY KEY,
    therapist_id      UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    slug              TEXT NOT NULL CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,80}[a-z0-9]$'),
    title             TEXT NOT NULL,
    excerpt           TEXT NOT NULL DEFAULT '',
    body_markdown     TEXT NOT NULL,
    cover_object_key  TEXT,
    seo_title         TEXT NOT NULL DEFAULT '',
    seo_description   TEXT NOT NULL DEFAULT '',
    reading_min       SMALLINT NOT NULL DEFAULT 3 CHECK (reading_min > 0),
    status            TEXT NOT NULL CHECK (status IN ('draft', 'published')),
    published_at      TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (therapist_id, slug)
);
CREATE INDEX idx_blog_published ON content.blog_posts (therapist_id, published_at DESC)
    WHERE status = 'published';

CREATE TABLE content.reviews (
    id            UUID PRIMARY KEY,
    booking_id    UUID NOT NULL UNIQUE REFERENCES booking.bookings(id) ON DELETE RESTRICT,
    therapist_id  UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    client_label  TEXT NOT NULL,
    rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment       TEXT NOT NULL,
    is_published  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- +goose Down
DROP SCHEMA IF EXISTS content CASCADE;
DROP SCHEMA IF EXISTS booking CASCADE;
DROP SCHEMA IF EXISTS media CASCADE;
DROP SCHEMA IF EXISTS scheduling CASCADE;
DROP SCHEMA IF EXISTS tenant CASCADE;
DROP SCHEMA IF EXISTS identity CASCADE;
