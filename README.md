# RavanNama (`روان‌نما`)

**RavanNama (`روان‌نما`)** is a Persian-first B2C psychology showcase, SEO blog, and dual-track online booking platform built for independent therapists and clinics serving both domestic clients in Iran and Iranian diaspora clients worldwide.

- **Track A (`داخل ایران` — Domestic Iran):** Pure Saturday-first Jalali calendar (`ش ی د س چ پ ج`), `Asia/Tehran` time slots, `IRT` (Toman) pricing, and `کارت‌به‌کارت` / Sheba manual transfer details revealed only after inline OTP verification.
- **Track B (`خارج از ایران` — Diaspora Abroad):** Pure `dir="ltr"` Gregorian calendar, auto-detected IANA timezone with a Tehran dual-time pill, `USD`/`EUR` pricing, and `PayPal` / `IBAN` / `USDT` payment instructions.
- **Zero-Gateway Receipt Verification:** 15-minute atomic slot holds (`EXCLUDE USING gist`) paired with strict `JPG`/`PNG`/`WEBP` (`<= 5 MiB`) private S3 receipt uploads (validated via `HeadObject` + `512`-byte magic-byte inspection) and 1-tap therapist approve/reject workflows.

---

## Project Status (Milestones)

See [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md) for the complete architecture, database schema, and execution roadmap.

- **Milestone 0 — Monorepo Scaffold & Guardrails (Complete):**
  - Repository constitution ([`AGENTS.md`](AGENTS.md)), `.gitignore`, and local development template ([`.env.example`](.env.example)).
  - Go 1.23+ modular monolith scaffold (`backend/cmd/api/main.go`, `internal/bootstrap/{app.go,test_app.go}`), strict `interfaces.go` seams across all 7 domains (`identity`, `tenant`, `scheduling`, `booking`, `media`, `content`, `assessment`), PII-redacting JSON `slog` logger, and `GET /healthz`, `GET /api/v1/health`, and `GET /internal/tls/allow`.
  - Reverse-proxy and container setup ([`deploy/Caddyfile`](deploy/Caddyfile), [`docker-compose.yml`](docker-compose.yml), `backend/Dockerfile`, `frontend/Dockerfile`).
- **Milestone 1 — Design System & Static Frontend Shell (Complete):**
  - "Warm Editorial Sanctuary" (`90/8/2`) design tokens in `frontend/src/app/globals.css`, self-hosted `Vazirmatn` WOFF2 fonts via `next/font/local` (zero external font CDNs), and logical RTL CSS utilities.
  - B2C landing (`/`), dedicated therapist landing (`/for-therapists`), opt-in directory (`/therapists`), therapist public catalog (`/<slug>`), distraction-free SEO blog (`/<slug>/blog` & `/<slug>/blog/<post>`), 4-step dual-track booking wizard (`/<slug>/book`), client session portal (`/my-sessions`), and therapist 3-tab dashboard (`/dashboard`) running on local fixtures (`frontend/src/lib/mock-data.ts`).
- **Milestones 2–4 — Backend Persistence, Full-Stack Wiring & Pilot Launch (Planned):**
  - PostgreSQL 16+ `goose` migrations (`btree_gist` / `EXCLUDE USING gist`), `sqlc` queries, and full Go domain service implementations + race/integration test suites.
  - S3/MinIO presigned receipt upload & magic-byte confirmation, full-stack `/api/v1/*` wiring in Next.js, custom-domain host resolution in `middleware.ts`, and end-to-end Docker Compose live browser QA.

---

## Architecture & Monorepo Layout

```mermaid
flowchart LR
    Client["Browser Client (Iran / Diaspora)"] --> Caddy["Caddy Edge Proxy (:80 / :443, on_demand_tls)"]
    Caddy -- "Blocks /internal/* (404)" --> Blocked["404 Not Found"]
    Caddy -- "GET /internal/tls/allow?domain=..." --> API["Go Modular Monolith (backend/cmd/api :8080)"]
    Caddy -- "Same-Origin /api/v1/* & /healthz" --> API
    Caddy -- "All Other Routes" --> Web["Next.js App Router (frontend :3000)"]
    API --> PG[("PostgreSQL 16+ (btree_gist, TSTZRANGE)")]
    API --> S3[("MinIO / S3 (ravannama-public & ravannama-private)")]
    Web -. "SSR / API Fetch (INTERNAL_API_URL)" .-> API
```

### Repository Structure

```text
ravanama/
├── AGENTS.md                        # Authoritative engineering & UI/UX constitution
├── README.md
├── .env.example                     # Non-secret local development defaults
├── .gitignore
├── docker-compose.yml               # Postgres 16 + pgsty/minio + Go API + Next.js + Caddy
├── deploy/
│   └── Caddyfile                    # on_demand_tls, /internal/* 404 block, same-origin /api/v1/* proxy
├── docs/
│   └── BLUEPRINT.md                 # Full product, UI/UX, DB schema & architecture blueprint
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── go.mod                       # Go 1.23+ module (github.com/ravannama/ravannama/backend)
│   ├── cmd/api/main.go              # Entrypoint: config, redacting logger, HTTP server & tickers
│   └── internal/
│       ├── bootstrap/
│       │   ├── app.go               # Production wiring + 30s hold-expiry / 5m cleanup tickers
│       │   └── test_app.go          # NewTestApp() in-memory test bootstrapper
│       ├── domain/
│       │   ├── identity/interfaces.go
│       │   ├── tenant/interfaces.go
│       │   ├── scheduling/interfaces.go
│       │   ├── booking/interfaces.go
│       │   ├── media/interfaces.go
│       │   ├── content/interfaces.go
│       │   └── assessment/interfaces.go   # Phase 3 scoring & license wallet seams
│       └── transport/http/
│           ├── router.go            # /healthz, /api/v1/health, /internal/tls/allow + panic/logging middleware
│           ├── router_test.go
│           └── internal_tls.go      # Caddy on_demand_tls domain verification handler
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── next.config.ts               # output: "standalone", poweredByHeader: false
    ├── package.json                 # Next.js 15, React 19, Tailwind CSS v4, TypeScript
    ├── public/
    │   └── fonts/vazirmatn/         # Self-hosted Vazirmatn WOFF2 weights (400/500/600/700)
    └── src/
        ├── middleware.ts            # Host-aware tenant rewrite & direct /tenants/* 404 guard
        ├── app/
        │   ├── globals.css          # Warm Editorial Sanctuary tokens & Tailwind v4 @theme
        │   ├── fonts.ts             # next/font/local Vazirmatn loader
        │   ├── layout.tsx           # Root <html lang="fa" dir="rtl"> shell
        │   ├── (platform)/
        │   │   ├── page.tsx         # B2C landing page (/)
        │   │   ├── for-therapists/page.tsx
        │   │   ├── therapists/page.tsx
        │   │   ├── my-sessions/page.tsx
        │   │   └── dashboard/page.tsx
        │   └── tenants/[slug]/
        │       ├── page.tsx         # Therapist public catalog (ISR 300s)
        │       ├── book/page.tsx    # 4-step dual-track booking wizard (force-dynamic)
        │       ├── blog/
        │       │   ├── page.tsx     # Therapist blog index (ISR 300s)
        │       │   └── [post]/page.tsx
        │       ├── sitemap.xml/route.ts
        │       └── robots.txt/route.ts
        ├── components/
        │   ├── booking/             # BookingWizard + inline OTP drawer & receipt dropzone
        │   ├── calendar/            # Pure JalaliCalendar (Track A) & GregorianCalendar (Track B)
        │   ├── dashboard/           # TherapistDashboardClient (3 tabs, receipt lightbox)
        │   ├── directory/           # TherapistsDirectoryClient
        │   ├── portal/              # MySessionsClient
        │   ├── tenant/              # MobileStickyBookingBar
        │   └── ui/                  # SiteHeader, SiteFooter, PhoneInput, SheetModal, StatusBadge, CopyField
        └── lib/
            ├── mock-data.ts         # Milestone 1 therapist, slot, session & dashboard fixtures
            ├── jalali.ts            # Jalali conversion & Persian numeral/currency formatters
            ├── tenant-href.ts       # Host-aware buildTenantHref helper
            ├── client-session.ts    # Client preview session storage helpers
            └── ics.ts               # .ics calendar export helper
```

---

## Quick Start

### Option 1: Full Docker Compose Stack

Copy the local development defaults and start all services (`postgres`, `minio`, `minio-init`, `api`, `web`, and `caddy`):

```bash
cp .env.example .env
docker compose up -d
```

> **MinIO Image Note:** `docker-compose.yml` uses `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` for both `minio` and `minio-init` (idempotently creating `ravannama-public` with `download` policy and `ravannama-private` with `none` policy) because the legacy `minio/minio` and `minio/mc` Docker Hub repositories are archived / return `401` anonymously.

All host ports bind strictly to loopback (`127.0.0.1`):

| Service | Loopback URL / Port | Purpose |
| :--- | :--- | :--- |
| **Caddy Edge Proxy** | `http://127.0.0.1:8088` | Unified local entry point (`/api/v1/*` → Go API, all else → Next.js) |
| **Next.js Frontend (`web`)** | `http://127.0.0.1:3000` | Next.js App Router standalone server |
| **Go API (`api`)** | `http://127.0.0.1:8080` | Go modular monolith HTTP API |
| **PostgreSQL 16 (`postgres`)** | `127.0.0.1:5432` | Primary database (`ravannama`) |
| **MinIO S3 API (`minio`)** | `http://127.0.0.1:9000` | S3-compatible object storage API |
| **MinIO Console (`minio`)** | `http://127.0.0.1:9001` | Local object storage admin UI |

### Option 2: Local Frontend Dev & Standalone Preview

Run the Next.js development server directly:

```bash
cd frontend
npm install
npm run dev
```

To test the production `output: "standalone"` build locally (`next.config.ts`):

```bash
cd frontend
npm run build
cp -r public .next/standalone/
cp -r .next/static .next/standalone/.next/
HOSTNAME=localhost PORT=3000 node .next/standalone/server.js
```

> Setting `HOSTNAME=localhost` ensures Next.js `NextURL` middleware rewrites match the incoming `initUrl` host when browsing `http://localhost:3000`.

### Option 3: Local Backend API

Run the Go API server directly (defaults to port `8080` and `PLATFORM_DOMAIN=ravannama.ir`):

```bash
cd backend
go run ./cmd/api
```

Currently implemented HTTP endpoints (Milestone 0):

| Method & Path | Description |
| :--- | :--- |
| `GET /healthz` | Container/liveness probe returning `200 OK` (`{"status":"ok"}`) |
| `GET /api/v1/health` | Same-origin API health check returning `200 OK` (`{"status":"ok"}`) |
| `GET /internal/tls/allow?domain=<host>` | Caddy `on_demand_tls` ask endpoint (blocked externally with `404` by Caddy; returns `200` for `ravannama.ir` / `www.ravannama.ir` or verified custom domains, `400` for invalid hosts, `403` otherwise) |

---

## Frontend Preview Routes & Demo Credentials

In Milestone 1, all frontend routes render against deterministic Persian/diaspora fixtures in `frontend/src/lib/mock-data.ts`:

| Route | Screen & Behavior |
| :--- | :--- |
| `/` | B2C Persian-first landing page & topic entry points |
| `/for-therapists` | Dedicated landing page for independent therapists and clinics |
| `/therapists` | Opt-in therapist directory (`directoryOptIn: true` only: `dr-sara-ahmadi`, `dr-kaveh-rezaei`, `dr-mina-farhadi`) |
| `/dr-sara-ahmadi` | Therapist public catalog (`dr-kaveh-rezaei`, `dr-mina-farhadi`, and direct-only `dr-omid-nikzad` are also available) |
| `/dr-sara-ahmadi/blog` | Therapist published SEO blog index (`ISR 300s`) |
| `/dr-sara-ahmadi/blog/act-for-daily-anxiety` | Long-form RTL SEO article with mobile collapsible & desktop sticky TOC |
| `/dr-sara-ahmadi/book` | 4-step dual-track booking wizard (Track A Jalali & Track B Gregorian/IANA, inline OTP, 15m hold, `JPG`/`PNG`/`WEBP` receipt dropzone) |
| `/my-sessions` | Client session portal (OTP gate, confirmed call link, rejected receipt `"رزرو و آپلود مجدد"` recovery, verified-only review form) |
| `/dashboard` | Therapist 3-tab dashboard (receipt queue with `100%`/`200%` zoom & `90°` rotate lightbox, weekly schedule + Jalali overrides, profile/payouts/blog editor) |
| `/tenants/*` | Blocked externally by `src/middleware.ts` — always returns `404 Not Found` |

- **Preview OTP Code:** Enter **`123456`** in both the `/<slug>/book` Step 3 inline OTP drawer and the `/my-sessions` login gate.

---

## Environment Variables

All local defaults below are non-secret placeholders defined in [`.env.example`](.env.example). Never commit real credentials or production secrets.

| Variable | Local Default (`.env.example`) | Description |
| :--- | :--- | :--- |
| `POSTGRES_USER` | `ravannama` | PostgreSQL container superuser/app user |
| `POSTGRES_PASSWORD` | `ravannama_local_dev_pw` | Local dev PostgreSQL password placeholder |
| `POSTGRES_DB` | `ravannama` | PostgreSQL database name |
| `POSTGRES_PORT` | `5432` | Loopback host port mapped to PostgreSQL |
| `DATABASE_URL` | `postgres://ravannama:ravannama_local_dev_pw@postgres:5432/ravannama?sslmode=disable` | PostgreSQL DSN passed to the Go `api` service |
| `MINIO_ROOT_USER` | `minioadmin` | Local dev MinIO root/access key |
| `MINIO_ROOT_PASSWORD` | `minioadmin_local_dev` | Local dev MinIO secret key placeholder |
| `MINIO_API_PORT` | `9000` | Loopback host port mapped to MinIO S3 API |
| `MINIO_CONSOLE_PORT` | `9001` | Loopback host port mapped to MinIO web console |
| `S3_ENDPOINT` | `http://minio:9000` | Internal S3 endpoint URL for the Go `api` service |
| `S3_REGION` | `ir-thr-at1` | S3 region identifier |
| `S3_PUBLIC_BUCKET` | `ravannama-public` | Public-read bucket for avatars & blog covers |
| `S3_PRIVATE_BUCKET` | `ravannama-private` | Private bucket (zero public ACL) for client payment receipts |
| `PLATFORM_DOMAIN` | `ravannama.ir` | Canonical platform hostname for tenant routing & TLS allowlist |
| `OTP_PEPPER` | `local-dev-otp-pepper-change-in-prod-32b` | Local dev HMAC-SHA256 OTP pepper placeholder |
| `API_PORT` | `8080` | Loopback host port mapped to Go `api` container port `8080` |
| `WEB_PORT` | `3000` | Loopback host port mapped to Next.js `web` container port `3000` |
| `CADDY_HTTP_PORT` | `8088` | Loopback host port mapped to Caddy HTTP port `80` |
| `CADDY_ASK_URL` | `http://api:8080/internal/tls/allow` | Caddy `on_demand_tls` domain verification ask URL |

> Note: Inside `docker-compose.yml`, the `api` container listens on internal `PORT="8080"` and `web` listens on `PORT="3000"` regardless of host port overrides. When running `backend/cmd/api` directly on the host, it also reads optional `PORT` (default `8080`) and `LOG_LEVEL` (`DEBUG`, `INFO`, `WARN`, `ERROR`).

---

## Verification, Testing & Engineering Guardrails

Run the workspace verification commands before submitting changes:

```bash
# Backend unit tests (with race detector) & static checks
cd backend && go test -race ./... && go vet ./...

# Backend PostgreSQL concurrency integration tests (Milestone 2+)
cd backend && go test -race -tags=integration ./...

# Frontend typecheck, lint & production build
cd frontend && npm run typecheck && npm run lint && npm run build

# Docker Compose manifest validation
docker compose config -q
```

All contributors and autonomous agents must adhere strictly to [`AGENTS.md`](AGENTS.md) and [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md), including:
- Unidirectional Go dependency inversion (`HTTP Handler → Domain Service Interface → Service → Outbound Port → Adapter`) with `NewTestApp()` in-memory unit tests.
- Exact `BIGINT` / `int64` integer money (`IRT` Toman, `USD`/`EUR` minor cents) and `commission_bps` (`0..10000`) with zero floating-point math.
- Logical RTL CSS utilities only (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`, `text-end`), `dir="ltr"` + `.tabular-nums` isolation for codes/numbers, self-hosted `Vazirmatn` fonts, and strict separation of Track A Jalali and Track B Gregorian calendars.
