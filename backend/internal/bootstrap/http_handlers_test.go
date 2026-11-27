package bootstrap_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

type seededPilot struct {
	therapistID     string
	therapistUserID string
	therapistSlug   string
	therapistPhone  string
	clientUserID    string
	clientPhone     string
	offeringIranID  string
}

func seedHTTPFixtures(t *testing.T, app *bootstrap.App) seededPilot {
	t.Helper()
	ctx := context.Background()
	env := app.TestEnv()

	s := seededPilot{
		therapistID:     "10000000-0000-0000-0000-000000000001",
		therapistUserID: "10000000-0000-0000-0000-000000000002",
		therapistSlug:   "dr-sara-ahmadi",
		therapistPhone:  "+989121112233",
		clientUserID:    "10000000-0000-0000-0000-000000000003",
		clientPhone:     "+989123456789",
	}

	if err := env.SeedUser(identity.User{
		ID:        s.therapistUserID,
		Role:      identity.RoleTherapist,
		FullName:  "دکتر سارا احمدی",
		PhoneE164: &s.therapistPhone,
		Locale:    "fa-IR",
	}); err != nil {
		t.Fatalf("SeedUser therapist: %v", err)
	}

	defaultCall := "https://meet.google.com/secret-default-call"
	if err := env.SeedTherapist(tenant.Therapist{
		ID:             s.therapistID,
		UserID:         s.therapistUserID,
		Slug:           s.therapistSlug,
		DisplayName:    "دکتر سارا احمدی",
		Headline:       "روانشناس بالینی",
		DefaultCallURL: &defaultCall,
		DirectoryOptIn: true,
		ReviewsEnabled: true,
		Timezone:       "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist: %v", err)
	}

	// Opt-out therapist should never appear in /api/v1/therapists
	if err := env.SeedTherapist(tenant.Therapist{
		ID:             "10000000-0000-0000-0000-000000000099",
		UserID:         "10000000-0000-0000-0000-000000000098",
		Slug:           "dr-omid-nikzad",
		DisplayName:    "دکتر امید نیکزاد",
		Headline:       "درمانگر تحلیلی",
		DirectoryOptIn: false,
		Timezone:       "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist opt-out: %v", err)
	}

	if _, err := app.Services().Tenant.UpsertPaymentAccount(ctx, tenant.PaymentAccount{
		TherapistID:    s.therapistID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodCardToCard,
		AccountLabel:   "کارت بانک سامان",
		DestinationVal: "6219861048291042",
		HolderName:     "سارا احمدی",
		IsActive:       true,
	}); err != nil {
		t.Fatalf("UpsertPaymentAccount: %v", err)
	}

	off, err := app.Services().Scheduling.UpsertOffering(ctx, scheduling.ServiceOffering{
		TherapistID: s.therapistID,
		Track:       "iran",
		Title:       "مشاوره فردی",
		DurationMin: 50,
		Currency:    scheduling.CurrencyIRT,
		PriceAmount: 950000,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("UpsertOffering: %v", err)
	}
	s.offeringIranID = off.ID

	var rules []scheduling.WeeklyAvailabilityRule
	for d := int16(0); d <= 6; d++ {
		rules = append(rules, scheduling.WeeklyAvailabilityRule{
			TherapistID: s.therapistID,
			WeekdaySat0: d,
			StartMinute: 600,
			EndMinute:   1080,
			BufferMin:   10,
			MinNoticeHr: 2,
			IsActive:    true,
		})
	}
	if err := app.Services().Scheduling.SetWeeklyRules(ctx, s.therapistID, rules); err != nil {
		t.Fatalf("SetWeeklyRules: %v", err)
	}

	if _, err := app.Services().Content.UpsertPost(ctx, content.BlogPost{
		TherapistID:  s.therapistID,
		Slug:         "act-for-daily-anxiety",
		Title:        "مدیریت اضطراب روزمره",
		BodyMarkdown: "متن مقاله نمونه",
		ReadingMin:   5,
		Status:       content.PostStatusPublished,
	}); err != nil {
		t.Fatalf("UpsertPost: %v", err)
	}

	return s
}

func doJSONReq(handler http.Handler, method, path string, body any, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	return doJSONReqWithHeaders(handler, method, path, body, nil, cookies...)
}

func doJSONReqWithHeaders(handler http.Handler, method, path string, body any, headers map[string]string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	var buf bytes.Buffer
	if body != nil {
		_ = json.NewEncoder(&buf).Encode(body)
	}
	req := httptest.NewRequest(method, path, &buf)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)
	return rec
}

func loginViaOTP(t *testing.T, app *bootstrap.App, destination string, channel, purpose, fullName string) *http.Cookie {
	t.Helper()
	h := app.Handler()

	recIssue := doJSONReq(h, http.MethodPost, "/api/v1/auth/otp/issue", map[string]string{
		"destination": destination,
		"channel":     channel,
		"purpose":     purpose,
	})
	if recIssue.Code != http.StatusOK {
		t.Fatalf("issue OTP failed: status=%d body=%s", recIssue.Code, recIssue.Body.String())
	}

	code, ok := app.TestEnv().LastOTP(destination)
	if !ok {
		t.Fatalf("expected OTP to be dispatched to %s", destination)
	}

	recVerify := doJSONReq(h, http.MethodPost, "/api/v1/auth/otp/verify", map[string]string{
		"destination": destination,
		"channel":     channel,
		"purpose":     purpose,
		"code":        code,
		"full_name":   fullName,
	})
	if recVerify.Code != http.StatusOK {
		t.Fatalf("verify OTP failed: status=%d body=%s", recVerify.Code, recVerify.Body.String())
	}
	if strings.Contains(recVerify.Body.String(), "session_token") {
		t.Fatalf("session token must NEVER be returned in JSON body: %s", recVerify.Body.String())
	}

	for _, c := range recVerify.Result().Cookies() {
		if c.Name == "ravannama_session" {
			if !c.HttpOnly || c.SameSite != http.SameSiteLaxMode || c.Path != "/" {
				t.Fatalf("unexpected cookie attributes: %+v", c)
			}
			return c
		}
	}
	t.Fatal("expected ravannama_session cookie on OTP verify")
	return nil
}

func TestHTTP_PublicAntiScrapingAndDomainResolution(t *testing.T) {
	app := bootstrap.NewTestApp()
	s := seedHTTPFixtures(t, app)
	h := app.Handler()

	// Directory returns only opted-in therapist, includes offerings, and NEVER leaks default_call_url or payment_accounts.
	recDir := doJSONReq(h, http.MethodGet, "/api/v1/therapists", nil)
	if recDir.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/therapists expected 200, got %d (%s)", recDir.Code, recDir.Body.String())
	}
	dirBody := recDir.Body.String()
	if strings.Contains(dirBody, "dr-omid-nikzad") {
		t.Fatal("opt-out therapist must not appear in directory")
	}
	if strings.Contains(dirBody, "secret-default-call") || strings.Contains(dirBody, "6219861048291042") || strings.Contains(dirBody, "payment_accounts") {
		t.Fatalf("directory leaked sensitive fields: %s", dirBody)
	}
	var dirResp struct {
		Therapists []struct {
			Slug            string `json:"slug"`
			OfferingsIran   []struct {
				ID          string `json:"id"`
				PriceAmount int64  `json:"price_amount"`
			} `json:"offerings_iran"`
			OfferingsAbroad []any `json:"offerings_abroad"`
		} `json:"therapists"`
	}
	if err := json.Unmarshal(recDir.Body.Bytes(), &dirResp); err != nil {
		t.Fatalf("decode dirResp: %v", err)
	}
	if len(dirResp.Therapists) != 1 || len(dirResp.Therapists[0].OfferingsIran) != 1 || dirResp.Therapists[0].OfferingsIran[0].PriceAmount != 950000 {
		t.Fatalf("expected enriched offerings_iran in directory response, got %s", dirBody)
	}

	// Therapist catalog NEVER leaks default_call_url or payment_accounts, and exposes primary_custom_domain (nil before verify).
	recCat := doJSONReq(h, http.MethodGet, "/api/v1/therapists/"+s.therapistSlug, nil)
	if recCat.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/therapists/{slug} expected 200, got %d (%s)", recCat.Code, recCat.Body.String())
	}
	catBody := recCat.Body.String()
	if strings.Contains(catBody, "secret-default-call") || strings.Contains(catBody, "6219861048291042") || strings.Contains(catBody, "payment_accounts") || strings.Contains(catBody, "default_call_url") {
		t.Fatalf("public catalog leaked sensitive fields: %s", catBody)
	}
	var catBefore struct {
		PrimaryCustomDomain *string `json:"primary_custom_domain"`
	}
	if err := json.Unmarshal(recCat.Body.Bytes(), &catBefore); err != nil {
		t.Fatalf("decode catBefore: %v", err)
	}
	if catBefore.PrimaryCustomDomain != nil {
		t.Fatalf("expected primary_custom_domain nil before domain verify, got %v", *catBefore.PrimaryCustomDomain)
	}

	// Slots endpoint works and sets Cache-Control: no-store
	from := app.TestEnv().Clock.Now().UTC().Format(time.RFC3339)
	to := app.TestEnv().Clock.Now().Add(48 * time.Hour).UTC().Format(time.RFC3339)
	recSlots := doJSONReq(h, http.MethodGet, "/api/v1/therapists/"+s.therapistSlug+"/slots?offering_id="+s.offeringIranID+"&from="+from+"&to="+to+"&timezone=Asia/Tehran", nil)
	if recSlots.Code != http.StatusOK {
		t.Fatalf("GET slots expected 200, got %d (%s)", recSlots.Code, recSlots.Body.String())
	}
	if recSlots.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected Cache-Control: no-store on slots, got %q", recSlots.Header().Get("Cache-Control"))
	}

	// Custom domain resolve endpoint + primary_custom_domain on catalog
	app.TestEnv().SetTXTRecords("sara-clinic.ir", []string{})
	d, err := app.Services().Tenant.RegisterCustomDomain(context.Background(), s.therapistID, "sara-clinic.ir")
	if err != nil {
		t.Fatalf("RegisterCustomDomain: %v", err)
	}
	// Unverified domain returns 404
	recUnverified := doJSONReq(h, http.MethodGet, "/api/v1/tenants/resolve?host=sara-clinic.ir", nil)
	if recUnverified.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for unverified host, got %d", recUnverified.Code)
	}
	app.TestEnv().SetTXTRecords("sara-clinic.ir", []string{d.TXTToken})
	if _, err := app.Services().Tenant.VerifyCustomDomain(context.Background(), s.therapistID, d.ID); err != nil {
		t.Fatalf("VerifyCustomDomain: %v", err)
	}
	recVerified := doJSONReq(h, http.MethodGet, "/api/v1/tenants/resolve?host=sara-clinic.ir", nil)
	if recVerified.Code != http.StatusOK {
		t.Fatalf("expected 200 for verified host, got %d (%s)", recVerified.Code, recVerified.Body.String())
	}
	if !strings.Contains(recVerified.Body.String(), s.therapistSlug) {
		t.Fatalf("expected slug in resolve response, got %s", recVerified.Body.String())
	}

	recCatAfter := doJSONReq(h, http.MethodGet, "/api/v1/therapists/"+s.therapistSlug, nil)
	if recCatAfter.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/therapists/{slug} after verify expected 200, got %d", recCatAfter.Code)
	}
	var catAfter struct {
		PrimaryCustomDomain *string `json:"primary_custom_domain"`
	}
	if err := json.Unmarshal(recCatAfter.Body.Bytes(), &catAfter); err != nil {
		t.Fatalf("decode catAfter: %v", err)
	}
	if catAfter.PrimaryCustomDomain == nil || *catAfter.PrimaryCustomDomain != "sara-clinic.ir" {
		t.Fatalf("expected primary_custom_domain=sara-clinic.ir, got %+v", catAfter.PrimaryCustomDomain)
	}
}

func TestHTTP_BookingMediaAndDashboardEndToEnd(t *testing.T) {
	app := bootstrap.NewTestApp()
	s := seedHTTPFixtures(t, app)
	h := app.Handler()
	env := app.TestEnv()

	// Unauthenticated hold -> 401
	slotStart := env.Clock.Now().Add(24 * time.Hour).UTC()
	recUnauth := doJSONReqWithHeaders(h, http.MethodPost, "/api/v1/bookings/hold", map[string]any{
		"therapist_id":        s.therapistID,
		"service_offering_id": s.offeringIranID,
		"track":               "iran",
		"client_timezone":     "Asia/Tehran",
		"slot_start":          slotStart.Format(time.RFC3339),
	}, map[string]string{"Idempotency-Key": "k1"})
	if recUnauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on unauth hold, got %d", recUnauth.Code)
	}

	// Authenticate client via booking_verify OTP
	clientCookie := loginViaOTP(t, app, s.clientPhone, "sms", "booking_verify", "نگار موسوی")

	// Missing Idempotency-Key -> 400
	recNoIdem := doJSONReq(h, http.MethodPost, "/api/v1/bookings/hold", map[string]any{
		"therapist_id":        s.therapistID,
		"service_offering_id": s.offeringIranID,
		"track":               "iran",
		"client_timezone":     "Asia/Tehran",
		"slot_start":          slotStart.Format(time.RFC3339),
	}, clientCookie)
	if recNoIdem.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without Idempotency-Key, got %d", recNoIdem.Code)
	}

	// Create hold -> 201 + reveals payment_accounts, hides call_join_url
	recHold := doJSONReqWithHeaders(h, http.MethodPost, "/api/v1/bookings/hold", map[string]any{
		"therapist_id":        s.therapistID,
		"service_offering_id": s.offeringIranID,
		"track":               "iran",
		"client_timezone":     "Asia/Tehran",
		"slot_start":          slotStart.Format(time.RFC3339),
		"client_note":         "نوبت اول",
	}, map[string]string{"Idempotency-Key": "hold-key-1"}, clientCookie)
	if recHold.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for hold, got %d (%s)", recHold.Code, recHold.Body.String())
	}
	if recHold.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected Cache-Control: no-store on hold, got %q", recHold.Header().Get("Cache-Control"))
	}
	var holdResp struct {
		Booking struct {
			ID           string  `json:"id"`
			Status       string  `json:"status"`
			ServiceTitle string  `json:"service_title"`
			CallJoinURL  *string `json:"call_join_url"`
		} `json:"booking"`
		PaymentAccounts []struct {
			DestinationVal string `json:"destination_val"`
		} `json:"payment_accounts"`
	}
	if err := json.Unmarshal(recHold.Body.Bytes(), &holdResp); err != nil {
		t.Fatalf("decode holdResp: %v", err)
	}
	if holdResp.Booking.Status != "held" || holdResp.Booking.CallJoinURL != nil || len(holdResp.PaymentAccounts) != 1 || holdResp.Booking.ServiceTitle != "مشاوره فردی" {
		t.Fatalf("unexpected holdResp: %+v", holdResp)
	}

	// Presign rejects invalid MIME (PDF) -> 422
	recBadMIME := doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/presign", map[string]any{
		"booking_id": holdResp.Booking.ID,
		"mime_type":  "application/pdf",
		"size_bytes": 1024,
	}, clientCookie)
	if recBadMIME.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for PDF mime, got %d (%s)", recBadMIME.Code, recBadMIME.Body.String())
	}

	// Presign valid PNG -> 201
	recPresign := doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/presign", map[string]any{
		"booking_id": holdResp.Booking.ID,
		"mime_type":  "image/png",
		"size_bytes": 256,
	}, clientCookie)
	if recPresign.Code != http.StatusCreated {
		t.Fatalf("expected 201 for valid presign, got %d (%s)", recPresign.Code, recPresign.Body.String())
	}
	var presignResp struct {
		MediaObjectID string `json:"media_object_id"`
		ObjectKey     string `json:"object_key"`
	}
	_ = json.Unmarshal(recPresign.Body.Bytes(), &presignResp)

	// Upload disguised SVG -> confirm must fail with 422 and delete object
	env.PutStorageObject(media.BucketPrivate, presignResp.ObjectKey, []byte("<svg><script>alert(1)</script></svg>"))
	recConfirmBad := doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/confirm", map[string]any{
		"media_object_id": presignResp.MediaObjectID,
	}, clientCookie)
	if recConfirmBad.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for disguised SVG, got %d (%s)", recConfirmBad.Code, recConfirmBad.Body.String())
	}

	// Presign & confirm valid PNG
	recPresign2 := doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/presign", map[string]any{
		"booking_id": holdResp.Booking.ID,
		"mime_type":  "image/png",
		"size_bytes": 256,
	}, clientCookie)
	var presign2 struct {
		MediaObjectID string `json:"media_object_id"`
		ObjectKey     string `json:"object_key"`
	}
	_ = json.Unmarshal(recPresign2.Body.Bytes(), &presign2)
	env.PutStorageObject(media.BucketPrivate, presign2.ObjectKey, []byte{0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D})

	recConfirmOK := doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/confirm", map[string]any{
		"media_object_id": presign2.MediaObjectID,
	}, clientCookie)
	if recConfirmOK.Code != http.StatusOK {
		t.Fatalf("expected 200 for valid PNG confirm, got %d (%s)", recConfirmOK.Code, recConfirmOK.Body.String())
	}

	// SubmitReceipt -> 200, and idempotent replay -> 200
	recSub1 := doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+holdResp.Booking.ID+"/receipt", map[string]any{
		"media_object_id": presign2.MediaObjectID,
		"tracking_code":   "TRK-7788",
	}, clientCookie)
	if recSub1.Code != http.StatusOK {
		t.Fatalf("expected 200 on SubmitReceipt, got %d (%s)", recSub1.Code, recSub1.Body.String())
	}
	recSubReplay := doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+holdResp.Booking.ID+"/receipt", map[string]any{
		"media_object_id": presign2.MediaObjectID,
		"tracking_code":   "TRK-7788",
	}, clientCookie)
	if recSubReplay.Code != http.StatusOK {
		t.Fatalf("expected 200 on SubmitReceipt idempotent replay, got %d (%s)", recSubReplay.Code, recSubReplay.Body.String())
	}

	// Client cannot access therapist dashboard -> 403
	recClientDash := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/bookings", nil, clientCookie)
	if recClientDash.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for client on /api/v1/dashboard/bookings, got %d", recClientDash.Code)
	}

	// Therapist logs in via OTP
	therapistCookie := loginViaOTP(t, app, s.therapistPhone, "sms", "login", "")

	// Therapist gets receipt signed URL -> 200 with Cache-Control: no-store
	recReceiptURL := doJSONReq(h, http.MethodGet, "/api/v1/bookings/"+holdResp.Booking.ID+"/receipt-url", nil, therapistCookie)
	if recReceiptURL.Code != http.StatusOK {
		t.Fatalf("expected 200 on receipt-url, got %d (%s)", recReceiptURL.Code, recReceiptURL.Body.String())
	}
	if recReceiptURL.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected Cache-Control: no-store on receipt-url, got %q", recReceiptURL.Header().Get("Cache-Control"))
	}

	// Unrelated user gets 403 on receipt-url
	otherCookie := loginViaOTP(t, app, "+989120000001", "sms", "login", "کاربر دیگر")
	recOtherReceipt := doJSONReq(h, http.MethodGet, "/api/v1/bookings/"+holdResp.Booking.ID+"/receipt-url", nil, otherCookie)
	if recOtherReceipt.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for unrelated user on receipt-url, got %d", recOtherReceipt.Code)
	}

	// Approve with non-https URL -> 400
	recBadApprove := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/bookings/"+holdResp.Booking.ID+"/approve", map[string]any{
		"call_join_url": "http://insecure.example.com/room",
	}, therapistCookie)
	if recBadApprove.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for non-https call_join_url, got %d (%s)", recBadApprove.Code, recBadApprove.Body.String())
	}

	// Approve with https URL -> 200
	recApprove := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/bookings/"+holdResp.Booking.ID+"/approve", map[string]any{
		"call_join_url": "https://meet.google.com/session-123",
	}, therapistCookie)
	if recApprove.Code != http.StatusOK {
		t.Fatalf("expected 200 on approve, got %d (%s)", recApprove.Code, recApprove.Body.String())
	}

	// Client /bookings/me now shows call_join_url, service_title, Cache-Control: no-store, and has_review
	recMy := doJSONReq(h, http.MethodGet, "/api/v1/bookings/me", nil, clientCookie)
	if recMy.Code != http.StatusOK || !strings.Contains(recMy.Body.String(), "https://meet.google.com/session-123") {
		t.Fatalf("expected confirmed booking with call_join_url in /bookings/me, got %d (%s)", recMy.Code, recMy.Body.String())
	}
	if recMy.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected Cache-Control: no-store on /bookings/me, got %q", recMy.Header().Get("Cache-Control"))
	}
	if !strings.Contains(recMy.Body.String(), `"service_title":"مشاوره فردی"`) || !strings.Contains(recMy.Body.String(), `"has_review":false`) {
		t.Fatalf("expected service_title and has_review in /bookings/me, got %s", recMy.Body.String())
	}

	// Terminal state SubmitReceipt returns 409 Conflict
	recTermSub := doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+holdResp.Booking.ID+"/receipt", map[string]any{
		"media_object_id": "some-other-id",
	}, clientCookie)
	if recTermSub.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict on terminal booking receipt submit, got %d (%s)", recTermSub.Code, recTermSub.Body.String())
	}

	// Expired hold SubmitReceipt returns 410 Gone
	slot2 := env.Clock.Now().Add(48 * time.Hour).UTC()
	recHold2 := doJSONReqWithHeaders(h, http.MethodPost, "/api/v1/bookings/hold", map[string]any{
		"therapist_id":        s.therapistID,
		"service_offering_id": s.offeringIranID,
		"track":               "iran",
		"client_timezone":     "Asia/Tehran",
		"slot_start":          slot2.Format(time.RFC3339),
	}, map[string]string{"Idempotency-Key": "hold-key-2"}, clientCookie)
	var hold2 struct {
		Booking struct {
			ID string `json:"id"`
		} `json:"booking"`
	}
	_ = json.Unmarshal(recHold2.Body.Bytes(), &hold2)
	env.Clock.Advance(16 * time.Minute)
	recExpiredSub := doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+hold2.Booking.ID+"/receipt", map[string]any{
		"media_object_id": presign2.MediaObjectID,
	}, clientCookie)
	if recExpiredSub.Code != http.StatusGone {
		t.Fatalf("expected 410 Gone on expired hold SubmitReceipt, got %d (%s)", recExpiredSub.Code, recExpiredSub.Body.String())
	}
	_ = booking.StatusHeld
}

func TestHTTP_AuthErrorsLogoutAndDashboardWorkflows(t *testing.T) {
	app := bootstrap.NewTestApp()
	s := seedHTTPFixtures(t, app)
	h := app.Handler()
	env := app.TestEnv()

	// Invalid OTP returns 401; 5 wrong guesses returns 429
	recIssue := doJSONReq(h, http.MethodPost, "/api/v1/auth/otp/issue", map[string]string{
		"destination": "+989125551122",
		"channel":     "sms",
		"purpose":     "login",
	})
	if recIssue.Code != http.StatusOK {
		t.Fatalf("issue OTP failed: %d", recIssue.Code)
	}
	for attempt := 1; attempt <= 5; attempt++ {
		recBad := doJSONReq(h, http.MethodPost, "/api/v1/auth/otp/verify", map[string]string{
			"destination": "+989125551122",
			"channel":     "sms",
			"purpose":     "login",
			"code":        "000000",
		})
		want := http.StatusUnauthorized
		if attempt == 5 {
			want = http.StatusTooManyRequests
		}
		if recBad.Code != want {
			t.Fatalf("attempt %d: expected %d, got %d (%s)", attempt, want, recBad.Code, recBad.Body.String())
		}
	}

	// Auth /me and logout revocation
	clientCookie := loginViaOTP(t, app, s.clientPhone, "sms", "login", "نگار موسوی")
	recMe := doJSONReq(h, http.MethodGet, "/api/v1/auth/me", nil, clientCookie)
	if recMe.Code != http.StatusOK {
		t.Fatalf("GET /api/v1/auth/me expected 200, got %d", recMe.Code)
	}
	recLogout := doJSONReq(h, http.MethodPost, "/api/v1/auth/logout", nil, clientCookie)
	if recLogout.Code != http.StatusOK {
		t.Fatalf("POST /api/v1/auth/logout expected 200, got %d", recLogout.Code)
	}
	recMeAfter := doJSONReq(h, http.MethodGet, "/api/v1/auth/me", nil, clientCookie)
	if recMeAfter.Code != http.StatusUnauthorized {
		t.Fatalf("GET /api/v1/auth/me after logout expected 401, got %d", recMeAfter.Code)
	}

	// Therapist dashboard workflows: reject frees slot, schedule, profile, payouts, domains, blog, reviews
	therapistCookie := loginViaOTP(t, app, s.therapistPhone, "sms", "login", "")
	clientCookie = loginViaOTP(t, app, s.clientPhone, "sms", "booking_verify", "نگار موسوی")

	slotStart := env.Clock.Now().Add(30 * time.Hour).UTC()
	recHold := doJSONReqWithHeaders(h, http.MethodPost, "/api/v1/bookings/hold", map[string]any{
		"therapist_id":        s.therapistID,
		"service_offering_id": s.offeringIranID,
		"track":               "iran",
		"client_timezone":     "Asia/Tehran",
		"slot_start":          slotStart.Format(time.RFC3339),
	}, map[string]string{"Idempotency-Key": "rej-test-1"}, clientCookie)
	var holdResp struct {
		Booking struct {
			ID string `json:"id"`
		} `json:"booking"`
	}
	_ = json.Unmarshal(recHold.Body.Bytes(), &holdResp)

	recPresign := doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/presign", map[string]any{
		"booking_id": holdResp.Booking.ID,
		"mime_type":  "image/jpeg",
		"size_bytes": 128,
	}, clientCookie)
	var presignResp struct {
		MediaObjectID string `json:"media_object_id"`
		ObjectKey     string `json:"object_key"`
	}
	_ = json.Unmarshal(recPresign.Body.Bytes(), &presignResp)
	env.PutStorageObject(media.BucketPrivate, presignResp.ObjectKey, []byte{0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10})
	_ = doJSONReq(h, http.MethodPost, "/api/v1/media/receipts/confirm", map[string]any{
		"media_object_id": presignResp.MediaObjectID,
	}, clientCookie)
	_ = doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+holdResp.Booking.ID+"/receipt", map[string]any{
		"media_object_id": presignResp.MediaObjectID,
	}, clientCookie)

	// Reject without reason -> 400
	recRejectEmpty := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/bookings/"+holdResp.Booking.ID+"/reject", map[string]any{
		"rejection_reason": "   ",
	}, therapistCookie)
	if recRejectEmpty.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on empty rejection_reason, got %d", recRejectEmpty.Code)
	}

	// Reject with reason -> 200 and frees slot for immediate rebook
	recRejectOK := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/bookings/"+holdResp.Booking.ID+"/reject", map[string]any{
		"rejection_reason": "مبلغ ناقص است",
	}, therapistCookie)
	if recRejectOK.Code != http.StatusOK {
		t.Fatalf("expected 200 on reject, got %d (%s)", recRejectOK.Code, recRejectOK.Body.String())
	}
	recRebook := doJSONReqWithHeaders(h, http.MethodPost, "/api/v1/bookings/hold", map[string]any{
		"therapist_id":        s.therapistID,
		"service_offering_id": s.offeringIranID,
		"track":               "iran",
		"client_timezone":     "Asia/Tehran",
		"slot_start":          slotStart.Format(time.RFC3339),
	}, map[string]string{"Idempotency-Key": "rej-test-rebook"}, clientCookie)
	if recRebook.Code != http.StatusCreated {
		t.Fatalf("expected 201 on immediate rebook after rejection, got %d (%s)", recRebook.Code, recRebook.Body.String())
	}

	// Dashboard list bookings
	recDashBookings := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/bookings?status=rejected", nil, therapistCookie)
	if recDashBookings.Code != http.StatusOK || !strings.Contains(recDashBookings.Body.String(), "مبلغ ناقص است") {
		t.Fatalf("expected rejected booking in dashboard list, got %d (%s)", recDashBookings.Code, recDashBookings.Body.String())
	}
	if recDashBookings.Header().Get("Cache-Control") != "no-store" {
		t.Fatalf("expected Cache-Control: no-store on dashboard bookings, got %q", recDashBookings.Header().Get("Cache-Control"))
	}
	if !strings.Contains(recDashBookings.Body.String(), `"service_title":"مشاوره فردی"`) {
		t.Fatalf("expected service_title in dashboard bookings, got %s", recDashBookings.Body.String())
	}

	// Dashboard schedule, rules, overrides, offerings
	recSched := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/schedule", nil, therapistCookie)
	if recSched.Code != http.StatusOK {
		t.Fatalf("GET /dashboard/schedule expected 200, got %d", recSched.Code)
	}
	recRules := doJSONReq(h, http.MethodPut, "/api/v1/dashboard/schedule/rules", map[string]any{
		"rules": []map[string]any{
			{"weekday_sat0": 0, "start_minute": 600, "end_minute": 900, "buffer_min": 10, "min_notice_hr": 2, "is_active": true},
		},
	}, therapistCookie)
	if recRules.Code != http.StatusOK {
		t.Fatalf("PUT /dashboard/schedule/rules expected 200, got %d (%s)", recRules.Code, recRules.Body.String())
	}
	recOv := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/schedule/overrides", map[string]any{
		"override_date": env.Clock.Now().AddDate(0, 0, 5).Format("2006-01-02"),
		"is_closed":     true,
		"reason":        "تعطیلی",
	}, therapistCookie)
	if recOv.Code != http.StatusOK {
		t.Fatalf("POST /dashboard/schedule/overrides expected 200, got %d (%s)", recOv.Code, recOv.Body.String())
	}

	// Dashboard profile, domains, blog (draft hidden publicly, visible in dashboard)
	recProfile := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/profile", nil, therapistCookie)
	if recProfile.Code != http.StatusOK || !strings.Contains(recProfile.Body.String(), "secret-default-call") {
		t.Fatalf("GET /dashboard/profile expected 200 with therapist call url, got %d", recProfile.Code)
	}
	recBlogDraft := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/blog", map[string]any{
		"slug":          "draft-article-slug",
		"title":         "پیش‌نویس مقاله",
		"body_markdown": "متن پیش‌نویس",
		"reading_min":   4,
		"status":        "draft",
	}, therapistCookie)
	if recBlogDraft.Code != http.StatusOK {
		t.Fatalf("POST /dashboard/blog expected 200, got %d (%s)", recBlogDraft.Code, recBlogDraft.Body.String())
	}
	recDashBlog := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/blog", nil, therapistCookie)
	if recDashBlog.Code != http.StatusOK || !strings.Contains(recDashBlog.Body.String(), "draft-article-slug") {
		t.Fatalf("expected draft post in dashboard blog list, got %d (%s)", recDashBlog.Code, recDashBlog.Body.String())
	}
	recPubBlog := doJSONReq(h, http.MethodGet, "/api/v1/therapists/"+s.therapistSlug+"/blog", nil)
	if strings.Contains(recPubBlog.Body.String(), "draft-article-slug") {
		t.Fatal("draft post must not appear in public blog list")
	}

	// Review submission strictly gated to completed bookings
	recReviewHeld := doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+holdResp.Booking.ID+"/review", map[string]any{
		"rating":  5,
		"comment": "عالی",
	}, clientCookie)
	if recReviewHeld.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for review on rejected booking, got %d (%s)", recReviewHeld.Code, recReviewHeld.Body.String())
	}

	recClientMe := doJSONReq(h, http.MethodGet, "/api/v1/auth/me", nil, clientCookie)
	var meResp struct {
		User struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	_ = json.Unmarshal(recClientMe.Body.Bytes(), &meResp)

	completedID := "10000000-0000-0000-0000-000000000777"
	if err := env.SeedBooking(booking.Booking{
		ID:                completedID,
		ReferenceCode:     "RN-COMP01",
		TherapistID:       s.therapistID,
		ClientUserID:      meResp.User.ID,
		ServiceOfferingID: s.offeringIranID,
		Track:             "iran",
		ClientTimezone:    "Asia/Tehran",
		SlotStart:         env.Clock.Now().Add(-48 * time.Hour),
		SlotEnd:           env.Clock.Now().Add(-48*time.Hour + 50*time.Minute),
		Currency:          "IRT",
		AmountExpected:    950000,
		Status:            booking.StatusCompleted,
		IdempotencyKey:    "seed-completed-review",
	}); err != nil {
		t.Fatalf("SeedBooking completed: %v", err)
	}
	recReviewOK := doJSONReq(h, http.MethodPost, "/api/v1/bookings/"+completedID+"/review", map[string]any{
		"rating":       5,
		"comment":      "بسیار حرفه‌ای و آرامش‌بخش",
		"client_label": "مراجع فردی · آذر ۱۴۰۵",
	}, clientCookie)
	if recReviewOK.Code != http.StatusCreated {
		t.Fatalf("expected 201 for review on completed booking, got %d (%s)", recReviewOK.Code, recReviewOK.Body.String())
	}

	// Verify has_review flips to true on /api/v1/bookings/me after submitting review
	recMyAfterReview := doJSONReq(h, http.MethodGet, "/api/v1/bookings/me", nil, clientCookie)
	if recMyAfterReview.Code != http.StatusOK {
		t.Fatalf("expected 200 on /bookings/me after review, got %d", recMyAfterReview.Code)
	}
	var myAfter struct {
		Bookings []struct {
			ID        string `json:"id"`
			HasReview bool   `json:"has_review"`
		} `json:"bookings"`
	}
	if err := json.Unmarshal(recMyAfterReview.Body.Bytes(), &myAfter); err != nil {
		t.Fatalf("decode myAfter: %v", err)
	}
	foundReviewed := false
	for _, b := range myAfter.Bookings {
		if b.ID == completedID {
			foundReviewed = b.HasReview
		}
	}
	if !foundReviewed {
		t.Fatalf("expected completed booking %s to report has_review=true, got %s", completedID, recMyAfterReview.Body.String())
	}
}

func TestHTTP_CrossTenantIDOR_SameDateOverrides_AndBlogSlugRename(t *testing.T) {
	app := bootstrap.NewTestApp()
	s := seedHTTPFixtures(t, app)
	h := app.Handler()
	env := app.TestEnv()

	// Seed a second therapist (attacker)
	attackerUserID := "10000000-0000-0000-0000-000000000088"
	attackerTherapistID := "10000000-0000-0000-0000-000000000089"
	attackerPhone := "+989129998877"
	if err := env.SeedUser(identity.User{
		ID:        attackerUserID,
		Role:      identity.RoleTherapist,
		FullName:  "دکتر مهاجم",
		PhoneE164: &attackerPhone,
		Locale:    "fa-IR",
	}); err != nil {
		t.Fatalf("SeedUser attacker: %v", err)
	}
	if err := env.SeedTherapist(tenant.Therapist{
		ID:          attackerTherapistID,
		UserID:      attackerUserID,
		Slug:        "dr-attacker-http",
		DisplayName: "دکتر مهاجم",
		Headline:    "روانشناس",
		Timezone:    "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist attacker: %v", err)
	}

	victimCookie := loginViaOTP(t, app, s.therapistPhone, "sms", "login", "")
	attackerCookie := loginViaOTP(t, app, attackerPhone, "sms", "login", "")

	// Obtain victim's payment account ID, offering ID, override ID, and blog post ID
	recProf := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/profile", nil, victimCookie)
	var profResp struct {
		PaymentAccountsIran []struct {
			ID string `json:"id"`
		} `json:"payment_accounts_iran"`
	}
	_ = json.Unmarshal(recProf.Body.Bytes(), &profResp)
	if len(profResp.PaymentAccountsIran) != 1 {
		t.Fatalf("expected 1 iran payment account for victim, got %s", recProf.Body.String())
	}
	victimPayID := profResp.PaymentAccountsIran[0].ID

	targetDate := env.Clock.Now().AddDate(0, 0, 7).Format("2006-01-02")
	recOv1 := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/schedule/overrides", map[string]any{
		"override_date": targetDate,
		"is_closed":     true,
		"reason":        "تعطیل اولیه",
	}, victimCookie)
	if recOv1.Code != http.StatusOK {
		t.Fatalf("victim POST override 1 expected 200, got %d (%s)", recOv1.Code, recOv1.Body.String())
	}
	var ov1Resp struct {
		Override struct {
			ID string `json:"id"`
		} `json:"override"`
	}
	_ = json.Unmarshal(recOv1.Body.Bytes(), &ov1Resp)

	// Repeat POST override without id on same date -> 200 OK
	recOvRepeat := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/schedule/overrides", map[string]any{
		"override_date": targetDate,
		"is_closed":     true,
		"reason":        "تعطیل تکراری",
	}, victimCookie)
	if recOvRepeat.Code != http.StatusOK {
		t.Fatalf("repeat POST override without id expected 200, got %d (%s)", recOvRepeat.Code, recOvRepeat.Body.String())
	}

	// Toggle closed -> custom_hours -> closed on same date without id -> 200 OK
	startMin := int16(600)
	endMin := int16(840)
	recOvCustom := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/schedule/overrides", map[string]any{
		"override_date": targetDate,
		"is_closed":     false,
		"start_minute":  startMin,
		"end_minute":    endMin,
		"reason":        "ساعت اختصاصی",
	}, victimCookie)
	if recOvCustom.Code != http.StatusOK {
		t.Fatalf("toggle closed->custom_hours expected 200, got %d (%s)", recOvCustom.Code, recOvCustom.Body.String())
	}
	recOvBackClosed := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/schedule/overrides", map[string]any{
		"override_date": targetDate,
		"is_closed":     true,
		"reason":        "بازگشت به تعطیلی",
	}, victimCookie)
	if recOvBackClosed.Code != http.StatusOK {
		t.Fatalf("toggle custom_hours->closed expected 200, got %d (%s)", recOvBackClosed.Code, recOvBackClosed.Body.String())
	}
	var ovBackResp struct {
		Override struct {
			ID string `json:"id"`
		} `json:"override"`
	}
	_ = json.Unmarshal(recOvBackClosed.Body.Bytes(), &ovBackResp)

	recBlogList := doJSONReq(h, http.MethodGet, "/api/v1/dashboard/blog", nil, victimCookie)
	var blogListResp struct {
		Posts []struct {
			ID   string `json:"id"`
			Slug string `json:"slug"`
		} `json:"posts"`
	}
	_ = json.Unmarshal(recBlogList.Body.Bytes(), &blogListResp)
	if len(blogListResp.Posts) == 0 {
		t.Fatalf("expected seeded blog post for victim")
	}
	victimBlogID := blogListResp.Posts[0].ID

	// 1) Cross-tenant IDOR on POST /api/v1/dashboard/payment-accounts -> 403
	recIDORPay := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/payment-accounts", map[string]any{
		"id":              victimPayID,
		"track":           "iran",
		"method":          "card_to_card",
		"account_label":   "کارت جعلی",
		"destination_val": "6219861099999999",
		"holder_name":     "مهاجم",
		"is_active":       true,
	}, attackerCookie)
	if recIDORPay.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on cross-tenant payment account IDOR, got %d (%s)", recIDORPay.Code, recIDORPay.Body.String())
	}

	// 2) Cross-tenant IDOR on POST /api/v1/dashboard/offerings -> 403
	recIDOROff := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/offerings", map[string]any{
		"id":           s.offeringIranID,
		"track":        "iran",
		"title":        "جلسه جعلی",
		"duration_min": 50,
		"currency":     "IRT",
		"price_amount": 1000,
		"is_active":    true,
	}, attackerCookie)
	if recIDOROff.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on cross-tenant offering IDOR, got %d (%s)", recIDOROff.Code, recIDOROff.Body.String())
	}

	// 3) Cross-tenant IDOR on POST /api/v1/dashboard/schedule/overrides -> 403
	recIDOROv := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/schedule/overrides", map[string]any{
		"id":            ovBackResp.Override.ID,
		"override_date": targetDate,
		"is_closed":     true,
		"reason":        "جعلی",
	}, attackerCookie)
	if recIDOROv.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on cross-tenant override IDOR, got %d (%s)", recIDOROv.Code, recIDOROv.Body.String())
	}

	// 4) Cross-tenant IDOR on POST /api/v1/dashboard/blog -> 403
	recIDORBlog := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/blog", map[string]any{
		"id":            victimBlogID,
		"slug":          "hijacked-slug",
		"title":         "مقاله جعلی",
		"body_markdown": "متن جعلی",
		"status":        "published",
	}, attackerCookie)
	if recIDORBlog.Code != http.StatusForbidden {
		t.Fatalf("expected 403 on cross-tenant blog IDOR, got %d (%s)", recIDORBlog.Code, recIDORBlog.Body.String())
	}

	// 5) Blog slug rename -> 200 OK; duplicate slug on new post -> 409 Conflict
	recRename := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/blog", map[string]any{
		"id":            victimBlogID,
		"slug":          "act-renamed-slug",
		"title":         "مدیریت اضطراب ویرایش‌شده",
		"body_markdown": "متن جدید",
		"status":        "published",
	}, victimCookie)
	if recRename.Code != http.StatusOK || !strings.Contains(recRename.Body.String(), "act-renamed-slug") {
		t.Fatalf("expected 200 on blog slug rename, got %d (%s)", recRename.Code, recRename.Body.String())
	}

	recDupSlug := doJSONReq(h, http.MethodPost, "/api/v1/dashboard/blog", map[string]any{
		"slug":          "act-renamed-slug",
		"title":         "مقاله دوم با نامک تکراری",
		"body_markdown": "متن",
		"status":        "draft",
	}, victimCookie)
	if recDupSlug.Code != http.StatusConflict {
		t.Fatalf("expected 409 Conflict on duplicate blog slug, got %d (%s)", recDupSlug.Code, recDupSlug.Body.String())
	}
}

