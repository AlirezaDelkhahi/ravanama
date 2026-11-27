# RavanNama (`روان‌نما` / `IDEA-049`) — Complete Implementation-Ready Blueprint

> **Document Purpose:** Single source of truth for building **RavanNama (`روان‌نما`)** from scratch in a greenfield repository. Preserves every architectural invariant, PostgreSQL 16+ schema constraint, API/port contract, design token, RTL rule, screen specification, TDD test suite, and visual QA criterion.
>
> **Target Audience:** Founder + Autonomous Engineering & Design Agents (`ui-ux-designer`, `browser`, `ui-ux-reviewer`, `tdd-implementer`, `senior-reviewer`, `/opus-audit`).

---

## Table of Contents

1. [Section 1: Executive Vision, Market Context & 3-Phase Roadmap](#section-1-executive-vision-market-context--3-phase-roadmap)
2. [Section 2: B2C Persian-First Visual Art Direction & Complete Design Token System](#section-2-b2c-persian-first-visual-art-direction--complete-design-token-system)
3. [Section 3: Screen-by-Screen UI/UX Specifications (`390px` → `1440px`)](#section-3-screen-by-screen-uiux-specifications-390px--1440px)
4. [Section 4: Backend & Multi-Tenant System Architecture](#section-4-backend--multi-tenant-system-architecture)
5. [Section 5: Verification, TDD Test Matrix & Visual QA Checklist](#section-5-verification-tdd-test-matrix--visual-qa-checklist)
6. [Section 6: Agent Execution Playbook (Fresh Repo Implementation Guide)](#section-6-agent-execution-playbook-fresh-repo-implementation-guide)

---

## Section 1: Executive Vision, Market Context & 3-Phase Roadmap

### 1.1 Real-World Problems Observed in the Iranian & Diaspora Therapy Market

Field analysis of active Iranian psychology practices and clinics reveals severe operational friction across solo practitioners, multi-room clinics, and diaspora-serving therapists:

1. **Broken WordPress / WP Amelia Booking Flows (`shahravan.org` Pattern):**
   - **Severe RTL UI collisions:** Dropdown chevrons overlap Persian option text; country-code flags collide with `<input type="tel">` placeholders; date grids mix broken Jalali/Gregorian headers such as `آبان 2026`.
   - **Unstructured manual payments:** Card-to-card instructions (`کارت‌به‌کارت`) and diaspora instructions are crammed into raw, unformatted text blocks with no copy buttons, no temporary slot hold, and no verifiable receipt linkage.
   - **Dual-market pricing reality:** Solo therapists routinely serve both domestic clients in Iran (`۱,۲۰۰,۰۰۰ تومان` individual / `۱,۵۰۰,۰۰۰ تومان` couples) and Iranian diaspora clients abroad (`$30`–`$40` per session via PayPal, IBAN, or USDT), yet existing tools force separate sites or broken workarounds.
2. **Manual WhatsApp / Phone Reception Overhead (`cliniciraan.com` Pattern):**
   - Clinics and solo therapists lose hours daily coordinating slots manually over WhatsApp/Telegram/phone calls, chasing screenshots, and manually sending 24-hour session reminders.
3. **Clinic Commissions & Confidential Psychometric Tests (`psyteama.com` Pattern):**
   - Multi-therapist clinics calculate split commissions manually in spreadsheets.
   - Psychometric test portals leak scoring weights or lack strict B2B wholesale test-license accounting (`reserve` → `burn` → `refund`) with clinician-only normalized T-score profiles.

### 1.2 Competitive Positioning

| Competitor / Alternative | Pricing / Model | Fatal Gap vs. RavanNama (`روان‌نما`) |
| :--- | :--- | :--- |
| **Risloo (`ریسلو`)** | `۰ تومان` base, pay-per-test | Explicitly avoids brand showcase, custom domains, SEO blog, and online storefront/booking experience. |
| **Simorq Care (`سیمرغ‌کر`)** | `۵۹۰٬۰۰۰` تا `۱۳٬۱۴۰٬۰۰۰ تومان` monthly | Heavy clinical EMR back-office built for enterprise clinics; high fixed cost and zero lightweight diaspora dual-track UX. |
| **Doctoreto / Paziresh24** | Commission per booking | Marketplace aggregator that shows **competitor therapists** on a practitioner's profile page, leaking hard-earned personal brand traffic. |
| **WordPress + WP Amelia / Zhaket Kits** | Plugin licenses + brittle hosting | Broken RTL phone/calendar widgets, mixed `آبان 2026` dates, zero native `TSTZRANGE` concurrency locking, slow/vulnerable PHP stack. |
| **RavanNama (`روان‌نما`)** | **High-Trust Solo-First SaaS** | Zero-leakage custom-domain showcase + SEO blog + pure Jalali (Iran) & Gregorian/IANA (Abroad) dual-track booking + zero-gateway receipt verification + clean Phase 2/3 clinic & psychometric seams. |

### 1.3 Three-Phase Roadmap

#### Phase 1 (MVP — Build Now)
- **Solo Therapist Registration & Onboarding:** Mobile/Email OTP auth, unique slug (`ravannama.ir/<slug>`) with reserved-slug guard, optional custom domain (`CNAME` + automated Caddy `on_demand_tls`).
- **Public Catalog & SEO Blog:** Editorial therapist profile (`JSON-LD` `ProfessionalService`, Jalali resume timeline, verified-only client reflections, per-tenant `sitemap.xml` + `robots.txt`) and distraction-free Markdown SEO blog (`JSON-LD` `BlogPosting`).
- **Online-Only Weekly Schedule & Jalali Overrides:** Saturday-first weekly windows (`شنبه`–`جمعه`), session buffer minutes, and Jalali date overrides (holidays / custom hours).
- **Dual-Track Online Booking (Zero Gateway / Enamad Required):**
  - **Track A (داخل ایران):** `تومان` pricing, 100% pure Saturday-first Jalali calendar, `کارت‌به‌کارت` / Sheba destination revealed **only after** inline OTP verification (`booking_verify`) + 15-minute `held` slot creation.
  - **Track B (خارج از ایران):** `$` / `€` pricing, 100% pure Gregorian LTR calendar + auto-detected IANA timezone + Tehran dual-time pill, `PayPal` / `IBAN` / `USDT` destination revealed **only after** inline OTP verification + 15-minute `held` slot creation.
- **15-Minute Hold & Magic-Byte Receipt Upload:** Strict `JPG, PNG, WEBP` (`<= 5 MiB`, verified via S3 `HeadObject` + first `512` bytes magic-byte inspection; **zero SVG, HTML, or PDF uploads**).
- **Manual 1-Tap Therapist Approve / Reject:** Lightbox zoom/rotate receipt inspector, 1-tap approval with Google Meet / Skyroom `https://` link (`call_join_url` hidden until `confirmed`), or 1-tap rejection with reason that **immediately releases the calendar slot**.
- **Unified Client Portal (`/my-sessions`) & Opt-In Directory:** OTP-authenticated session history, call link access, rejected receipt 1-tap recovery (`"رزرو و آپلود مجدد"`), verified-only reviews, and an opt-in therapist directory (`/therapists`).

#### Phase 2 (Clinics & Automation — Schema & Interfaces Ready, Deferred)
- **Multi-Therapist `Clinic` (`many-to-many` `clinic_therapists`):** One therapist can run solo online consultations AND clinic in-person sessions simultaneously.
- **Receptionist Quick-Book (`clinic_cash`):** In-clinic desk booking with cash/POS mark-paid workflow.
- **Physical Room Conflict Prevention (`clinic_rooms`):** PostgreSQL `EXCLUDE USING gist` room-level double-booking guard.
- **Automated 24h SMS Reminders:** Transactional `scheduled_notifications` outbox polled by the in-process ticker worker.
- **Group Therapy & Events:** Atomic seat locking (`seats_taken < capacity`).
- **Online Gateway & Commission Ledger:** `PaymentGatewayPort` (ZarinPal / Zibal) + deterministic integer basis-point `CommissionLedgerPort` (zero floats).

#### Phase 3 (Psychometric Scoring Engine & Wholesale Licenses — Interfaces Ready, Deferred)
- **Black-Box Server-Side Scoring DSL (`Psyteama`-style):** Item weights, reverse-scoring rules, and normative tables stay strictly server-side and never touch the browser.
- **B2B Wholesale `LicenseWalletService`:** `reserve` on assessment link issuance → `burn` on submission → `refund` on expiration/revocation using `SELECT ... FOR UPDATE` + immutable append-only ledger.
- **Clinician-Only T-Score & Profile Visualization:** Protected clinical dashboard view for normalized scale profiles and interpretive flags.

---

## Section 2: B2C Persian-First Visual Art Direction & Complete Design Token System

### 2.1 Art Direction: "Warm Editorial Sanctuary"

Psychological care demands calm, warmth, and grounded human credibility — **never** sterile hospital neon-blue, aggressive SaaS purple gradients, or cluttered marketplace badges.

- **90 / 8 / 2 Color Budget:**
  - **90% Warm Stone, Linen & Charcoal Ink:** `#FAF8F5` canvas, `#FFFFFF` elevated editorial cards, `#F2EFE9` subtle inset bands, `#1F2927` deep warm charcoal ink.
  - **8% Botanical Sage-Teal Accent:** `#2D6A62` primary interactive actions, `#23554E` hover/pressed state, `#E6F0EE` calm active selection tint.
  - **2% Semantic Status Indicators:** Strictly reserved for booking states (`confirmed`, `pending`, `rejected`, `info`) — never decorative.

### 2.2 Complete CSS Custom Properties (`:root`) & WCAG 2.1 Contrast Verification

```css
:root {
  /* === Surfaces (Warm Stone & Linen) === */
  --bg-canvas: #FAF8F5;         /* Main page background */
  --bg-surface: #FFFFFF;        /* Primary content cards & sheets */
  --bg-subtle: #F2EFE9;         /* Trust strips, inset summaries, table headers */
  --bg-muted: #E7E2D8;          /* Disabled controls, skeleton base */

  /* === Inks (Warm Charcoal & Slate-Moss) === */
  --ink-primary: #1F2927;       /* Headings, body copy, critical numbers */
  --ink-secondary: #475551;     /* Labels, descriptions, metadata */
  --ink-muted: #5E6965;         /* Helper hints, secondary captions */

  /* === Borders (Flat Editorial Separation) === */
  --border-default: #E3DDD3;    /* 1px card & divider hairlines */
  --border-strong: #C5BDB0;     /* Input borders & hover states */

  /* === Brand Accent (Botanical Sage-Teal) === */
  --accent-primary: #2D6A62;    /* Primary CTA buttons, active focus rings */
  --accent-hover: #23554E;      /* Hover / active button state */
  --accent-tint: #E6F0EE;       /* Selected chip/slot fill, soft highlights */

  /* === Semantic Status Tokens === */
  --status-confirmed-bg: #E8F3EC;
  --status-confirmed-ink: #1F5E3B;
  --status-confirmed-border: #BBDAC7;

  --status-pending-bg: #FDF3E7;
  --status-pending-ink: #9A4D1A;
  --status-pending-border: #F0D1AE;

  --status-rejected-bg: #FBECEB;
  --status-rejected-ink: #9E2F2B;
  --status-rejected-border: #EBC2BF;

  --status-info-bg: #EDF2F7;
  --status-info-ink: #2E4D6B;
  --status-info-border: #C7D6E4;

  /* === Elevation (Strictly for Floating Layers — Never Flat Cards) === */
  --shadow-sticky: 0 -4px 20px rgba(31, 41, 39, 0.06);
  --shadow-popover: 0 12px 32px rgba(31, 41, 39, 0.10);
}
```

#### Verified WCAG 2.1 AA / AAA Contrast Ratios

| Foreground / Background Pair | Contrast Ratio | WCAG 2.1 Rating | Usage Rule |
| :--- | :--- | :--- | :--- |
| `#1F2927` (`--ink-primary`) on `#FAF8F5` | `13.6:1` | **AAA** | Primary prose, H1–H4, prices |
| `#1F2927` (`--ink-primary`) on `#FFFFFF` | `14.5:1` | **AAA** | Card headings, inputs, body copy |
| `#475551` (`--ink-secondary`) on `#FAF8F5` | `7.2:1` | **AAA** | Secondary descriptions, timestamps |
| `#5E6965` (`--ink-muted`) on `#FFFFFF` | `5.5:1` | **AA** | Helper hints, labels (`>= 14px`) |
| `#5E6965` (`--ink-muted`) on `#F2EFE9` | `4.8:1` | **AA** | Captions on subtle bands (`>= 14px`) |
| `#FFFFFF` on `#2D6A62` (`--accent-primary`) | `6.3:1` | **AA+ / AAA Large** | Primary CTA button text |
| `#FFFFFF` on `#23554E` (`--accent-hover`) | `8.4:1` | **AAA** | Hovered primary CTA text |
| `#1F5E3B` on `#E8F3EC` (`confirmed`) | `6.9:1` | **AA+** | Confirmed badges & alerts |
| `#9A4D1A` on `#FDF3E7` (`pending`) | `5.7:1` | **AA** | Pending verification badges & hold banners |
| `#9E2F2B` on `#FBECEB` (`rejected`) | `6.4:1` | **AA+** | Rejected receipt alerts & error banners |
| `#2E4D6B` on `#EDF2F7` (`info`) | `7.3:1` | **AAA** | Neutral info & timezone notices |

### 2.3 Tailwind v4 `@theme` Mapping, Spacing & Border Radii

```css
/* app/globals.css (Tailwind CSS v4 @theme) */
@import "tailwindcss";

@theme {
  --color-canvas: var(--bg-canvas);
  --color-surface: var(--bg-surface);
  --color-subtle: var(--bg-subtle);
  --color-muted-surface: var(--bg-muted);

  --color-ink: var(--ink-primary);
  --color-ink-secondary: var(--ink-secondary);
  --color-ink-muted: var(--ink-muted);

  --color-border: var(--border-default);
  --color-border-strong: var(--border-strong);

  --color-accent: var(--accent-primary);
  --color-accent-hover: var(--accent-hover);
  --color-accent-tint: var(--accent-tint);

  --color-status-confirmed-bg: var(--status-confirmed-bg);
  --color-status-confirmed-ink: var(--status-confirmed-ink);
  --color-status-confirmed-border: var(--status-confirmed-border);

  --color-status-pending-bg: var(--status-pending-bg);
  --color-status-pending-ink: var(--status-pending-ink);
  --color-status-pending-border: var(--status-pending-border);

  --color-status-rejected-bg: var(--status-rejected-bg);
  --color-status-rejected-ink: var(--status-rejected-ink);
  --color-status-rejected-border: var(--status-rejected-border);

  --color-status-info-bg: var(--status-info-bg);
  --color-status-info-ink: var(--status-info-ink);
  --color-status-info-border: var(--status-info-border);

  --font-sans: var(--font-vazirmatn), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-peyda), var(--font-vazirmatn), ui-sans-serif, sans-serif;
}
```

- **4px / 8px Spacing Rhythm:**
  - Card internal padding: `p-4 sm:p-6` (`16px` mobile / `24px` tablet+).
  - Section vertical rhythm: `py-8 lg:py-16` (`32px` mobile / `64px` desktop).
  - Page container max-width: `max-w-5xl mx-auto px-4 sm:px-6`.
  - Long-form SEO article prose width: `max-w-[65ch]`.
- **Border Radii:**
  - Major cards, modal/bottom sheets, alert banners: `rounded-2xl` (`16px`).
  - Inputs, buttons, slot buttons, sub-cards: `rounded-xl` (`12px`).
  - Specialty chips, status pills, avatars: `rounded-full`.
- **Flat Editorial Separation vs. Floating Overlays:**
  - Cards on `#FAF8F5` use `bg-surface border border-border` with **zero drop-shadows**.
  - Shadows (`--shadow-sticky`, `--shadow-popover`) are strictly reserved for sticky mobile footer bars, timezone sheets, OTP verification drawers, and lightbox modals.

### 2.4 Self-Hosted Persian Typography (`next/font/local`)

**Zero external Google Fonts CDNs** (frequently throttled or blocked behind Iranian ISPs/VPNs). Bundle WOFF2 files locally under `frontend/public/fonts/`.

```ts
// frontend/src/app/fonts.ts
import localFont from "next/font/local";

export const vazirmatn = localFont({
  src: [
    { path: "../../public/fonts/vazirmatn/Vazirmatn-Regular.woff2", weight: "400", style: "normal" },
    { path: "../../public/fonts/vazirmatn/Vazirmatn-Medium.woff2", weight: "500", style: "normal" },
    { path: "../../public/fonts/vazirmatn/Vazirmatn-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/vazirmatn/Vazirmatn-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-vazirmatn",
  display: "swap",
});

// Optional display font strictly for Therapist H1 / Editorial Titles
export const peyda = localFont({
  src: [
    { path: "../../public/fonts/peyda/Peyda-SemiBold.woff2", weight: "600", style: "normal" },
    { path: "../../public/fonts/peyda/Peyda-Bold.woff2", weight: "700", style: "normal" },
  ],
  variable: "--font-peyda",
  display: "swap",
});
```

#### Persian-Calibrated Type Scale & Line Heights

| Role | Size (Mobile → Desktop) | Weight | Line Height | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **Hero H1** | `26px` → `34px` | `700` | `1.4` | Optional `font-display` (`Peyda`) or `Vazirmatn` |
| **Section H2** | `20px` → `24px` | `600` | `1.45` | Never negative letter-spacing (`tracking-normal`) |
| **Card Title H3** | `17px` → `18px` | `600` | `1.5` | Clean single or 2-line wrap |
| **UI Body / Inputs** | `15px` → `16px` | `400` / `500` | `1.65` | Prevents iOS Safari auto-zoom (`>= 16px` on inputs!) |
| **Long-Form Blog Prose** | `17px` | `400` | `1.85` | Tall Persian ascenders/descenders require `1.85` |
| **Captions / Metadata** | `13px` → `14px` | `400` / `500` | `1.5` | Minimum `13px` for readable Persian diacritics |
| **Tabular Numbers** | Inherit | `500` / `600` | `1.4` | Mandatory `.tabular-nums` on prices, countdowns, slots, card PANs |

```css
.tabular-nums {
  font-variant-numeric: tabular-nums;
}
```

### 2.5 Ten Explicit Banned Anti-Patterns

1. **NO External Font CDNs:** Never load Google Fonts (`fonts.googleapis.com`) or external CSS font kits.
2. **NO WP Amelia Input Collisions:** Never position country flags or dropdown chevrons absolutely inside `<input>` padding where they overlap phone placeholders or Persian labels.
3. **NO Hybrid Broken Calendars:** Never render mixed strings like `آبان 2026`. Track A is 100% pure Saturday-first Jalali; Track B is 100% pure Gregorian (`dir="ltr"`).
4. **NO Pre-Booking Signup Walls:** Never force account registration or password creation before selecting a therapist, slot, and entering contact info.
5. **NO Unauthenticated Payment-Account Scraping:** Never expose card PANs, Sheba, PayPal, IBAN, or USDT wallet addresses publicly on Step 1–3; reveal only after inline OTP verification (`booking_verify`) + `held` booking creation.
6. **NO PDF / SVG / HTML Receipt Uploads:** Phase 1 accepts strictly `image/jpeg`, `image/png`, `image/webp` (`<= 5 MiB`). Reject all PDFs, SVGs, and executables both client-side and server-side (magic bytes).
7. **NO Competitor Cross-Selling on Therapist Pages:** Never display "similar therapists" on `/<slug>` or `/<slug>/book` (the opt-in directory lives strictly at `/therapists`).
8. **NO Heavy Drop Shadows on Flat Cards:** Never put `shadow-md`/`shadow-lg` on standard content cards (`bg-surface border border-border` only).
9. **NO Physical Directional CSS:** Never use `ml-`, `mr-`, `pl-`, `pr-`, `left-`, `right-`, `text-left`, `text-right` on layout/RTL components; always use logical utilities (`ms-`, `me-`, `ps-`, `pe-`, `start-`, `end-`, `text-start`, `text-end`).
10. **NO Floating-Point Money or Un-Isolated LTR Codes:** Never store money as `float`, and never render phone numbers, IBANs, card PANs, USDT addresses, or OTP codes without `dir="ltr"` + `.tabular-nums`.

---

## Section 3: Screen-by-Screen UI/UX Specifications (`390px` → `1440px`)

### 3.1 High-Level End-to-End Flow

```text
+----------------------------------------------------------------------------------+
| PUBLIC LANDING /<slug> (or Custom Domain)                                        |
|  - Header: Therapist Brand + "وبلاگ" + "پیگیری نوبت" (/my-sessions) + CTA        |
|  - Above-Fold: Portrait + Credentials + Trust Strip + "رزرو جلسه آنلاین"        |
+-----------------------------------------+----------------------------------------+
                                          |
                                          v
+----------------------------------------------------------------------------------+
| 4-STEP BOOKING WIZARD /<slug>/book                                               |
|                                                                                  |
|  [Step 1] Region ("داخل ایران" vs "خارج از ایران") & Session Type                |
|     |                                                                            |
|     v                                                                            |
|  [Step 2] Strict Calendar Separation                                             |
|     |-- Track A (Iran): Pure Saturday-First Jalali Grid + Tehran Slots           |
|     |-- Track B (Abroad): Pure LTR Gregorian Grid + IANA TZ + Dual-Time Pill     |
|     |                                                                            |
|     v                                                                            |
|  [Step 3] Client Details (Name, Collision-Free Phone, Email, Note, Policy)       |
|     |-- Click: "رزرو موقت ۱۵ دقیقه‌ای و ادامه به پرداخت"                        |
|     |-- Inline 6-Digit OTP Drawer (purpose='booking_verify')                     |
|     |     -> Verifies OTP -> Upserts Client -> Sets HttpOnly Session Cookie      |
|     |     -> POST /api/v1/bookings/hold (Idempotency-Key) -> Status: `held`      |
|     v                                                                            |
|  [Step 4] 15m Hold Countdown + Track A Card/Sheba OR Track B PayPal/IBAN/USDT    |
|     |-- Dropzone: "JPG, PNG, WEBP · حداکثر ۵ مگابایت" -> S3 Presign + Magic Confirm|
|     |-- Submit: "ثبت رسید و ارسال برای تایید درمانگر" -> Status: `pending_verification`
|     v                                                                            |
|  [Done] Calm Pending Screen + .ics Download + Link to /my-sessions               |
+-----------------------------------------+----------------------------------------+
                                          |
            +-----------------------------+-----------------------------+
            v                                                           v
+-----------------------------------+                     +-----------------------------------+
| THERAPIST DASHBOARD /dashboard    |                     | CLIENT PORTAL /my-sessions        |
|  - Tab 1: Pending Receipt Queue   |                     |  - Phone/Email OTP Login          |
|    - Lightbox Zoom (100%/200%/90°)|                     |  - Confirmed (Call Link visible)  |
|    - 1-Tap Approve + Call Link    |                     |  - Pending Verification           |
|    - 1-Tap Reject + Reason        |                     |  - Rejected (Shows reason + 1-tap |
|      (Immediately frees slot!)    |                     |    "رزرو و آپلود مجدد" -> /book)  |
|  - Tab 2: Weekly Schedule & Jalali|                     |  - Past History + Verified Review |
|  - Tab 3: Profile, Payouts & Blog |                     |  - Link to Opt-in /therapists     |
+-----------------------------------+                     +-----------------------------------+
```

### 3.2 Screen 1: Therapist Public Catalog (`/<slug>` or Custom Domain `/`)

> **Host-Aware Tenant Links (`tenantHref(path)`):** Every tenant-scoped link across Screens 1–5 (`tenantHref('/book')`, `tenantHref('/blog')`, `tenantHref('/blog/<post>')`) **must** be built via a host-aware helper: when served on a verified custom domain (`dr-example.ir`), it emits root-relative paths (`/book`, `/blog`, `/blog/<post>`); when served on the platform domain (`ravannama.ir`), it emits slug-prefixed paths (`/<slug>/book`, `/<slug>/blog`, `/<slug>/blog/<post>`).

- **Header (`64px` height, `bg-canvas/95 backdrop-blur border-b border-border`):**
  - Start: Therapist display name + subtle verified badge (`نظام روانشناسی`).
  - End: `"وبلاگ"` (links to `tenantHref('/blog')`), `"پیگیری نوبت"` (links strictly to `/my-sessions`), and desktop primary button `"رزرو جلسه"` (`min-h-[44px]`, links to `tenantHref('/book')`).
- **Mobile (`390px`) Layout:**
  - Single-column stack (`px-4 py-6 space-y-6 pb-28`).
  - **Above-fold Hero:** Circular `80px` portrait (`rounded-full object-cover border border-border`), H1 name (`26px`), subtitle (e.g., `روانشناس بالینی و زوج‌درمانگر`), license pill (`شماره پروانه: ...`), and immediate above-fold `"رزرو جلسه آنلاین"` CTA (`min-h-[48px] w-full rounded-xl bg-accent text-white`).
  - **Sticky Mobile Bottom Bar:** Appears below fold (`fixed bottom-0 inset-x-0 bg-surface border-t border-border px-4 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))] shadow-[var(--shadow-sticky)]`), showing starting fee + `"رزرو نوبت"` (`48px`).
- **Desktop (`1440px`) Layout:**
  - `max-w-5xl mx-auto py-12 grid grid-cols-12 gap-8`:
    - **Main Column (`col-span-12 lg:col-span-7`):** Hero bio, Trust Strip, Jalali Education/Resume Timeline, Approaches & Focus Chips, Optional Verified Reflections, Latest Blog Posts.
    - **Sticky Sidebar (`col-span-12 lg:col-span-5`):** Sticky Session Summary & Quick-Start Booking Card (`top-24 bg-surface border border-border rounded-2xl p-6`) displaying Track A (`داخل ایران`) & Track B (`خارج از ایران`) starting prices and primary `"انتخاب زمان و رزرو جلسه"` CTA.
- **Core Page Sections:**
  1. **3-Column Trust Strip (`bg-subtle rounded-2xl p-4 grid grid-cols-3 gap-3 text-center`):** Years of clinical experience (`۱۲ سال سابقه`), active license authority (`دارای پروانه سازمان نظام`), total sessions or dual-track badge (`ویزیت ایران و خارج از کشور`).
  2. **Jalali Education & Resume Timeline:** Vertical editorial line using `border-s-2 border-border ps-4 space-y-4`, displaying degree, university, and Jalali year range (`۱۳۹۵–۱۳۹۹`) with `.tabular-nums`.
  3. **Therapeutic Approaches & Focus Areas:** Concise approach paragraph + **maximum 8 monochrome focus chips** (`rounded-full bg-subtle border border-border text-ink-secondary px-3 py-1.5 text-sm`). No rainbow tags.
  4. **Optional Verified Reflections:** Shown only if therapist enables reviews and has `>= 1` published reflection from a `completed` booking; tagged `"مراجع تاییدشده"` (`status-confirmed` subtle badge).
  5. **Latest Blog Posts:** Up to 3 recent published SEO articles (`tenantHref('/blog/<post>')`) with Jalali publish date and reading time, plus `"مشاهده همه مقالات"` → `tenantHref('/blog')`.

### 3.3 Screen 2: SEO Blog Index (`/<slug>/blog`) & Article (`/<slug>/blog/<post>`)

- **Blog Index (`tenantHref('/blog')`, ISR `300s`):** Clean editorial grid of published therapist articles with Jalali dates, reading times, and soft profile/booking header.
- **Navigation Header:** Minimal back link (`"بازگشت به پروفایل درمانگر"` to `tenantHref('/')` with `rtl:rotate-180` arrow icon) + `"پیگیری نوبت"` (`/my-sessions`). **Zero newsletter popups, zero exit-intent modals, zero floating chat clutter.**
- **Mobile (`390px`) vs. Desktop (`1440px`):**
  - Mobile: Collapsible `<details>` Table of Contents (`"فهرست مطالب مقاله"`, `48px` tap target) above article body.
  - Desktop: Asymmetric `grid-cols-12` layout — `col-span-8` centered prose (`max-w-[65ch]`) + `col-span-4` sticky Table of Contents (`top-24`).
- **Typography & Metadata:**
  - H1 title (`24px` → `32px`), Jalali publish date (`۱۴ آذر ۱۴۰۵`), reading time (`۶ دقیقه مطالعه`), author mini-card linking to `tenantHref('/')`.
  - Body prose: `17px`, `leading-[1.85]`, generous paragraph spacing (`space-y-5`).
- **Soft Non-Intrusive CTAs:**
  - Inline editorial callout card at **~60% scroll depth** (`bg-subtle border border-border rounded-2xl p-5`) inviting reader to book an online consultation.
  - Bottom author bio + soft booking CTA + up to 3 related articles.

### 3.4 Screen 3: 4-Step Dual-Track Booking Wizard (`/<slug>/book`)

- **Layout Shell:**
  - **Desktop (`1440px`):** `grid-cols-12 gap-8` — `col-span-7` active wizard step + `col-span-5` sticky live summary card (`bg-surface border border-border rounded-2xl p-6`) displaying chosen region, session type, date/time, timezone, and total fee.
  - **Mobile (`390px`):** Compact collapsible top summary pill (`"خلاصه انتخاب شما"` with price & slot) + full-width step content + sticky bottom action bar (`min-h-[48px]` button + safe-area padding).
- **Step Progress Indicator:** Horizontal 4-step editorial bar (`۱. نوع جلسه` → `۲. انتخاب زمان` → `۳. اطلاعات و تایید` → `۴. پرداخت و رسید`) with `.tabular-nums`.

#### Step 1: Region (`داخل ایران` vs `خارج از ایران`) & Session Type
- **Region Segmented Toggle (`min-h-[52px]` per option):**
  - Option A: `داخل ایران (پرداخت ریالی · ساعت تهران)`
  - Option B: `خارج از ایران (پرداخت ارزی · ساعت محلی شما)`
- **Session Type Radio Cards (`rounded-2xl border p-4 cursor-pointer`, selected state: `border-accent bg-accent-tint`):**
  - Displays title (e.g., `مشاوره فردی آنلاین`, `زوج‌درمانی آنلاین`), duration (`۵۰ دقیقه`), description, and currency-matched price (`۱,۲۰۰,۰۰۰ تومان` for Track A or `$40` / `€38` for Track B) in `.tabular-nums`.

#### Step 2: Strict Calendar Separation & Time Slots
- **Track A (`داخل ایران`):**
  - **100% pure Saturday-first Jalali calendar grid** (`ش ی د س چ پ ج` header, Persian month/year e.g., `آذر ۱۴۰۵`, Persian numerals). **Zero English months, zero mixed `آبان 2026`.**
  - Slots displayed strictly in `Asia/Tehran` (`۱۶:۰۰`, `۱۷:۱۵`), each button `min-h-[44px] rounded-xl tabular-nums`.
- **Track B (`خارج از ایران`):**
  - **100% pure Gregorian calendar grid** wrapped in an explicit `<div dir="ltr">` container inside the RTL page (`Sun Mon Tue Wed Thu Fri Sat`, e.g., `December 2026`).
  - **Auto-Detected IANA Timezone Pill:** e.g., `Europe/Berlin (UTC+1)` with `"تغییر منطقه زمانی"` button opening a searchable timezone bottom-sheet/popover.
  - **Dual-Time Slot Pills (`min-h-[52px]`):** Primary local time in bold (`12:00` `dir="ltr"`) + secondary muted Tehran reference (`معادل ۱۴:۳۰ تهران`) so neither diaspora client nor therapist ever miscalculates DST shifts.

#### Step 3: Client Details & Mandatory Inline OTP Gate (`booking_verify`)
- **Fields (zero pre-signup/password wall):**
  1. **Full Name (`نام و نام خانوادگی`):** Required, `min-h-[48px] text-base`.
  2. **Collision-Free Flex Phone Input:**
     - Container: `flex items-stretch dir="ltr" rounded-xl border border-border-strong bg-surface focus-within:border-accent overflow-hidden`.
     - Separated country-code button (`shrink-0 flex items-center gap-1.5 px-3 bg-subtle border-e border-border min-h-[48px]`) displaying flag + dial code (`+98` default for Iran, country picker for Abroad) + chevron. **Zero absolute positioning over text.**
     - Separate `<input type="tel" inputMode="tel" className="flex-1 px-3 py-3 text-base tabular-nums outline-none" placeholder="912 345 6789" />`.
  3. **Email (`ایمیل`):** Optional for Track A (`داخل ایران`); **Required** for Track B (`خارج از ایران`, since SMS delivery to international numbers can be unreliable/costly — OTP goes via Email for Track B or SMS/Email choice).
  4. **Short Confidential Note (`توضیح کوتاه برای درمانگر — اختیاری`):** Optional textarea (`maxLength=500`).
  5. **Cancellation Policy Checkbox (`min-h-[44px]`):** `"قوانین لغو و تغییر زمان جلسه را مطالعه کردم و می‌پذیرم"` with a trigger opening the Cancellation Policy bottom-sheet/modal.
- **Primary CTA & Inline OTP Drawer Flow (Mandatory Security Gate):**
  - Clicking **`"رزرو موقت ۱۵ دقیقه‌ای و ادامه به پرداخت"`** validates fields first:
    - **Existing Verified Session Skip:** If the client already holds a valid `HttpOnly` session whose verified `phone_e164` or `email` matches the submitted primary contact (e.g., arriving via `/my-sessions` `"رزرو و آپلود مجدد"` or recovering from a `409`/`410`), the wizard skips re-OTP and executes `POST /api/v1/bookings/hold` directly.
    - **Unauthenticated or Changed Contact:** Opens the **Inline 6-Digit OTP Verification Drawer / Bottom-Sheet** (`purpose = 'booking_verify'`).
  - Drawer sends OTP to client's phone (Track A) or email (Track B), displays `120s` countdown + `"ارسال مجدد کد"` (`RateLimiterPort`), `dir="ltr"` 6-digit OTP input (`inputMode="numeric"`, `autocomplete="one-time-code"`, `.tabular-nums`).
  - **Upon OTP verification:** Backend atomically:
    1. Upserts/links lightweight `client` row in `identity.users` binding **only** the OTP-verified channel (`phone_e164` for SMS OTP, `email` for Email OTP); any unverified secondary phone/email entered on Step 3 is stored solely on the booking's contact metadata and never written to `identity.users`.
    2. Sets first-party `HttpOnly; Secure; SameSite=Lax` session cookie (`user_sessions`).
    3. Executes `POST /api/v1/bookings/hold` (with client-generated `Idempotency-Key`), creating a 15-minute `held` booking locked via PostgreSQL `EXCLUDE USING gist`.
    4. **Only then** advances wizard to Step 4 and returns the therapist's payment destination details (`anti-scraping` protection).

#### Step 4: 15-Minute Hold, Payment Instructions, Magic-Byte Receipt Upload & Pending Confirmation
- **15-Minute Hold Countdown Banner (`bg-status-pending-bg border border-status-pending-border text-status-pending-ink rounded-2xl p-4`):**
  - Live `.tabular-nums` timer (`۱۴:۵۹ باقی‌مانده تا حفظ نوبت`) showing exact hold expiry. If timer hits `00:00`, show calm expired state with 1-tap `"بررسی مجدد زمان‌های آزاد"` back to Step 2.
- **Payment Destination Block:**
  - **Track A (`داخل ایران`):** Structured card showing Bank Name, Account Holder Name, 16-digit Card PAN (`dir="ltr" tabular-nums`), and 24-digit Sheba (`IR...` `dir="ltr" tabular-nums`), each with a `44px` 1-tap `"کپی"` button + toast `"کپی شد"`.
  - **Track B (`خارج از ایران`):** Segmented tabs (`PayPal` | `IBAN` | `USDT`) showing enabled methods, `dir="ltr"` copyable account/wallet address, network label (e.g., `TRC-20` / `ERC-20`), exact amount (`$40` / `€38`), and a **Privacy Reference Code** (`RN-XXXX`) to paste in the transfer memo (never asking clients to put sensitive therapy notes on bank statements).
- **Receipt Upload Dropzone (`min-h-[140px] rounded-2xl border-2 border-dashed border-border-strong`):**
  - Exact helper text: **`JPG, PNG, WEBP · حداکثر ۵ مگابایت`** (strictly images; **no PDF/SVG/HTML**).
  - Client-side validation rejects invalid MIME types or files `> 5 MiB` immediately before requesting S3 presigned URL.
  - On valid file selection: shows image thumbnail preview + upload progress bar (`presign` → direct `PUT` to private S3 → `confirm` server-side magic-byte check) + `"حذف و انتخاب تصویر دیگر"` button.
- **Optional Tracking Code Input:** `"شماره پیگیری / مرجع تراکنش (اختیاری)"` (`dir="ltr" tabular-nums`).
- **Submit Button:** `"ثبت رسید و ارسال برای تایید درمانگر"` (`min-h-[48px] w-full bg-accent text-white`).
- **Post-Submit Calm `Pending Verification` Screen:**
  - Status badge `در انتظار تایید درمانگر` (`status-pending`), booking reference (`RN-XXXX`), therapist name, session date/time, `.ics` calendar file download button, and direct CTA **`"پیگیری وضعیت نوبت"`** → `/my-sessions`.

### 3.5 Screen 4: Therapist Dashboard (`/dashboard`)

- **3-Tab Navigation Shell (`min-h-[48px]` tabs; bottom/top segmented bar on mobile, top sub-nav on desktop):**
  1. `نوبت‌ها و تایید رسید` (Bookings & Receipt Verification — default tab with pending count badge)
  2. `برنامه هفتگی و مرخصی` (Weekly Schedule & Jalali Overrides)
  3. `پروفایل و وبلاگ` (Profile, Payment Accounts & SEO Blog)
- **Tab 1: Bookings & Receipt Verification Queue:**
  - Filter pills: `در انتظار تایید` (`pending_verification`), `تاییدشده` (`confirmed`), `تکمیل‌شده / گذشته`, `ردشده / لغوشده`.
  - **Pending Receipt Card:** Client name, masked/copyable phone/email, Track A/B badge, requested Jalali + local time, fee, transaction tracking code, and receipt thumbnail.
  - **Receipt Lightbox Zoom Modal:** Opens on thumbnail click; supports **`100%` / `200%` zoom toggle**, **90° rotation button** (for sideways mobile screenshots), pan/scroll, and close (`Esc` / `44px` close icon).
  - **1-Tap Approve Action (`"تایید و ارسال لینک جلسه"`):** Opens inline confirmation with prefilled therapist default Google Meet / Skyroom `https://` link (editable per session) → marks booking `confirmed` and notifies client.
  - **1-Tap Reject Action (`"رد رسید با دلیل"`):** Opens sheet with 1-tap preset reasons (`تصویر رسید ناخوانا است`, `مبلغ واریزی با تعرفه مطابقت ندارد`, `شماره کارت/حساب مقصد اشتباه است`, `تراکنش در حساب یافت نشد`) + optional custom text. Submitting transitions `pending_verification → rejected`, **immediately releasing the time slot** for other clients, and notifies the client with the exact reason.
- **Tab 2: Weekly Schedule & Jalali Overrides:**
  - **Weekly Grid (`شنبه` → `جمعه`):** Toggle day active/off, add multiple time windows (e.g., `۱۰:۰۰ تا ۱۳:۰۰`, `۱۶:۰۰ تا ۲۰:۰۰`), set session buffer (`۰` / `۱۰` / `۱۵` دقیقه) and minimum advance notice (`۲` / `۱۲` / `۲۴` ساعت).
  - **Jalali Date Overrides:** Pure Jalali date picker to mark full-day leave (`مرخصی روزانه`) or custom override hours for a specific Jalali date (e.g., `۱۴۰۵/۰۹/۲۵`).
- **Tab 3: Profile, Payment Accounts & SEO Blog Editor:**
  - Profile settings (display name, bio, license number, max 8 focus tags, Jalali education entries, opt-in `/therapists` directory toggle, custom domain `CNAME` verification widget, default Meet/Skyroom link).
  - Payment Accounts editor (Track A Card PAN / Sheba; Track B PayPal / IBAN / USDT).
  - **Distraction-Free SEO Blog Editor:** Title, URL slug, summary, Markdown editor + live RTL preview, cover image upload (`JPG/PNG/WEBP`), SEO meta title/description, Draft/Published toggle.

### 3.6 Screen 5: Client Session History Portal (`/my-sessions`)

- **Canonical Route:** Strictly `/my-sessions` across all links, headers (`"پیگیری نوبت"`), post-booking redirects, and Next.js `(platform)/my-sessions/page.tsx`.
- **OTP Auth Gate (if unauthenticated):**
  - Toggle between `شماره موبایل` (`dir="ltr"` flex phone input) and `ایمیل` (`dir="ltr"` email input).
  - 6-digit OTP input (`dir="ltr"`, `inputMode="numeric"`, `autocomplete="one-time-code"`, `.tabular-nums`).
- **Authenticated Portal Sections:**
  1. **Upcoming Sessions (`نوبت‌های پیش‌رو`):**
     - **`Confirmed` Card (`status-confirmed`):** Shows date/time (in client's track timezone), therapist name, `.ics` download, and prominent **`"ورود به جلسه آنلاین"`** button (`https://` `call_join_url`, strictly hidden in any earlier state).
     - **`Pending Verification` Card (`status-pending`):** Shows submitted time, booking ref `RN-XXXX`, and calm copy `"رسید شما در حال بررسی توسط درمانگر است"`.
     - **`Rejected` Card (`status-rejected`):** Displays the therapist's exact `rejection_reason` in a clear alert box + a **1-tap `"رزرو و آپلود مجدد"` CTA** linking to `tenantHref('/book?rebook=<booking_id>')` (`/<slug>/book?rebook=<booking_id>` on platform host or `/book?rebook=<booking_id>` on custom domain) pre-filled with the client's name, phone/email, and service context so the client can immediately pick the same slot (if still open) or nearest slot and upload a corrected receipt.
  2. **Past History (`جلسات گذشته`):**
     - Completed sessions with 1-tap **"ثبت بازخورد تاییدشده"** (verified-only review form, strictly unlocked when `status = 'completed'`).
  3. **Opt-In Directory Link:** Calm footer link to `/therapists` (`مشاهده فهرست درمانگران روان‌نما`).

### 3.7 RTL, Localization & Accessibility Rules

1. **Logical CSS Only:** Use `ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `border-s`, `border-e`, `text-start`, `text-end`. Directional icons (back arrows, step chevrons) MUST carry `rtl:rotate-180`.
2. **LTR Isolation + Tabular Numerals:** All phone numbers, IBANs, Sheba (`IR...`), 16-digit Card PANs, USDT addresses, Gregorian calendar grids, time slots (`12:00`), OTP codes, and URLs MUST render inside `dir="ltr"` with `.tabular-nums` so bidirectional text never scrambles digits or `+` prefixes.
3. **ZWNJ (`نیم‌فاصله`) & Numeral Consistency:**
   - Use proper Persian ZWNJ (`\u200c`) consistently in all UI copy (`روان‌نما`, `دقیقه‌ای`, `زوج‌درمانی`, `کارت‌به‌کارت`, `می‌شود`, `درخواست‌شده`).
   - Track A (`داخل ایران`) renders Persian digits (`۱,۲۰۰,۰۰۰ تومان`, `۱۴:۳۰`); Track B (`خارج از ایران`) uses Western digits inside `dir="ltr"` slots/amounts (`$40`, `12:00`, `2026-12-10`) while keeping surrounding Persian prose natural.
4. **WCAG 2.1 AA Compliance:**
   - Minimum `44px × 44px` tap targets on icon buttons/slots; `48px` height on all primary CTAs and form inputs (`text-base` / `16px` minimum on mobile inputs to prevent iOS Safari zoom).
   - Visible `2px` `--accent-primary` focus-visible rings with `2px` offset (`focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`).
   - Full keyboard navigation (`Tab`, `Escape` closes drawers/lightboxes, `aria-live="polite"` on OTP timers, slot availability updates, and upload status).

### 3.8 Complete State & Edge-Case Matrix

| Scenario / Edge Case | Expected UX & Visual Behavior |
| :--- | :--- |
| **Initial Loading / Route Transition** | Fixed-dimension skeleton placeholders (`bg-muted-surface animate-pulse rounded-xl`) matching final card heights so `CLS = 0`. |
| **Empty Day (No Available Slots)** | Calm empty card inside Step 2: `"در این تاریخ زمان خالی وجود ندارد"` + 1-tap **`"رفتن به نزدیک‌ترین زمان آزاد"`** button jumping straight to the next available date. |
| **Slot Taken During Checkout (`409 Conflict`)** | Inline status alert (`status-rejected`) on Step 3/OTP submit: `"این زمان لحظاتی پیش رزرو شد. لطفاً زمان دیگری انتخاب کنید"` + 1-tap return to Step 2 with form details preserved. |
| **15-Minute Hold Expired (`410 Gone`)** | Clear banner on Step 4 when timer reaches `00:00` or server returns `410`: `"مهلت ۱۵ دقیقه‌ای رزرو موقت به پایان رسید"` + 1-tap `"انتخاب مجدد زمان"` preserving client fields. |
| **Inline Field Validation Errors** | Field-level `status-rejected` border + `13px` Persian error text directly below the offending input (`aria-invalid="true"`, `aria-describedby`). Never lose form state. |
| **Receipt Upload Failure / Oversize / Invalid Format** | Reject non-JPG/PNG/WEBP or `> 5 MiB` immediately client-side (`"تنها تصاویر JPG، PNG یا WEBP با حجم حداکثر ۵ مگابایت مجاز است"`). On server magic-byte rejection or network drop, keep selected state and show 1-tap `"تلاش مجدد آپلود"`. |
| **Rejected Receipt Recovery** | `/my-sessions` card displays therapist `rejection_reason` + 1-tap `"رزرو و آپلود مجدد"` routing via `tenantHref('/book?rebook=<booking_id>')` (`/<slug>/book?rebook=<booking_id>` or `/book?rebook=<booking_id>` on custom domains) pre-filled with client name, phone/email, and service. |
| **Text & Number Overflow** | Long therapist names/blog titles wrap gracefully (`line-clamp-2` on directory cards, full wrap on profile); long IBAN/USDT strings use `break-all dir="ltr" font-mono text-sm` inside copy boxes so `390px` viewports never trigger horizontal scroll (`overflow-x: clip`). |

---

## Section 4: Backend & Multi-Tenant System Architecture

### 4.1 Proportionality Principle & Stack

No Kafka, no Redis cluster, no microservices split in Phase 1:

- **Backend:** Single **Go 1.23+ modular monolith** (`cmd/api`) with an **in-process background ticker worker** (`30s` stale-hold expiry sweep; `5m` cleanup/outbox sweep).
- **Database:** **PostgreSQL 16+** (`btree_gist` extension enabled, `pgx/v5`, `sqlc`, `goose` migrations).
- **Object Storage:** S3-compatible storage (ArvanCloud Object Storage in production, MinIO in local dev) split into `public` and `private` buckets.
- **Frontend:** **Next.js App Router** (TypeScript, Tailwind CSS v4, self-hosted `Vazirmatn`/`Peyda`).
- **Edge & TLS:** **Caddy** reverse proxy with `on_demand_tls` verifying custom therapist domains via `GET /internal/tls/allow`, routing **same-origin `/api/v1/*`** directly to the Go API across every verified domain.

### 4.2 Directory Trees & Strict Dependency Inversion

#### Go Backend (`backend/`)

```text
backend/
├── cmd/
│   └── api/
│       └── main.go                  # Entrypoint: config, DB pool, bootstrap, HTTP + ticker worker
├── internal/
│   ├── bootstrap/
│   │   ├── app.go                   # Wires Postgres/S3/SMS/Email adapters into domain services
│   │   └── test_app.go              # NewTestApp(): wires hand-written in-memory fakes (zero DB)
│   ├── domain/
│   │   ├── identity/
│   │   │   ├── interfaces.go        # AuthService interface, UserRepo/OTPRepo/RateLimiter/Notifier ports
│   │   │   ├── service.go           # OTP issue/verify, session cookies, booking_verify upsert
│   │   │   └── service_test.go
│   │   ├── tenant/
│   │   │   ├── interfaces.go        # TenantService interface, TherapistRepo/DomainRepo/TLSPort
│   │   │   ├── service.go           # Slug validation + reserved blocklist, profile, payment accounts, CNAME
│   │   │   └── service_test.go
│   │   ├── scheduling/
│   │   │   ├── interfaces.go        # SchedulingService interface, RuleRepo/OverrideRepo/OfferingRepo
│   │   │   ├── service.go           # Weekly rules, Jalali overrides, Tehran/IANA slot generation
│   │   │   └── service_test.go
│   │   ├── booking/
│   │   │   ├── interfaces.go        # BookingService interface, BookingRepo/TxManager/PaymentGatewayPort/CommissionLedgerPort
│   │   │   ├── service.go           # CreateHold, SubmitReceipt, Approve, Reject, ExpireStaleHolds
│   │   │   └── service_test.go
│   │   ├── media/
│   │   │   ├── interfaces.go        # MediaService interface, ObjectStoragePort/MediaRepo
│   │   │   ├── service.go           # Presign, HeadObject + 512B magic-byte Confirm, 60s signed GET
│   │   │   └── service_test.go
│   │   ├── content/
│   │   │   ├── interfaces.go        # ContentService interface, BlogRepo/ReviewRepo
│   │   │   ├── service.go           # SEO blog CRUD, verified-only completed booking reviews
│   │   │   └── service_test.go
│   │   └── assessment/              # Phase 3 interface stubs (empty concrete runtime in Phase 1)
│   │       └── interfaces.go        # BlackBoxScoringEngine, LicenseWalletService
│   ├── adapters/
│   │   ├── postgres/                # sqlc generated queries + repository implementations + TxManager
│   │   ├── storage/                 # S3 adapter (ArvanCloud / MinIO) with HeadObject + range-read
│   │   ├── notify/                  # Kavenegar/SMS adapter + SMTP/Resend email adapter + log fake
│   │   └── ratelimit/               # In-memory / Postgres token-bucket RateLimiterPort
│   └── transport/
│       └── http/
│           ├── router.go            # chi/stdlib router, Auth middleware, Tenant host middleware, slog redaction
│           ├── internal_tls.go      # GET /internal/tls/allow (Caddy ask endpoint)
│           └── handlers_*.go        # Thin JSON handlers calling ONLY domain interfaces
└── migrations/
    └── 00001_init.sql
```

**Mandatory Dependency-Inversion Rule:**
> `HTTP Handler` → `Domain Service Interface` (`interfaces.go`) → `Domain Service` (`service.go`) → `Outbound Port Interface` (`interfaces.go`) → `Adapter` (`adapters/*`).
> Domain services **NEVER** import `adapters/*`, another domain's internal structs, or `sqlc` types directly. Every cross-domain call goes strictly through the target domain's `interfaces.go` wired in `internal/bootstrap/`.

#### Next.js Frontend (`frontend/`)

```text
frontend/
├── public/
│   └── fonts/
│       ├── vazirmatn/*.woff2        # Self-hosted 400, 500, 600, 700
│       └── peyda/*.woff2            # Optional display H1
└── src/
    ├── middleware.ts                # Host-header multi-tenant rewrite (blocks direct /tenants/* -> 404; preserves /my-sessions, /dashboard, /api/v1)
    ├── app/
    │   ├── globals.css              # Design tokens (:root) + Tailwind v4 @theme + .tabular-nums
    │   ├── fonts.ts                 # next/font/local definitions
    │   ├── layout.tsx               # Root RTL shell (<html lang="fa" dir="rtl">)
    │   ├── (platform)/
    │   │   ├── page.tsx             # RavanNama landing / directory CTA
    │   │   ├── therapists/page.tsx  # Opt-in Therapist Directory
    │   │   ├── my-sessions/page.tsx # Unified Client Session History Portal (ONLY /my-sessions!)
    │   │   └── dashboard/page.tsx   # Therapist 3-Tab Dashboard
    │   └── tenants/                 # Routable internal target (direct external /tenants/* blocked by middleware -> 404)
    │       └── [slug]/
    │           ├── page.tsx         # Public Therapist Catalog (ISR 300s, JSON-LD ProfessionalService)
    │           ├── book/page.tsx    # 4-Step Dual-Track Booking Wizard (no-store live slots)
    │           ├── blog/
    │           │   ├── page.tsx     # Therapist Published Blog Index (ISR 300s)
    │           │   └── [post]/page.tsx # SEO Blog Article (ISR 300s, JSON-LD BlogPosting)
    │           ├── sitemap.xml/route.ts # Per-tenant XML sitemap
    │           └── robots.txt/route.ts  # Per-tenant robots.txt (disallows /book, /*/book, /my-sessions, /dashboard)
    ├── components/
    │   ├── ui/                      # Design-system primitives (Button, Card, Sheet, Lightbox, PhoneInput)
    │   ├── calendar/                # Pure JalaliCalendar (Track A) & Pure GregorianCalendar (Track B)
    │   └── booking/                 # Step 1–4 wizard, Inline OTP Drawer, Receipt Dropzone
    └── lib/
        ├── api.ts                   # Same-origin /api/v1/* typed client (forwards cookies automatically)
        ├── tenant-href.ts           # Host-aware tenantHref(path) -> /<slug>/... on platform vs /... on custom domains
        ├── jalali.ts                # Pure Jalali date formatting & Persian numeral helpers
        └── timezone.ts              # IANA detection & Tehran dual-time conversion
```

### 4.3 Full PostgreSQL 16+ Schema (`migrations/00001_init.sql`)

**Core Invariants:**
- **Primary Keys:** UUIDv7 (`gen_random_uuid()` fallback or app-generated UUIDv7 stored as `UUID`).
- **Money Representation:** Strictly `BIGINT` minor units / Toman (`price_amount`, `amount_expected`, `commission_bps` in basis points `0..10000`). **Zero floating-point columns anywhere.**
- **Concurrency Safety:** PostgreSQL `btree_gist` extension + `TSTZRANGE` `slot_range` + `EXCLUDE USING gist` prevents overlapping active bookings at the database engine level.

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ==========================================
-- 1. IDENTITY SCHEMA
-- ==========================================
CREATE SCHEMA IF NOT EXISTS identity;

CREATE TABLE identity.users (
    id            UUID PRIMARY KEY,
    role          TEXT NOT NULL CHECK (role IN ('client', 'therapist', 'admin')),
    full_name     TEXT NOT NULL,
    -- Identity Service Rule (booking_verify): bind ONLY the OTP-verified channel
    -- (`phone_e164` for SMS OTP, `email` for Email OTP) onto identity.users.
    -- Any unverified secondary email/phone entered on Step 3 is stored solely on
    -- booking/notification metadata (or verified separately) to prevent unique-key
    -- collisions or account hijacking.
    phone_e164    TEXT UNIQUE,
    email         TEXT UNIQUE,
    locale        TEXT NOT NULL DEFAULT 'fa-IR',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (phone_e164 IS NOT NULL OR email IS NOT NULL)
);

CREATE TABLE identity.otp_challenges (
    id            UUID PRIMARY KEY,
    destination   TEXT NOT NULL, -- normalized phone_e164 or lowercase email
    channel       TEXT NOT NULL CHECK (channel IN ('sms', 'email')),
    purpose       TEXT NOT NULL CHECK (purpose IN ('login', 'booking_verify')),
    code_hmac     TEXT NOT NULL, -- HMAC-SHA256(pepper, code)
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
    token_hash    TEXT NOT NULL UNIQUE, -- SHA-256 of opaque cookie token
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
                                'my-sessions', 'therapists', 'tenants', 'fonts',
                                'login', 'logout', 'auth', 'blog', 'assets',
                                'static', 'internal', 'health', 'sitemap', 'robots'
                            )),
    display_name            TEXT NOT NULL,
    headline                TEXT NOT NULL,
    bio_markdown            TEXT NOT NULL DEFAULT '',
    license_number          TEXT NOT NULL DEFAULT '',
    years_experience        SMALLINT NOT NULL DEFAULT 0 CHECK (years_experience >= 0),
    focus_tags              TEXT[] NOT NULL DEFAULT '{}' CHECK (cardinality(focus_tags) <= 8),
    education_timeline      JSONB NOT NULL DEFAULT '[]'::jsonb, -- [{degree, institution, start_jalali, end_jalali}]
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
    hostname      TEXT NOT NULL UNIQUE, -- lowercase punycode/ASCII host
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
    account_label    TEXT NOT NULL, -- e.g. "بانک سامان - به نام ..." or "USDT (TRC-20)"
    destination_val  TEXT NOT NULL, -- Never exposed prior to booking_verify + held booking
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
    price_amount    BIGINT NOT NULL CHECK (price_amount > 0), -- Toman for IRT; minor cents for USD/EUR
    is_active       BOOLEAN NOT NULL DEFAULT true,
    sort_order      SMALLINT NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_offerings_therapist ON scheduling.service_offerings (therapist_id, track, is_active);

CREATE TABLE scheduling.weekly_availability_rules (
    id              UUID PRIMARY KEY,
    therapist_id    UUID NOT NULL REFERENCES tenant.therapists(id) ON DELETE CASCADE,
    weekday_sat0    SMALLINT NOT NULL CHECK (weekday_sat0 BETWEEN 0 AND 6), -- 0=Shanbeh ... 6=Jomeh
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
    override_date   DATE NOT NULL, -- Stored as canonical Gregorian DATE; rendered Jalali in UI
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
    size_bytes    BIGINT NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880), -- <= 5 MiB
    status        TEXT NOT NULL CHECK (status IN ('pending_upload', 'confirmed', 'deleted')),
    sha256_hex    TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    confirmed_at  TIMESTAMPTZ
);

CREATE SCHEMA IF NOT EXISTS booking;

CREATE TABLE booking.bookings (
    id                   UUID PRIMARY KEY,
    reference_code       TEXT NOT NULL UNIQUE, -- e.g. RN-7F3A9C
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
    EXCLUDE USING gist (therapist_id WITH =, slot_range WITH &&)
        WHERE (status IN ('held', 'pending_verification', 'confirmed', 'completed'))
);

-- Fast partial index for 30s ticker Hold Expiry Sweep
CREATE INDEX idx_bookings_held_expires ON booking.bookings (hold_expires_at)
    WHERE status = 'held';

-- Fast therapist & client dashboard queries
CREATE INDEX idx_bookings_therapist_status ON booking.bookings (therapist_id, status, created_at DESC);
CREATE INDEX idx_bookings_client_created ON booking.bookings (client_user_id, created_at DESC);

-- Phase 2 Room Double-Booking Guard (activated when room_id IS NOT NULL)
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
    client_label  TEXT NOT NULL, -- e.g. "مراجع فردی · آذر ۱۴۰۵" (anonymized display)
    rating        SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment       TEXT NOT NULL,
    is_published  BOOLEAN NOT NULL DEFAULT false,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### 4.4 Booking & Manual-Receipt State Machine

```text
  [POST /api/v1/bookings/hold] (after inline OTP `booking_verify`)
                 |
                 v
           +-----------+
           |   held    |  (15-min TTL; holds slot in EXCLUDE USING gist)
           +-----+-----+
                 |
        +--------+------------------------+
        | (client uploads JPG/PNG/WEBP    | (15m TTL elapsed:
        |  before hold_expires_at)        |  30s worker FOR UPDATE SKIP LOCKED)
        v                                 v
+----------------------+            +-----------+
| pending_verification |            |  expired  | (slot immediately freed)
+----------+-----------+            +-----------+
           |
     +-----+------------------------------+
     | (therapist 1-tap Approve           | (therapist 1-tap Reject
     |  + https:// call_join_url)         |  + rejection_reason)
     v                                    v
+-----------+                       +-----------+
| confirmed |                       |  rejected | (slot immediately freed;
+-----+-----+                       +-----------+  /my-sessions shows reason +
      |                                            1-tap "رزرو و آپلود مجدد")
      +------------------+
      | (session ended)  | (cancelled per policy)
      v                  v
+-----------+      +-----------+
| completed |      | cancelled | (slot freed if future)
+-----------+      +-----------+
```

#### Concurrency, Locking & Idempotency Rules

1. **`CreateHold` (`POST /api/v1/bookings/hold`):**
   - Requires verified client session (set by inline `booking_verify` OTP or valid matching session) and non-empty `Idempotency-Key` header.
   - First checks `(client_user_id, idempotency_key)` inside transaction; if found, returns existing booking idempotently.
   - Acquires **`pg_advisory_xact_lock(hashtextextended(client_user_id::text, 0))`** to enforce a **slot-hoarding guard** (e.g., max `2` active `held` bookings per client per therapist, preventing a malicious user from locking an entire therapist calendar).
   - Inserts `bookings` row with `status = 'held'`, `hold_expires_at = now() + interval '15 minutes'`.
   - Catches PostgreSQL **`SQLSTATE 23P01`** (`exclusion_violation` from `EXCLUDE USING gist`) and maps cleanly to HTTP **`409 Conflict`**.
   - Returns payment destinations (`therapist_payment_accounts`) strictly inside this authenticated hold response / `GET /bookings/{id}` for the owning client.
2. **`SubmitReceipt` (`POST /api/v1/bookings/{id}/receipt`):**
   - Inside transaction, locks booking row with **`SELECT ... FROM booking.bookings WHERE id = $1 FOR UPDATE`**.
   - Verifies `client_user_id == session.UserID`.
   - **First**, checks idempotent replay: if `status == 'pending_verification'` and the existing `booking_receipts.media_object_id` matches the request's `media_object_id`, returns **`200 OK`** idempotently.
   - **Next**, checks hold expiry: `if status == 'expired' || (status == 'held' && now() > hold_expires_at)` — if still `'held'`, transitions status to `'expired'`, inserts `booking_status_events`, commits, and returns HTTP **`410 Gone`** (`ErrHoldExpired`). Checking `'expired'` before generic status checks guarantees `410 Gone` even when the `ExpireStaleHolds` ticker wins the race!
   - **Only then** verifies `status == 'held'` (returning **`409 Conflict`** for other terminal states such as `'confirmed'`, `'rejected'`, or `'cancelled'`), and verifies `media_object` belongs to the client with `status == 'confirmed'`.
   - Inserts `booking_receipts`, transitions `held → pending_verification`, appends `booking_status_events`, commits, and fires **post-commit** therapist notification (never holding DB locks during external SMS/Email I/O).
3. **`ApproveBooking` & `RejectBooking`:**
   - Lock row with **`FOR UPDATE`**, verify `therapist_id` ownership and `status == 'pending_verification'`.
   - `ApproveBooking`: Validates `call_join_url` starts with `https://`, transitions `pending_verification → confirmed`, logs event, sends **post-commit** confirmation + `call_join_url` to client.
   - `RejectBooking`: Requires non-empty `rejection_reason`, transitions `pending_verification → rejected` (automatically dropping out of the `EXCLUDE USING gist` partial index so the **slot is freed immediately**), logs event, sends **post-commit** rejection alert with link to `/my-sessions`.
4. **`ExpireStaleHolds` (In-Process Worker every `30s`):**
   - Runs `SELECT id FROM booking.bookings WHERE status = 'held' AND hold_expires_at < now() FOR UPDATE SKIP LOCKED LIMIT 100`, updates them to `'expired'`, and inserts `booking_status_events` audit rows.

### 4.5 Custom-Domain Multi-Tenant Routing, Same-Origin Cookies & SEO

- **Caddy `on_demand_tls`:**
  - `deploy/Caddyfile` configures `on_demand_tls` with `ask http://api:8080/internal/tls/allow`.
  - `GET /internal/tls/allow?domain=dr-example.ir` returns `200 OK` **only** if `domain` is `ravannama.ir` (and platform subdomains) or a `verified` row in `tenant.tenant_domains`. Prevents arbitrary certificate-issuance abuse.
- **Same-Origin `/api/v1/*` Proxy Across ALL Verified Domains:**
  - Caddy routes `/api/v1/*` on **every** host (`ravannama.ir/api/v1/*` AND `customdomain.ir/api/v1/*`) directly to the Go backend!
  - Because browser API calls stay strictly same-origin, first-party `HttpOnly; Secure; SameSite=Lax` session cookies work natively on custom domains without third-party cookie blocking in Safari/Chrome.
- **Next.js `middleware.ts` Host & Path Routing:**
  - **Direct `/tenants/*` Guard:** Any external request starting with `/tenants/` is immediately blocked with **`404 Not Found`** so internal Next.js App Router target paths are never directly addressable.
  - Paths starting with `/api/`, `/_next/`, `/fonts/`, `/my-sessions`, `/dashboard`, `/therapists` stay directly on `(platform)` routes even on custom domains (`/my-sessions` works on both `ravannama.ir/my-sessions` and `<custom-domain>/my-sessions` seamlessly via same-origin cookies).
  - Requests to `ravannama.ir/<slug>/...` (when `<slug>` is not a reserved platform route) and requests to verified custom domains (`dr-example.ir/...` → resolved via cached `Host` lookup to `<slug>`) internally rewrite to **`/tenants/<slug>/...`** (and inject `x-tenant-mode: custom | platform` + `x-tenant-slug` headers for `tenantHref(path)`).
- **Host-Aware Links, Canonical URLs, ISR & Structured Data:**
  - `tenantHref(path)` generates `/book`, `/blog`, `/blog/<post>` on custom domains vs. `/<slug>/book`, `/<slug>/blog`, `/<slug>/blog/<post>` on `ravannama.ir`.
  - Every public catalog (`/<slug>`), blog index (`/<slug>/blog`), and blog post (`/<slug>/blog/<post>`) emits `<link rel="canonical" href="https://<primary_verified_host>/...">` (preventing duplicate-content penalties between `ravannama.ir/<slug>` and `dr-example.ir`).
  - Public catalog, blog index, and blog article pages use **ISR (`revalidate: 300`)**; live slot availability & `/<slug>/book` (or `/book` on custom domains) use **`cache: 'no-store'`**.
  - Emit Schema.org JSON-LD: `ProfessionalService` + `Person` on therapist catalog; `BlogPosting` on articles.
  - Serve dynamic per-tenant `/sitemap.xml` and `/robots.txt` (`Disallow: /book`, `Disallow: /*/book`, `Disallow: /my-sessions`, `Disallow: /dashboard`).

### 4.6 Security, Receipt Upload & PII Hygiene

1. **Separated S3 Buckets (`public` vs `private`):**
   - Therapist avatars & blog covers live in `public` bucket (CDN-cacheable).
   - Client payment receipts live strictly in **`private`** bucket (zero public ACL, zero public URLs).
2. **2-Step Magic-Byte Verified Receipt Upload (`JPG/PNG/WEBP <= 5 MiB`):**
   - `POST /api/v1/media/receipts/presign`: Requires authenticated client with an active `held` booking; accepts only `image/jpeg`, `image/png`, `image/webp` and `size_bytes <= 5242880`; creates `media_objects` row (`pending_upload`) and issues a `5`-minute `PUT` presigned URL with exact `Content-Type` and `Content-Length` constraints.
   - `POST /api/v1/media/receipts/confirm`: Calls S3 `HeadObject` (verifies `ContentLength <= 5 MiB`) and S3 byte-range `GetObject (bytes=0-511)` to inspect **actual magic bytes**:
     - JPEG: `FF D8 FF`
     - PNG: `89 50 4E 47 0D 0A 1A 0A`
     - WEBP: `RIFF....WEBP` (`52 49 46 46` at offset 0 and `57 45 42 50` at offset 8)
   - Any mismatch (including disguised SVG, HTML, PDF, or polyglot files) deletes the S3 object immediately and returns `422 Unprocessable Entity`.
3. **60-Second Authorized Signed Viewing URL:**
   - `GET /api/v1/bookings/{id}/receipt-url`: Verifies caller is either the booking's `client_user_id` or the owning `therapist_id` and mints a **`60`-second** S3 `GetObject` presigned URL. Never cached.
4. **Payment Destination Anti-Scraping & Call Link Gating:**
   - `therapist_payment_accounts` are **never** exposed in public catalog SSR/API responses; returned strictly after inline `booking_verify` OTP + `held` booking creation.
   - `call_join_url` (`https://`-validated) is stripped from all booking DTOs unless `status IN ('confirmed', 'completed')`.
5. **OTP Cryptography & `slog` PII Redaction:**
   - 6-digit CSPRNG OTP stored as `HMAC-SHA256(server_pepper, code)`, `120s` expiry, max `5` verification attempts, protected by `RateLimiterPort` (per destination + per IP).
   - Go `slog` middleware/attr replacer **must redact** `phone_e164`, `email`, card PANs, Sheba/IBANs, OTP codes, session tokens, and presigned S3 URLs from all logs.

### 4.7 Concrete Phase 2 & Phase 3 Extension Seams

- **Phase 2 Seams (Already Built Into Schema & Interfaces):**
  - `booking.bookings.clinic_id`, `room_id`, `excl_bookings_room_slot`, `payment_source`, and `commission_bps` are already modeled in `00001_init.sql`.
  - `PaymentGatewayPort` (ZarinPal/Zibal redirect + callback verification) and `CommissionLedgerPort` (deterministic integer basis-point split calculation) live in `internal/domain/booking/interfaces.go`.
  - `tenant.clinics`, `clinic_therapists`, `clinic_rooms` tables enable seamless onboarding of multi-therapist clinics without migrating solo therapists' existing rows.
  - `scheduled_notifications` outbox table (added in Phase 2 migration) uses the existing in-process ticker worker to send 24h reminders.
- **Phase 3 Seams (`internal/domain/assessment/interfaces.go`):**
  - `BlackBoxScoringEngine`: Takes `(assessment_id, raw_answers)` server-side, loads confidential scoring keys/norm tables strictly inside backend memory, returns clinician-only normalized T-scores and flags. Never exposes weights or formulas via HTTP/JSON.
  - `LicenseWalletService`: Manages clinic/therapist B2B test-credit balances (`reserve` on link generation → `burn` on completion → `refund` on expiry/revoke) inside `SELECT ... FOR UPDATE` DB transactions backed by an immutable ledger.

---

## Section 5: Verification, TDD Test Matrix & Visual QA Checklist

### 5.1 Go Domain Service Unit Tests (12 Suites — `bootstrap.NewTestApp`, Zero DB Models)

All unit tests run fast in-memory via `bootstrap.NewTestApp()` using hand-written fakes implementing `interfaces.go` ports:

1. `identity/service_test.go`:
   - `TestIssueAndVerifyOTP_SuccessAndExpiry`: Verifies HMAC comparison, `120s` TTL expiration, and single-use consumption (`consumed_at`).
   - `TestVerifyOTP_MaxAttemptsAndRateLimit`: Locks challenge after `5` wrong guesses and enforces `RateLimiterPort`.
   - `TestBookingVerifyOTP_UpsertsClientAndSetsSession`: Verifies lightweight client upsert (phone or email) and session creation without duplicate users.
2. `tenant/service_test.go`:
   - `TestSlugValidationAndReservedBlocklist`: Rejects `my-sessions`, `dashboard`, `api`, `therapists`, `tenants`, `fonts`, uppercase, or invalid lengths; accepts valid slugs.
   - `TestCustomDomainVerificationAndPrimaryUniqueness`: Verifies TXT check and ensures only one primary verified domain per therapist.
3. `scheduling/service_test.go`:
   - `TestGenerateSlots_WeeklyRulesBuffersAndMinNotice`: Respects Saturday-first rules, buffer minutes, min advance notice, and excludes active bookings.
   - `TestGenerateSlots_JalaliOverrideClosedAndCustomHours`: Full-day closure hides all slots; partial override replaces regular window; Track B returns dual Tehran + client IANA timestamps.
4. `booking/service_test.go`:
   - `TestCreateHold_IdempotencyAndHoardingGuard`: Replaying same `Idempotency-Key` returns original hold; exceeds max concurrent holds returns `429`/`422`.
   - `TestSubmitReceipt_TransitionsToPendingOr410IfExpired`: Valid receipt moves `held → pending_verification`; idempotent replay returns `200 OK`; both `held` past `hold_expires_at` AND already-`expired` rows return `410 Gone` (`ErrHoldExpired`); terminal `'confirmed'`/`'rejected'` return `409 Conflict`.
   - `TestApproveAndRejectBooking_StateAndSlotRelease`: Approve requires `https://` `call_join_url`; Reject requires non-empty `rejection_reason`, clears hold/active lock, and fires post-commit notification.
   - `TestExpireStaleHolds_SweepsOnlyExpiredHeldRows`: Leaves `pending_verification` and unexpired `held` rows untouched.
5. `media/service_test.go` + `content/service_test.go`:
   - `TestConfirmReceipt_MagicBytesAcceptsJpgPngWebp_RejectsSvgPdfHtml`: Validates exact `512`-byte signatures (`JPEG`, `PNG`, `WEBP`) and deletes disguised `PDF`/`SVG`/`HTML` objects.
   - `TestCreateReview_RequiresCompletedBooking`: Blocks reviews for `held`, `pending_verification`, `confirmed`, or `rejected` bookings; allows single review strictly on `completed`.

### 5.2 PostgreSQL Concurrency & Integration Tests (`//go:build integration`)

Executed against a real PostgreSQL 16+ container (`docker-compose.yml`):

1. **`TestConcurrentCreateHold_GistExclusion23P01`:** Two goroutines race on `CreateHold` for the exact same `therapist_id` and overlapping `slot_range` with different `Idempotency-Key`s → exactly **one** succeeds (`201`) and **one** fails cleanly with `409 Conflict` (`SQLSTATE 23P01`).
2. **`TestConcurrentSubmitReceiptVsExpireStaleHolds`:** Races `SubmitReceipt` against `ExpireStaleHolds` near `hold_expires_at` → verifies `FOR UPDATE` / `SKIP LOCKED` produces zero inconsistent states (either `pending_verification` with receipt OR `expired` with `410 Gone`, never both).
3. **`TestRejectedBookingFreesSlotForImmediateRebook`:** Creates hold → submits receipt → therapist rejects (`status = 'rejected'`) → verifies a new `CreateHold` on the exact same `slot_range` succeeds immediately without `23P01` violation.

### 5.3 Next.js Routing, Auth-Cookie & SEO Tests

1. **`middleware.test.ts`:** Verifies `ravannama.ir/<slug>` rewrites to `/tenants/<slug>`, custom domain `dr-example.ir/` rewrites to `/tenants/<slug>`, direct external `/tenants/*` requests return `404`, and `/my-sessions`, `/dashboard`, `/therapists`, `/fonts/*`, `/api/v1/*` never get hijacked as therapist slugs.
2. **`auth-cookie-proxy.test.ts`:** Verifies client booking flow triggers same-origin `/api/v1/*` calls on both platform and custom domain hosts so `HttpOnly; SameSite=Lax` cookies persist for `/my-sessions`.
3. **`seo-metadata.test.ts`:** Verifies `<link rel="canonical">` points to primary verified host, valid `ProfessionalService` & `BlogPosting` JSON-LD scripts, `tenantHref(...)` host-aware URLs, and per-tenant `sitemap.xml` / `robots.txt` (`Disallow: /book`, `Disallow: /*/book`, `Disallow: /my-sessions`, `Disallow: /dashboard`) rules.

### 5.4 Live Browser (`390×844` & `1440×900`) & `ui-ux-reviewer` Visual QA Checklist

Every route below **must** be opened in a headless/live browser (`browser` agent), exercised end-to-end, and visually audited at both **`390×844` (Mobile)** and **`1440×900` (Desktop)** by `ui-ux-reviewer` (`pro`):

| Route | Critical Visual & Functional Pass Criteria |
| :--- | :--- |
| **1. `/<slug>` (Catalog)** | Above-fold mobile hero + CTA visible without scrolling; zero horizontal overflow (`scrollWidth <= clientWidth`); `Vazirmatn` loaded locally (zero network calls to Google Fonts); header `"پیگیری نوبت"` points to `/my-sessions`; `tenantHref('/blog')` & `tenantHref('/book')` work on both platform and custom domains; max 8 monochrome focus chips; sticky mobile CTA clears iOS safe area. |
| **2. `/<slug>/blog` & `/<slug>/blog/<post>`** | Blog index lists published articles; article shows mobile collapsible TOC + desktop sticky TOC; `<= 65ch` prose width with `1.85` line height; zero popups; inline CTA at 60% scroll + bottom; `rtl:rotate-180` back arrow. |
| **3. `/<slug>/book` (Wizard)** | Step 2 Track A = 100% pure Saturday-first Jalali (`آذر ۱۴۰۵`, zero `آبان 2026`); Step 2 Track B = 100% pure Gregorian `dir="ltr"` grid + IANA pill + Tehran dual-time pill; Step 3 phone input has zero flag/chevron/placeholder overlap; Step 3 CTA opens inline `booking_verify` OTP drawer BEFORE Step 4 payment reveal (or skips OTP if matching verified session); Step 4 shows `JPG, PNG, WEBP · حداکثر ۵ مگابایت` (zero PDF) + 15m countdown + copyable Track A/B accounts. |
| **4. `/dashboard` (Therapist)** | 3 tabs usable at `390px` & `1440px`; receipt lightbox opens with working `100%`/`200%` zoom + `90°` rotate; 1-tap approve (`https://` link) & 1-tap reject with reason; weekly schedule (`شنبه`–`جمعه`) & Jalali override date picker. |
| **5. `/my-sessions` (Client Portal)** | Accessible via `/my-sessions` everywhere; OTP login with `autocomplete="one-time-code"`; Confirmed card displays `https://` call link; Rejected card displays `rejection_reason` + 1-tap `"رزرو و آپلود مجدد"` pre-filling `tenantHref('/book?rebook=<booking_id>')`. |
| **6. `/therapists` (Opt-In Directory)** | Responsive grid of `directory_opt_in = true` therapists only; clean monochrome cards with flat editorial borders (`--border-default`), zero clutter, linking cleanly to `/<slug>`. |

---

## Section 6: Agent Execution Playbook (Fresh Repo Implementation Guide)

Follow this exact sequence in the new repository:

### Milestone 0: Monorepo Scaffold & Guardrails
1. Create directory layout: `backend/`, `frontend/`, `deploy/Caddyfile`, `docker-compose.yml` (PostgreSQL 16 + MinIO + Go API + Next.js).
2. Create repository `AGENTS.md` enforcing:
   - Strict Go `interfaces.go` dependency inversion (`Handler → Domain Service Interface → Service → Outbound Port → Adapter`).
   - Integer `BIGINT` money & `bps` splits only (zero floats).
   - RTL logical CSS utilities (`ps-`, `pe-`, `ms-`, `me-`), `dir="ltr"` + `.tabular-nums` on codes/numbers, self-hosted `Vazirmatn` WOFF2 (zero external font CDNs).
   - Mandatory test & review commands (`go test ./...`, `go test -tags=integration ./...`, `npm run typecheck && npm run lint && npm run build`).

### Milestone 1: Design System & Static Frontend Shell First (`ui-ux-designer` → `browser` → `ui-ux-reviewer`)
1. Delegate design tokens (`globals.css`), local `Vazirmatn` font setup (`fonts.ts`), and responsive static UI shells for all 6 routes (including Track A Jalali / Track B Gregorian calendars, collision-free flex phone input, inline OTP drawer, Step 4 `JPG/PNG/WEBP` dropzone, lightbox zoom/rotate modal, and `/my-sessions` rejected recovery card) to **`ui-ux-designer` (`pro`)**.
2. Run `npm run typecheck && npm run lint && npm run build`.
3. Capture `390×844` and `1440×900` screenshots of every route using **`browser` (`flash`)**.
4. Submit screenshots + UI code to **`ui-ux-reviewer` (`pro`)** and iterate until **`APPROVE`** — eliminating every WP Amelia-style RTL bug before backend wiring.

### Milestone 2: Go Modular Monolith, PostgreSQL Schema & TDD (`tdd-implementer` → `senior-reviewer` + `/opus-audit`)
1. Write `migrations/00001_init.sql` (`btree_gist`, `EXCLUDE USING gist`, all schemas/tables/constraints) and generate `sqlc` queries.
2. Implement all 6 Phase 1 Go domain services (`identity`, `tenant`, `scheduling`, `booking`, `media`, `content`) + `assessment` Phase 3 stubs using **`tdd-implementer`** strictly **Red → Green → Refactor**:
   - Pass all 12 in-memory unit suites (`bootstrap.NewTestApp`).
   - Pass all 3 PostgreSQL concurrency integration tests (`go test -tags=integration ./...`).
3. Run **`senior-reviewer` (`pro`)** until **`APPROVE`**, then run **`/opus-audit`** (high-risk security & concurrency audit) specifically covering:
   - `CreateHold` / `SubmitReceipt` / `RejectBooking` / `ExpireStaleHolds` locking & `23P01` handling.
   - Integer money & basis-point math.
   - HMAC OTP rate limiting, cookie security, and `HeadObject` + `512B` magic-byte receipt verification.

### Milestone 3: Full-Stack Wiring, S3 Upload, Multi-Tenant Caddy & SEO
1. Wire Next.js `lib/api.ts` to Go `/api/v1/*` endpoints, S3 `presign` + direct `PUT` + `confirm` flow, inline `booking_verify` OTP drawer → `POST /api/v1/bookings/hold`, and `/my-sessions` rebook pre-fill.
2. Wire `middleware.ts` custom-domain host resolution + `deploy/Caddyfile` (`on_demand_tls` + same-origin `/api/v1/*` proxy) + JSON-LD (`ProfessionalService`, `BlogPosting`) + per-tenant `sitemap.xml` & `robots.txt`.
3. Pass all 3 Next.js routing/cookie/SEO tests plus `npm run typecheck && npm run lint && npm run build`.

### Milestone 4: End-to-End Live Browser QA & Pilot Migration
1. Boot full `docker-compose.yml` stack (Postgres 16 + MinIO + Caddy + Go API + Next.js).
2. Execute full end-to-end live flows via **`browser` (`flash`)** across all 6 routes at `390×844` and `1440×900` (Track A Jalali booking → inline OTP → receipt upload → therapist lightbox approve → `/my-sessions` call link; plus reject → reason → `"رزرو و آپلود مجدد"` recovery; plus Track B diaspora Gregorian + IANA timezone flow).
3. Obtain final **`APPROVE`** from both **`ui-ux-reviewer` (`pro`)** and **`senior-reviewer` (`pro`)** before migrating pilot therapists (e.g., `shahravan.org` domain CNAME test).
