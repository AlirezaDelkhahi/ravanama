package tenant_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

func TestSlugValidationAndReservedBlocklist(t *testing.T) {
	reserved := []string{
		"api", "www", "app", "admin", "dashboard",
		"my-sessions", "therapists", "for-therapists", "tenants",
		"fonts", "images", "login", "logout", "auth", "blog",
		"assets", "static", "internal", "health", "sitemap", "robots",
	}
	for _, slug := range reserved {
		if err := tenant.ValidateSlug(slug); !errors.Is(err, tenant.ErrInvalidSlug) {
			t.Fatalf("expected reserved slug %q to return ErrInvalidSlug, got %v", slug, err)
		}
	}

	invalid := []string{
		"",
		"ab",
		"Dr-Ali",
		"-dr-ali",
		"dr-ali-",
		"dr_ali",
		"dr.ali",
		strings.Repeat("a", 51),
	}
	for _, slug := range invalid {
		if err := tenant.ValidateSlug(slug); !errors.Is(err, tenant.ErrInvalidSlug) {
			t.Fatalf("expected invalid slug %q to return ErrInvalidSlug, got %v", slug, err)
		}
	}

	valid := []string{
		"dr-maryam-ahmadi",
		"clinic-24",
		"abc",
		strings.Repeat("a", 50),
	}
	for _, slug := range valid {
		if err := tenant.ValidateSlug(slug); err != nil {
			t.Fatalf("expected valid slug %q to pass, got %v", slug, err)
		}
	}
}

func TestCustomDomainVerificationAndPrimaryUniqueness(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Tenant

	therapistID := "11111111-1111-1111-1111-111111111111"
	ownerUserID := "22222222-2222-2222-2222-222222222222"
	if err := env.SeedTherapist(tenant.Therapist{
		ID:          therapistID,
		UserID:      ownerUserID,
		Slug:        "dr-sara",
		DisplayName: "دکتر سارا",
		Headline:    "روانشناس بالینی",
		Timezone:    "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist failed: %v", err)
	}

	// Register first custom domain
	d1, err := svc.RegisterCustomDomain(ctx, therapistID, "Dr-Sara.IR")
	if err != nil {
		t.Fatalf("RegisterCustomDomain d1 failed: %v", err)
	}
	if d1.Hostname != "dr-sara.ir" {
		t.Fatalf("expected lowercase hostname dr-sara.ir, got %q", d1.Hostname)
	}
	if !strings.HasPrefix(d1.TXTToken, "ravannama-verify=") {
		t.Fatalf("expected ravannama-verify= TXT token, got %q", d1.TXTToken)
	}

	// Verification fails without TXT record
	if _, err := svc.VerifyCustomDomain(ctx, therapistID, d1.ID); !errors.Is(err, tenant.ErrDomainVerifyFailed) {
		t.Fatalf("expected ErrDomainVerifyFailed without DNS TXT, got %v", err)
	}

	// Set TXT record and verify
	env.SetTXTRecords("dr-sara.ir", []string{d1.TXTToken})
	v1, err := svc.VerifyCustomDomain(ctx, therapistID, d1.ID)
	if err != nil {
		t.Fatalf("VerifyCustomDomain d1 failed: %v", err)
	}
	if v1.Status != tenant.DomainStatusVerified || !v1.IsPrimary {
		t.Fatalf("expected verified primary domain, got status=%s primary=%v", v1.Status, v1.IsPrimary)
	}

	allowed, err := svc.(tenant.TLSDomainChecker).IsVerifiedCustomDomain(ctx, "dr-sara.ir")
	if err != nil || !allowed {
		t.Fatalf("expected IsVerifiedCustomDomain=true for dr-sara.ir, got allowed=%v err=%v", allowed, err)
	}

	// Register and verify second domain -> must take primary and clear primary on first
	d2, err := svc.RegisterCustomDomain(ctx, therapistID, "clinic-sara.ir")
	if err != nil {
		t.Fatalf("RegisterCustomDomain d2 failed: %v", err)
	}
	env.SetTXTRecords("clinic-sara.ir", []string{d2.TXTToken})
	v2, err := svc.VerifyCustomDomain(ctx, therapistID, d2.ID)
	if err != nil {
		t.Fatalf("VerifyCustomDomain d2 failed: %v", err)
	}
	if !v2.IsPrimary || v2.Status != tenant.DomainStatusVerified {
		t.Fatalf("expected v2 primary verified, got %+v", v2)
	}

	// Check payment account pairing rules
	if _, err := svc.UpsertPaymentAccount(ctx, tenant.PaymentAccount{
		TherapistID:    therapistID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodPayPal,
		AccountLabel:   "Invalid",
		DestinationVal: "a@b.com",
		HolderName:     "Dr Sara",
		IsActive:       true,
	}); !errors.Is(err, tenant.ErrInvalidPaymentMethod) {
		t.Fatalf("expected ErrInvalidPaymentMethod for iran+paypal, got %v", err)
	}

	if _, err := svc.UpsertPaymentAccount(ctx, tenant.PaymentAccount{
		TherapistID:    therapistID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodSheba,
		AccountLabel:   "بانک سامان",
		DestinationVal: "IR120560000000000000000001",
		HolderName:     "دکتر سارا",
		IsActive:       true,
	}); err != nil {
		t.Fatalf("valid UpsertPaymentAccount failed: %v", err)
	}

	// Profile update validation: ownership, <=8 focus tags, https:// call url, non-nil slices
	httpURL := "http://insecure.example.com/room"
	if _, err := svc.UpdateTherapistProfile(ctx, therapistID, ownerUserID, tenant.Therapist{
		DisplayName:    "دکتر سارا",
		Headline:       "روانشناس",
		DefaultCallURL: &httpURL,
	}); !errors.Is(err, tenant.ErrInvalidCallURL) {
		t.Fatalf("expected ErrInvalidCallURL for http://, got %v", err)
	}

	upperHTTPS := "HTTPS://meet.example.com/dr-sara"
	updatedProfile, err := svc.UpdateTherapistProfile(ctx, therapistID, ownerUserID, tenant.Therapist{
		DisplayName:    "دکتر سارا",
		Headline:       "روانشناس بالینی",
		DefaultCallURL: &upperHTTPS,
	})
	if err != nil {
		t.Fatalf("UpdateTherapistProfile HTTPS:// normalization failed: %v", err)
	}
	if updatedProfile.DefaultCallURL == nil || *updatedProfile.DefaultCallURL != "https://meet.example.com/dr-sara" {
		t.Fatalf("expected lowercase https:// url, got %v", updatedProfile.DefaultCallURL)
	}
	if updatedProfile.FocusTags == nil || updatedProfile.EducationTimeline == nil {
		t.Fatal("expected nil FocusTags/EducationTimeline normalized to non-nil empty slices")
	}

	// Hostname validation parity with internal_tls.go
	for _, badHost := range []string{"127.0.0.1", "*.dr-sara.ir", "dr-sara.ir:8443", "dr..sara.ir", "dr-sara.ir."} {
		if _, err := svc.RegisterCustomDomain(ctx, therapistID, badHost); !errors.Is(err, tenant.ErrInvalidInput) {
			t.Fatalf("expected ErrInvalidInput for invalid hostname %q, got %v", badHost, err)
		}
	}
}

func TestUpsertPaymentAccount_PreventsCrossTenantIDOR(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Tenant

	victimID := "11111111-1111-1111-1111-111111111111"
	attackerID := "22222222-2222-2222-2222-222222222222"
	if err := env.SeedTherapist(tenant.Therapist{
		ID:          victimID,
		UserID:      "u-victim",
		Slug:        "dr-victim",
		DisplayName: "دکتر قربانی",
		Headline:    "روانشناس",
	}); err != nil {
		t.Fatalf("SeedTherapist victim: %v", err)
	}
	if err := env.SeedTherapist(tenant.Therapist{
		ID:          attackerID,
		UserID:      "u-attacker",
		Slug:        "dr-attacker",
		DisplayName: "دکتر مهاجم",
		Headline:    "روانشناس",
	}); err != nil {
		t.Fatalf("SeedTherapist attacker: %v", err)
	}

	victimAcc, err := svc.UpsertPaymentAccount(ctx, tenant.PaymentAccount{
		TherapistID:    victimID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodCardToCard,
		AccountLabel:   "کارت اصلی",
		DestinationVal: "6219861000000001",
		HolderName:     "دکتر قربانی",
		IsActive:       true,
	})
	if err != nil {
		t.Fatalf("UpsertPaymentAccount victim: %v", err)
	}

	// Attacker tries to overwrite victim's payment account by ID
	if _, err := svc.UpsertPaymentAccount(ctx, tenant.PaymentAccount{
		ID:             victimAcc.ID,
		TherapistID:    attackerID,
		Track:          tenant.TrackIran,
		Method:         tenant.MethodCardToCard,
		AccountLabel:   "کارت مهاجم",
		DestinationVal: "6219861099999999",
		HolderName:     "مهاجم",
		IsActive:       true,
	}); !errors.Is(err, tenant.ErrForbidden) {
		t.Fatalf("expected ErrForbidden on cross-tenant payment account overwrite, got %v", err)
	}

	// Victim's account must remain untouched
	accs, err := svc.ListActivePaymentAccounts(ctx, victimID, tenant.TrackIran)
	if err != nil || len(accs) != 1 || accs[0].DestinationVal != "6219861000000001" {
		t.Fatalf("victim payment account was corrupted: %+v err=%v", accs, err)
	}
}
