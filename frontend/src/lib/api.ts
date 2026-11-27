import type { CurrencyCode } from "./jalali";
import type { BookingStatus, BookingTrack, TherapistDomainRecord } from "./types";

export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "credentials"> {
  headers?: HeadersInit;
}

/**
 * Same-origin /api/v1 typed fetch helper.
 * Always uses credentials: "same-origin" so HttpOnly session cookies work
 * seamlessly across both platform and verified custom domains.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = normalizedPath.startsWith("/api/v1")
    ? normalizedPath
    : `/api/v1${normalizedPath}`;

  const headers = new Headers(options.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }
  if (options.body && !(options.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin",
  });

  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  const payload: unknown = isJson
    ? await response.json().catch(() => null)
    : await response.text().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      `API request failed with status ${response.status}`,
      response.status,
      payload,
    );
  }

  return payload as T;
}

export interface ApiUserDTO {
  id: string;
  role: "client" | "therapist" | "admin";
  full_name: string;
  phone_e164?: string | null;
  email?: string | null;
  locale: string;
}

export interface ApiAuthMeResponse {
  user: ApiUserDTO;
  session_expires_at: string;
  therapist?: {
    id: string;
    slug: string;
    display_name: string;
  };
}

export interface ApiSlotDTO {
  start_at: string;
  end_at: string;
  track: string;
  client_timezone: string;
  tehran_start: string;
  tehran_end: string;
  client_start: string;
  client_end: string;
  tehran_label: string;
  client_label: string;
}

export interface ApiPaymentDestinationDTO {
  id: string;
  track: BookingTrack;
  method: "card_to_card" | "sheba" | "paypal" | "iban" | "usdt";
  account_label: string;
  destination_val: string;
  holder_name: string;
  is_active?: boolean;
}

export interface ApiBookingDTO {
  id: string;
  reference_code: string;
  therapist_id: string;
  therapist_name?: string;
  therapist_slug?: string;
  therapist_subtitle?: string;
  therapist_avatar_key?: string | null;
  client_user_id: string;
  service_offering_id: string;
  service_title?: string;
  track: BookingTrack;
  client_timezone: string;
  slot_start: string;
  slot_end: string;
  currency: CurrencyCode;
  amount_expected: number;
  status: BookingStatus;
  hold_expires_at?: string | null;
  client_note: string;
  rejection_reason?: string | null;
  call_join_url?: string | null;
  has_review: boolean;
  created_at: string;
  updated_at: string;
}

export interface ApiDashboardBookingDTO extends ApiBookingDTO {
  client_name?: string;
  client_phone_e164?: string | null;
  client_email?: string | null;
  has_receipt: boolean;
  tracking_code?: string;
}

export interface ApiRuleDTO {
  id?: string;
  weekday_sat0: number;
  start_minute: number;
  end_minute: number;
  buffer_min: number;
  min_notice_hr: number;
  is_active: boolean;
}

export interface ApiOverrideDTO {
  id?: string;
  override_date: string; // YYYY-MM-DD
  is_closed: boolean;
  start_minute?: number | null;
  end_minute?: number | null;
  reason: string;
}

export interface ApiDashboardTherapistDTO {
  id: string;
  slug: string;
  display_name: string;
  headline: string;
  bio_markdown: string;
  license_number: string;
  years_experience: number;
  focus_tags: string[];
  education_timeline: Array<{
    degree: string;
    institution: string;
    start_jalali: string;
    end_jalali: string;
  }>;
  avatar_object_key?: string | null;
  default_call_url?: string | null;
  directory_opt_in: boolean;
  reviews_enabled: boolean;
  timezone: string;
  cancellation_policy_fa: string;
}

export interface ApiDashboardBlogPostDTO {
  id: string;
  therapist_id: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_object_key?: string | null;
  seo_title: string;
  seo_description: string;
  reading_min: number;
  status: "draft" | "published";
  published_at?: string | null;
  created_at: string;
  updated_at: string;
}

// --- Auth ---

export function issueOtp(payload: {
  destination: string;
  channel: "sms" | "email";
  purpose: "booking_verify" | "login";
}): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/auth/otp/issue", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyOtp(payload: {
  destination: string;
  channel: "sms" | "email";
  purpose: "booking_verify" | "login";
  code: string;
  full_name?: string;
}): Promise<{ user: ApiUserDTO; session_expires_at: string }> {
  return apiFetch<{ user: ApiUserDTO; session_expires_at: string }>(
    "/auth/otp/verify",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export function getAuthMe(): Promise<ApiAuthMeResponse> {
  return apiFetch<ApiAuthMeResponse>("/auth/me", { cache: "no-store" });
}

export function logout(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/auth/logout", { method: "POST" });
}

// --- Public Scheduling & Booking Flow ---

export function fetchTherapistSlots(
  slug: string,
  offeringId: string,
  fromIso: string,
  toIso: string,
  timezone: string,
): Promise<{ slots: ApiSlotDTO[] }> {
  const params = new URLSearchParams({
    offering_id: offeringId,
    from: fromIso,
    to: toIso,
    timezone,
  });
  return apiFetch<{ slots: ApiSlotDTO[] }>(
    `/therapists/${encodeURIComponent(slug)}/slots?${params.toString()}`,
    { cache: "no-store" },
  );
}

export function createBookingHold(
  payload: {
    therapist_id: string;
    service_offering_id: string;
    track: BookingTrack;
    client_timezone: string;
    slot_start: string;
    client_note?: string;
  },
  idempotencyKey: string,
): Promise<{
  booking: ApiBookingDTO;
  payment_accounts: ApiPaymentDestinationDTO[];
}> {
  return apiFetch<{
    booking: ApiBookingDTO;
    payment_accounts: ApiPaymentDestinationDTO[];
  }>("/bookings/hold", {
    method: "POST",
    headers: {
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
}

export function presignReceiptUpload(
  bookingId: string,
  mimeType: string,
  sizeBytes: number,
): Promise<{
  media_object_id: string;
  object_key: string;
  upload_url: string;
  expires_at: string;
}> {
  return apiFetch<{
    media_object_id: string;
    object_key: string;
    upload_url: string;
    expires_at: string;
  }>("/media/receipts/presign", {
    method: "POST",
    body: JSON.stringify({
      booking_id: bookingId,
      mime_type: mimeType,
      size_bytes: sizeBytes,
    }),
  });
}

/**
 * Uploads receipt image directly to S3/MinIO presigned PUT URL.
 * Intentionally omits credentials and Content-Length (forbidden browser header).
 */
export async function uploadFileToPresignedUrl(
  uploadUrl: string,
  file: File | Blob,
  contentType?: string,
): Promise<void> {
  const resolvedType =
    contentType ??
    (typeof File !== "undefined" && file instanceof File
      ? file.type
      : "application/octet-stream");

  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": resolvedType,
    },
    body: file,
  });

  if (!response.ok) {
    throw new ApiError(
      `Presigned upload failed with status ${response.status}`,
      response.status,
      null,
    );
  }
}

export function confirmReceiptUpload(mediaObjectID: string): Promise<{
  media_object: {
    id: string;
    bucket_kind: string;
    object_key: string;
    mime_type: string;
    size_bytes: number;
    status: string;
    sha256_hex: string;
    confirmed_at?: string;
  };
}> {
  return apiFetch("/media/receipts/confirm", {
    method: "POST",
    body: JSON.stringify({ media_object_id: mediaObjectID }),
  });
}

export function submitBookingReceipt(
  bookingId: string,
  mediaObjectID: string,
  trackingCode?: string,
): Promise<{ booking: ApiBookingDTO }> {
  return apiFetch<{ booking: ApiBookingDTO }>(
    `/bookings/${encodeURIComponent(bookingId)}/receipt`,
    {
      method: "POST",
      body: JSON.stringify({
        media_object_id: mediaObjectID,
        tracking_code: trackingCode ?? "",
      }),
    },
  );
}

// --- Client Portal ---

export function listClientBookings(): Promise<{ bookings: ApiBookingDTO[] }> {
  return apiFetch<{ bookings: ApiBookingDTO[] }>("/bookings/me", {
    cache: "no-store",
  });
}

export function getClientBooking(id: string): Promise<{
  booking: ApiBookingDTO;
  payment_accounts?: ApiPaymentDestinationDTO[];
}> {
  return apiFetch<{
    booking: ApiBookingDTO;
    payment_accounts?: ApiPaymentDestinationDTO[];
  }>(`/bookings/${encodeURIComponent(id)}`, {
    cache: "no-store",
  });
}

export function submitBookingReview(
  bookingId: string,
  payload: { client_label?: string; rating: number; comment: string },
): Promise<{ review: unknown }> {
  return apiFetch(`/bookings/${encodeURIComponent(bookingId)}/review`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function getBookingReceiptUrl(bookingId: string): Promise<{
  url: string;
  expires_in_seconds: number;
  tracking_code: string;
}> {
  return apiFetch<{
    url: string;
    expires_in_seconds: number;
    tracking_code: string;
  }>(`/bookings/${encodeURIComponent(bookingId)}/receipt-url`, {
    cache: "no-store",
  });
}

// --- Therapist Dashboard ---

export function dashboardListBookings(status?: string): Promise<{
  bookings: ApiDashboardBookingDTO[];
}> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return apiFetch<{ bookings: ApiDashboardBookingDTO[] }>(
    `/dashboard/bookings${query}`,
    { cache: "no-store" },
  );
}

export function dashboardApproveBooking(
  id: string,
  callJoinURL: string,
): Promise<{ booking: ApiBookingDTO }> {
  return apiFetch<{ booking: ApiBookingDTO }>(
    `/dashboard/bookings/${encodeURIComponent(id)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ call_join_url: callJoinURL }),
    },
  );
}

export function dashboardRejectBooking(
  id: string,
  reason: string,
): Promise<{ booking: ApiBookingDTO }> {
  return apiFetch<{ booking: ApiBookingDTO }>(
    `/dashboard/bookings/${encodeURIComponent(id)}/reject`,
    {
      method: "POST",
      body: JSON.stringify({ rejection_reason: reason }),
    },
  );
}

export function dashboardGetSchedule(): Promise<{
  offerings_iran: unknown[];
  offerings_abroad: unknown[];
  weekly_rules: ApiRuleDTO[];
  overrides: ApiOverrideDTO[];
}> {
  return apiFetch("/dashboard/schedule", { cache: "no-store" });
}

export function dashboardSetWeeklyRules(rules: ApiRuleDTO[]): Promise<{
  weekly_rules: ApiRuleDTO[];
}> {
  return apiFetch("/dashboard/schedule/rules", {
    method: "PUT",
    body: JSON.stringify({ rules }),
  });
}

export function dashboardUpsertOverride(override: ApiOverrideDTO): Promise<{
  override: ApiOverrideDTO;
}> {
  return apiFetch("/dashboard/schedule/overrides", {
    method: "POST",
    body: JSON.stringify(override),
  });
}

export function dashboardGetProfile(): Promise<{
  therapist: ApiDashboardTherapistDTO;
  payment_accounts_iran: ApiPaymentDestinationDTO[];
  payment_accounts_abroad: ApiPaymentDestinationDTO[];
  domains: Array<{
    id: string;
    hostname: string;
    is_primary: boolean;
    status: TherapistDomainRecord["status"];
    txt_token: string;
    verified_at?: string | null;
    created_at: string;
  }>;
}> {
  return apiFetch("/dashboard/profile", { cache: "no-store" });
}

export function dashboardUpdateProfile(profile: {
  display_name: string;
  headline: string;
  bio_markdown: string;
  license_number: string;
  years_experience: number;
  focus_tags: string[];
  education_timeline: Array<{
    degree: string;
    institution: string;
    start_jalali: string;
    end_jalali: string;
  }>;
  avatar_object_key?: string | null;
  default_call_url?: string | null;
  directory_opt_in: boolean;
  reviews_enabled: boolean;
  timezone: string;
  cancellation_policy_fa: string;
}): Promise<{ therapist: ApiDashboardTherapistDTO }> {
  return apiFetch("/dashboard/profile", {
    method: "PUT",
    body: JSON.stringify(profile),
  });
}

export function dashboardUpsertPaymentAccount(account: {
  id?: string;
  track: BookingTrack;
  method: "card_to_card" | "sheba" | "paypal" | "iban" | "usdt";
  account_label: string;
  destination_val: string;
  holder_name: string;
  is_active: boolean;
}): Promise<{ payment_account: ApiPaymentDestinationDTO }> {
  return apiFetch("/dashboard/payment-accounts", {
    method: "POST",
    body: JSON.stringify(account),
  });
}

export function dashboardRegisterDomain(hostname: string): Promise<{
  domain: {
    id: string;
    hostname: string;
    is_primary: boolean;
    status: TherapistDomainRecord["status"];
    txt_token: string;
    verified_at?: string | null;
    created_at: string;
  };
}> {
  return apiFetch("/dashboard/domains", {
    method: "POST",
    body: JSON.stringify({ hostname }),
  });
}

export function dashboardVerifyDomain(domainId: string): Promise<{
  domain: {
    id: string;
    hostname: string;
    is_primary: boolean;
    status: TherapistDomainRecord["status"];
    txt_token: string;
    verified_at?: string | null;
    created_at: string;
  };
}> {
  return apiFetch(`/dashboard/domains/${encodeURIComponent(domainId)}/verify`, {
    method: "POST",
  });
}

export function dashboardListBlog(): Promise<{
  posts: ApiDashboardBlogPostDTO[];
}> {
  return apiFetch("/dashboard/blog", { cache: "no-store" });
}

export function dashboardUpsertBlog(post: {
  id?: string;
  slug: string;
  title: string;
  excerpt: string;
  body_markdown: string;
  cover_object_key?: string | null;
  seo_title: string;
  seo_description: string;
  reading_min: number;
  status: "draft" | "published";
}): Promise<{ post: ApiDashboardBlogPostDTO }> {
  return apiFetch("/dashboard/blog", {
    method: "POST",
    body: JSON.stringify(post),
  });
}
