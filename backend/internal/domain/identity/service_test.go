package identity_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
)

func TestIssueAndVerifyOTP_SuccessAndExpiry(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Identity

	// Issue SMS OTP
	err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: " +989121234567 ",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
		ClientIP:    "192.0.2.10",
	})
	if err != nil {
		t.Fatalf("IssueOTP failed: %v", err)
	}

	code, ok := env.LastOTP("+989121234567")
	if !ok || len(code) != 6 {
		t.Fatalf("expected 6-digit OTP sent, got ok=%v code=%q", ok, code)
	}

	// Verify OTP succeeds
	res, err := svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "+989121234567",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
		Code:        code,
		FullName:    "سارا رضایی",
		ClientIP:    "192.0.2.10",
	})
	if err != nil {
		t.Fatalf("VerifyOTP failed: %v", err)
	}
	if res.SessionToken == "" {
		t.Fatal("expected non-empty raw session token")
	}

	// AuthenticateSession works
	u, sess, err := svc.AuthenticateSession(ctx, res.SessionToken)
	if err != nil {
		t.Fatalf("AuthenticateSession failed: %v", err)
	}
	if u.ID != res.User.ID || sess.ID != res.Session.ID {
		t.Fatalf("session user mismatch")
	}

	// Single-use consumption prevents re-verification of consumed OTP
	_, err = svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "+989121234567",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
		Code:        code,
		ClientIP:    "192.0.2.10",
	})
	if !errors.Is(err, identity.ErrOTPNotFound) {
		t.Fatalf("expected ErrOTPNotFound on reuse, got %v", err)
	}

	// RevokeSession invalidates session
	if err := svc.RevokeSession(ctx, sess.ID); err != nil {
		t.Fatalf("RevokeSession failed: %v", err)
	}
	if _, _, err := svc.AuthenticateSession(ctx, res.SessionToken); !errors.Is(err, identity.ErrSessionExpired) {
		t.Fatalf("expected ErrSessionExpired after revoke, got %v", err)
	}

	// Expiry after 120s
	err = svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "User@Example.COM",
		Channel:     identity.ChannelEmail,
		Purpose:     identity.PurposeLogin,
		ClientIP:    "192.0.2.11",
	})
	if err != nil {
		t.Fatalf("IssueOTP email failed: %v", err)
	}
	emailCode, ok := env.LastOTP("user@example.com")
	if !ok {
		t.Fatal("expected normalized lowercase email OTP")
	}

	env.Clock.Advance(121 * time.Second)
	_, err = svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "user@example.com",
		Channel:     identity.ChannelEmail,
		Purpose:     identity.PurposeLogin,
		Code:        emailCode,
		ClientIP:    "192.0.2.11",
	})
	if !errors.Is(err, identity.ErrOTPExpired) {
		t.Fatalf("expected ErrOTPExpired after 121s, got %v", err)
	}
}

func TestVerifyOTP_MaxAttemptsAndRateLimit(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Identity

	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "+989120000001",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
		ClientIP:    "192.0.2.20",
	}); err != nil {
		t.Fatalf("IssueOTP failed: %v", err)
	}
	correctCode, ok := env.LastOTP("+989120000001")
	if !ok {
		t.Fatal("expected OTP")
	}

	wrongCode := "000000"
	if correctCode == wrongCode {
		wrongCode = "999999"
	}

	for i := 1; i <= 4; i++ {
		_, err := svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
			Destination: "+989120000001",
			Channel:     identity.ChannelSMS,
			Purpose:     identity.PurposeLogin,
			Code:        wrongCode,
			ClientIP:    "192.0.2.20",
		})
		if !errors.Is(err, identity.ErrInvalidOTP) {
			t.Fatalf("attempt %d: expected ErrInvalidOTP, got %v", i, err)
		}
	}

	// 5th wrong attempt locks challenge
	_, err := svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "+989120000001",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
		Code:        wrongCode,
		ClientIP:    "192.0.2.20",
	})
	if !errors.Is(err, identity.ErrOTPMaxAttempts) {
		t.Fatalf("5th attempt: expected ErrOTPMaxAttempts, got %v", err)
	}

	// Even correct code is blocked after 5 attempts
	_, err = svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "+989120000001",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
		Code:        correctCode,
		ClientIP:    "192.0.2.20",
	})
	if !errors.Is(err, identity.ErrOTPMaxAttempts) {
		t.Fatalf("6th attempt with right code: expected ErrOTPMaxAttempts, got %v", err)
	}

	// Rate limit enforced on repeated IssueOTP
	var rateLimited bool
	for i := 0; i < 10; i++ {
		err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
			Destination: "+989120000002",
			Channel:     identity.ChannelSMS,
			Purpose:     identity.PurposeBookingVerify,
			ClientIP:    "192.0.2.21",
		})
		if errors.Is(err, identity.ErrRateLimited) {
			rateLimited = true
			break
		}
	}
	if !rateLimited {
		t.Fatal("expected RateLimiterPort to enforce ErrRateLimited on repeated IssueOTP")
	}
}

func TestBookingVerifyOTP_UpsertsClientAndSetsSession(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Identity

	// First booking_verify via SMS phone
	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "+989123334455",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeBookingVerify,
		ClientIP:    "192.0.2.30",
	}); err != nil {
		t.Fatalf("IssueOTP failed: %v", err)
	}
	code1, _ := env.LastOTP("+989123334455")
	res1, err := svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "+989123334455",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeBookingVerify,
		Code:        code1,
		FullName:    "علی محمدی",
		ClientIP:    "192.0.2.30",
	})
	if err != nil {
		t.Fatalf("VerifyOTP 1 failed: %v", err)
	}
	if res1.User.PhoneE164 == nil || *res1.User.PhoneE164 != "+989123334455" {
		t.Fatalf("expected verified phone_e164 bound, got %+v", res1.User.PhoneE164)
	}
	if res1.User.Email != nil {
		t.Fatalf("expected unverified email to remain nil on SMS OTP, got %v", *res1.User.Email)
	}

	// Second booking_verify on same phone reuses exact same user ID (upsert, no duplicate)
	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "+989123334455",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeBookingVerify,
		ClientIP:    "192.0.2.30",
	}); err != nil {
		t.Fatalf("IssueOTP 2 failed: %v", err)
	}
	code2, _ := env.LastOTP("+989123334455")
	res2, err := svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "+989123334455",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeBookingVerify,
		Code:        code2,
		FullName:    "علی محمدی",
		ClientIP:    "192.0.2.30",
	})
	if err != nil {
		t.Fatalf("VerifyOTP 2 failed: %v", err)
	}
	if res2.User.ID != res1.User.ID {
		t.Fatalf("expected upsert to keep user ID %s, got %s", res1.User.ID, res2.User.ID)
	}

	// Email OTP binds only email
	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "Diaspora@Example.Org",
		Channel:     identity.ChannelEmail,
		Purpose:     identity.PurposeBookingVerify,
		ClientIP:    "192.0.2.31",
	}); err != nil {
		t.Fatalf("IssueOTP email failed: %v", err)
	}
	code3, _ := env.LastOTP("diaspora@example.org")
	res3, err := svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
		Destination: "diaspora@example.org",
		Channel:     identity.ChannelEmail,
		Purpose:     identity.PurposeBookingVerify,
		Code:        code3,
		FullName:    "Mina",
		ClientIP:    "192.0.2.31",
	})
	if err != nil {
		t.Fatalf("VerifyOTP email failed: %v", err)
	}
	if res3.User.Email == nil || *res3.User.Email != "diaspora@example.org" || res3.User.PhoneE164 != nil {
		t.Fatalf("expected only email bound, got phone=%v email=%v", res3.User.PhoneE164, res3.User.Email)
	}
}

func TestVerifyOTP_ConcurrentReplayMintsSingleSession(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Identity

	// Stricter email & E.164 validation checks
	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "invalid-email@localhost",
		Channel:     identity.ChannelEmail,
		Purpose:     identity.PurposeLogin,
	}); !errors.Is(err, identity.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for dotless email domain, got %v", err)
	}
	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "+09123456789",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeLogin,
	}); !errors.Is(err, identity.ErrInvalidInput) {
		t.Fatalf("expected ErrInvalidInput for invalid E.164 leading zero, got %v", err)
	}

	if err := svc.IssueOTP(ctx, identity.IssueOTPRequest{
		Destination: "+989129998877",
		Channel:     identity.ChannelSMS,
		Purpose:     identity.PurposeBookingVerify,
		ClientIP:    "192.0.2.50",
	}); err != nil {
		t.Fatalf("IssueOTP failed: %v", err)
	}
	code, ok := env.LastOTP("+989129998877")
	if !ok {
		t.Fatal("expected OTP")
	}

	const workers = 5
	start := make(chan struct{})
	var wg sync.WaitGroup
	results := make([]*identity.VerifyOTPResult, workers)
	errs := make([]error, workers)

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			<-start
			results[idx], errs[idx] = svc.VerifyOTP(ctx, identity.VerifyOTPRequest{
				Destination: "+989129998877",
				Channel:     identity.ChannelSMS,
				Purpose:     identity.PurposeBookingVerify,
				Code:        code,
				FullName:    "Concurrent Client",
				ClientIP:    "192.0.2.50",
			})
		}(i)
	}
	close(start)
	wg.Wait()

	successes := 0
	for i := 0; i < workers; i++ {
		if errs[i] == nil && results[i] != nil && results[i].SessionToken != "" {
			successes++
		} else if !errors.Is(errs[i], identity.ErrOTPNotFound) {
			t.Fatalf("worker %d unexpected err: %v", i, errs[i])
		}
	}
	if successes != 1 {
		t.Fatalf("expected exactly 1 session minted across concurrent OTP replay, got %d", successes)
	}
}
