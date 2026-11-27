# RavanNama (`روان‌نما`) — Engineering & UI/UX Constitution (`AGENTS.md`)

> Authoritative repository rules distilled from [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md). Every human engineer and autonomous agent working in this repository MUST follow these invariants without exception.

---

## 1. Stack & Monorepo Layout

No Kafka, no Redis cluster, and no microservices split in Phase 1:

- **Backend (`backend/`):** Single **Go 1.23+ modular monolith** (`cmd/api`) with an in-process background ticker worker (`30s` stale-hold expiry sweep; `5m` cleanup/outbox sweep).
- **Database:** **PostgreSQL 16+** (`btree_gist` extension enabled, `pgx/v5`, `sqlc`, `goose` migrations in `backend/migrations/`).
- **Object Storage:** S3-compatible storage (ArvanCloud in production, MinIO locally) strictly split into `public` and `private` buckets.
- **Frontend (`frontend/`):** **Next.js App Router** with TypeScript, Tailwind CSS v4, and self-hosted Persian fonts (`Vazirmatn` / `Peyda`).
- **Edge & TLS (`deploy/Caddyfile`):** **Caddy** reverse proxy using `on_demand_tls` (`ask http://api:8080/internal/tls/allow`), blocking `/internal/*` externally, and proxying same-origin `/api/v1/*` and `/healthz` to the Go API across every verified domain.

```text
ravanama/
├── AGENTS.md
├── docker-compose.yml
├── deploy/Caddyfile
├── docs/BLUEPRINT.md
├── backend/
│   ├── cmd/api/main.go
│   ├── internal/
│   │   ├── bootstrap/{app.go,test_app.go}
│   │   ├── domain/{identity,tenant,scheduling,booking,media,content,assessment}/
│   │   │   ├── interfaces.go
│   │   │   ├── service.go
│   │   │   └── service_test.go
│   │   ├── adapters/{postgres,storage,notify,ratelimit}/
│   │   └── transport/http/
│   └── migrations/
└── frontend/
    ├── public/fonts/{vazirmatn,peyda}/
    └── src/
        ├── middleware.ts
        ├── app/(platform)/{page.tsx,therapists/page.tsx,my-sessions/page.tsx,dashboard/page.tsx}
        ├── app/tenants/[slug]/{page.tsx,book/page.tsx,blog/page.tsx,blog/[post]/page.tsx,sitemap.xml/route.ts,robots.txt/route.ts}
        ├── components/{ui,calendar,booking}/
        └── lib/{api.ts,tenant-href.ts,jalali.ts,timezone.ts}
```

---

## 2. Strict Go Dependency Inversion (`interfaces.go`)

Every backend domain follows this exact unidirectional boundary:

```text
HTTP Handler → Domain Service Interface (interfaces.go) → Domain Service (service.go) → Outbound Port Interface (interfaces.go) → Adapter (adapters/*)
```

- **Zero Adapter Leakage:** Domain services (`internal/domain/*/service.go`) MUST NEVER import `internal/adapters/*`, `sqlc` generated packages/structs, or HTTP transport packages.
- **Cross-Domain Boundary:** Domain services MUST NEVER import another domain's internal structs or `service.go`; cross-domain calls go strictly through the target domain's `interfaces.go` and are wired solely inside `internal/bootstrap/`.
- **Thin HTTP Handlers:** Handlers in `internal/transport/http/` depend ONLY on domain service interfaces (`interfaces.go`), never directly on Postgres/S3/adapters.
- **Unit Test Isolation:** Unit tests (`internal/domain/*/*_test.go`) MUST run in-memory via `bootstrap.NewTestApp()` using hand-written fakes implementing `interfaces.go` ports. **NEVER** query or instantiate database models directly in unit tests.

---

## 3. Exact Integer Money & Financial Integrity

- **Zero Floating-Point Numbers for Money or Rates:** NEVER use `float32`, `float64`, `REAL`, or `DOUBLE PRECISION` anywhere for prices, fees, balances, or commissions.
- **Integer Representation:**
  - All monetary amounts (`price_amount`, `amount_expected`) MUST be `BIGINT` / `int64` (`IRT` stored in Toman; `USD` and `EUR` stored in minor cents).
  - All commission splits (`commission_bps`) MUST be `INTEGER` basis points (`0..10000`).
- **Ledger Integrity:** Never mutate wallet or ledger balances directly on models. Route all balance/commission movements through `CommissionLedgerPort` (Phase 2) and `LicenseWalletService` (Phase 3) inside `SELECT ... FOR UPDATE` transactions backed by immutable append-only ledgers.

---

## 4. Concurrency, Locking & Post-Commit Side Effects

- **Database Double-Booking Guard:** `booking.bookings` enforces `EXCLUDE USING gist (therapist_id WITH =, slot_range WITH &&) WHERE (status IN ('held', 'pending_verification', 'confirmed', 'completed'))` (plus `excl_bookings_room_slot` for Phase 2 rooms). Map PostgreSQL `SQLSTATE 23P01` cleanly to HTTP `409 Conflict`.
- **Slot-Hoarding & Idempotency on `CreateHold`:**
  - Require verified session + non-empty `Idempotency-Key` (`UNIQUE (client_user_id, idempotency_key)`).
  - Acquire `pg_advisory_xact_lock(hashtextextended(client_user_id::text, 0))` to enforce max concurrent `held` bookings per client per therapist.
- **State Transition Locking (`SubmitReceipt`, `ApproveBooking`, `RejectBooking`):**
  - Lock rows with `SELECT ... FOR UPDATE`.
  - In `SubmitReceipt`: first handle idempotent replay (`status == 'pending_verification'` with matching `media_object_id` → `200 OK`); next check expiry (`status == 'expired' || (status == 'held' && now() > hold_expires_at)` → transition to `'expired'` if needed, commit, return `410 Gone` / `ErrHoldExpired`); only then require `status == 'held'` (returning `409 Conflict` for other states).
  - `ApproveBooking` requires `https://` `call_join_url`. `RejectBooking` requires non-empty `rejection_reason` and transitions `pending_verification → rejected`, immediately releasing the calendar slot.
- **Background Expiry Worker:** `ExpireStaleHolds` runs every `30s` using `SELECT id FROM booking.bookings WHERE status = 'held' AND hold_expires_at < now() FOR UPDATE SKIP LOCKED LIMIT 100`.
- **Strictly Post-Commit Side Effects:** Never hold database locks or open transactions while sending SMS, email, or external HTTP notifications. Fire notifications strictly after `COMMIT`.

---

## 5. Security, Auth, Receipt Upload & PII Redaction

- **Channel-Bound `booking_verify` OTP:**
  - 6-digit CSPRNG OTP stored as `HMAC-SHA256(OTP_PEPPER, code)`, `120s` TTL, max `5` attempts, protected by `RateLimiterPort`.
  - Bind **only** the OTP-verified channel (`phone_e164` for SMS OTP, `email` for Email OTP) onto `identity.users`. Never write unverified secondary contact fields onto `identity.users`.
- **Anti-Scraping & Call-Link Gating:**
  - **NEVER** expose `therapist_payment_accounts` in public catalog SSR/API responses or Steps 1–3; reveal only after `booking_verify` OTP + `held` booking creation.
  - **NEVER** include `call_join_url` (`https://` required) in any DTO unless `status IN ('confirmed', 'completed')`.
- **Same-Origin First-Party Cookies:** Caddy proxies `/api/v1/*` on every verified host so auth cookies remain first-party `HttpOnly; Secure; SameSite=Lax`.
- **Private S3 Receipt Uploads & Magic-Byte Validation:**
  - Receipts live strictly in the `private` S3 bucket (zero public ACLs).
  - Accept strictly `image/jpeg`, `image/png`, `image/webp` with `size_bytes <= 5242880` (`5 MiB`). **Zero SVG, HTML, or PDF uploads.**
  - `Confirm` MUST perform S3 `HeadObject` (`ContentLength <= 5 MiB`) and byte-range `GetObject (bytes=0-511)` magic-byte inspection (`FF D8 FF` JPEG, `89 50 4E 47 0D 0A 1A 0A` PNG, `RIFF....WEBP` WEBP). On mismatch, delete the S3 object immediately and return `422 Unprocessable Entity`.
  - Serve receipts strictly via `60`-second authenticated `GetObject` presigned URLs (`client_user_id` or owning `therapist_id` only).
- **Mandatory `slog` PII Redaction:** Go `slog` attribute replacer/middleware MUST redact `phone_e164`, `email`, card PANs, Sheba/IBANs, OTP codes, session tokens, and presigned S3 URLs from all logs.
- **No Hardcoded Secrets:** Never commit real passwords, API keys, peppers, or tokens to code, docs, `.env.example`, Dockerfiles, or manifests.

---

## 6. Persian-First B2C Design Tokens, RTL & 10 Banned Anti-Patterns

### Visual Direction ("Warm Editorial Sanctuary" — 90 / 8 / 2)
- **90% Neutral Canvas & Ink:** `#FAF8F5` (`--bg-canvas`), `#FFFFFF` (`--bg-surface`, flat `border border-border` with **zero drop shadows**), `#F2EFE9` (`--bg-subtle`), `#1F2927` (`--ink-primary`), `#475551` (`--ink-secondary`), `#5E6965` (`--ink-muted`).
- **8% Accent:** `#2D6A62` (`--accent-primary`), `#23554E` (`--accent-hover`), `#E6F0EE` (`--accent-tint`).
- **2% Semantic Status:** Strictly for booking states (`confirmed`, `pending`, `rejected`, `info`).

### RTL, Typography & Routing Rules
- **Logical CSS ONLY:** Use `ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `border-s`, `border-e`, `text-start`, `text-end`, and `rtl:rotate-180` on directional icons. **NEVER** use physical `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, or `text-right`.
- **LTR Isolation + `.tabular-nums`:** Wrap phone numbers, card PANs, Sheba/IBANs (`IR...`), USDT addresses, OTP codes, Gregorian calendars, Western time slots, and URLs in `dir="ltr"` with `.tabular-nums`.
- **Self-Hosted Fonts Only:** Load `Vazirmatn` (and optional `Peyda`) WOFF2 files via `next/font/local` from `frontend/public/fonts/`. **Zero external font CDNs.**
- **Strict Calendar Separation:** Track A (`داخل ایران`) = 100% pure Saturday-first Jalali calendar (`ش ی د س چ پ ج`); Track B (`خارج از ایران`) = 100% pure `dir="ltr"` Gregorian calendar + auto-detected IANA timezone + Tehran dual-time pill.
- **Canonical Routes & Host-Aware Links:**
  - Client portal route is strictly `/my-sessions` everywhere.
  - Use `tenantHref(path)` for all tenant-scoped links (`/<slug>/...` on `ravannama.ir`; root-relative `/...` on custom domains).
  - Next.js `middleware.ts` MUST block direct external `/tenants/*` requests with `404 Not Found`.

### Ten Explicit Banned Anti-Patterns (Zero Tolerance)
1. **NO External Font CDNs** (never `fonts.googleapis.com` or external font kits).
2. **NO WP Amelia Input Collisions** (never position flags/chevrons absolutely inside `<input>` padding).
3. **NO Hybrid Broken Calendars** (never render `آبان 2026`).
4. **NO Pre-Booking Signup Walls** (never require account/password before Step 3 OTP).
5. **NO Unauthenticated Payment-Account Scraping** (never expose payment accounts prior to `booking_verify` + `held` booking).
6. **NO PDF / SVG / HTML Receipt Uploads** (strictly `JPG`, `PNG`, `WEBP` `<= 5 MiB`).
7. **NO Competitor Cross-Selling on Therapist Pages** (opt-in directory lives strictly at `/therapists`).
8. **NO Heavy Drop Shadows on Flat Cards** (`bg-surface border border-border` only; shadows reserved for sticky bars/sheets/lightboxes).
9. **NO Physical Directional CSS** (`ml-`/`mr-`/`pl-`/`pr-`/`left-`/`right-`/`text-left`/`text-right`).
10. **NO Floating-Point Money or Un-Isolated LTR Codes**.

---

## 7. Mandatory Verification & Multi-Agent Quality Gates

Every milestone change MUST pass these exact checks before being considered complete:

1. **Backend Unit & Race Tests:**
   ```bash
   cd backend && go test -race ./...
   ```
2. **Backend PostgreSQL Concurrency Integration Tests:**
   ```bash
   cd backend && go test -race -tags=integration ./...
   ```
3. **Frontend Typecheck, Lint & Production Build:**
   ```bash
   cd frontend && npm run typecheck && npm run lint && npm run build
   ```
4. **Infrastructure Validation:**
   ```bash
   docker compose config -q
   ```
5. **Multi-Agent Review & Visual QA Gates:**
   - **Frontend UI/Routes:** `ui-ux-designer` → live `browser` capture at `390×844` (Mobile) & `1440×900` (Desktop) → `ui-ux-reviewer` (`pro`) `APPROVE`.
   - **All Engineering / Infra Outputs:** Mandatory `senior-reviewer` (`pro`) `APPROVE`.
   - **High-Risk Changes** (auth/OTP/sessions, concurrency/locks, money/ledger math, DB migrations): Mandatory `/opus-audit` independent audit.
6. **Git Safety:** Never run `git push`, `git checkout .`, or `git restore .` without explicit user permission.
