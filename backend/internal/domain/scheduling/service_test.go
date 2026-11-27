package scheduling_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

func TestGenerateSlots_WeeklyRulesBuffersAndMinNotice(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Scheduling

	tehranLoc, err := time.LoadLocation("Asia/Tehran")
	if err != nil {
		t.Fatalf("load Asia/Tehran: %v", err)
	}
	// Set clock to Saturday 2026-11-21 09:30 Asia/Tehran
	env.Clock.Set(time.Date(2026, 11, 21, 9, 30, 0, 0, tehranLoc))

	therapistID := "t-sched-1"
	if err := env.SeedTherapist(tenant.Therapist{
		ID:          therapistID,
		UserID:      "u-t-1",
		Slug:        "dr-sched",
		DisplayName: "دکتر نوبت",
		Headline:    "روانشناس",
		Timezone:    "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist: %v", err)
	}

	offering, err := svc.UpsertOffering(ctx, scheduling.ServiceOffering{
		TherapistID: therapistID,
		Track:       "iran",
		Title:       "جلسه فردی",
		DurationMin: 50,
		Currency:    scheduling.CurrencyIRT,
		PriceAmount: 1200000,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("UpsertOffering failed: %v", err)
	}

	// Saturday (weekday_sat0 = 0): 10:00..15:00 (600..900), 10m buffer -> 60m stride, 2h min notice
	// With now = 09:30, minAllowed = 11:30 -> 10:00 and 11:00 excluded!
	// Remaining candidates: 12:00..12:50, 13:00..13:50, 14:00..14:50
	if err := svc.SetWeeklyRules(ctx, therapistID, []scheduling.WeeklyAvailabilityRule{
		{
			TherapistID: therapistID,
			WeekdaySat0: 0,
			StartMinute: 600,
			EndMinute:   900,
			BufferMin:   10,
			MinNoticeHr: 2,
			IsActive:    true,
		},
	}); err != nil {
		t.Fatalf("SetWeeklyRules failed: %v", err)
	}

	// Seed an active booking overlapping 13:00..13:50 Tehran time
	if err := env.SeedBooking(booking.Booking{
		ID:          "b-busy-1",
		TherapistID: therapistID,
		Status:      booking.StatusConfirmed,
		SlotStart:   time.Date(2026, 11, 21, 13, 0, 0, 0, tehranLoc),
		SlotEnd:     time.Date(2026, 11, 21, 13, 50, 0, 0, tehranLoc),
	}); err != nil {
		t.Fatalf("SeedBooking failed: %v", err)
	}

	from := time.Date(2026, 11, 21, 0, 0, 0, 0, tehranLoc)
	to := time.Date(2026, 11, 21, 23, 59, 59, 0, tehranLoc)
	slots, err := svc.GenerateSlots(ctx, therapistID, offering.ID, from, to, "Asia/Tehran")
	if err != nil {
		t.Fatalf("GenerateSlots failed: %v", err)
	}

	if len(slots) != 2 {
		t.Fatalf("expected 2 slots (12:00 and 14:00), got %d: %+v", len(slots), slots)
	}
	if slots[0].StartAt.In(tehranLoc).Hour() != 12 || slots[1].StartAt.In(tehranLoc).Hour() != 14 {
		t.Fatalf("unexpected slot hours: %v, %v", slots[0].StartAt.In(tehranLoc), slots[1].StartAt.In(tehranLoc))
	}
}

func TestGenerateSlots_JalaliOverrideClosedAndCustomHours(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Scheduling

	tehranLoc, _ := time.LoadLocation("Asia/Tehran")
	// Set clock to Friday 2026-11-20 08:00 Tehran so Saturday & Sunday are >24h away
	env.Clock.Set(time.Date(2026, 11, 20, 8, 0, 0, 0, tehranLoc))

	therapistID := "t-sched-2"
	if err := env.SeedTherapist(tenant.Therapist{
		ID:          therapistID,
		UserID:      "u-t-2",
		Slug:        "dr-override",
		DisplayName: "دکتر تعطیل",
		Headline:    "مشاور",
		Timezone:    "Asia/Tehran",
	}); err != nil {
		t.Fatalf("SeedTherapist: %v", err)
	}

	offering, err := svc.UpsertOffering(ctx, scheduling.ServiceOffering{
		TherapistID: therapistID,
		Track:       "abroad",
		Title:       "Abroad Session",
		DurationMin: 60,
		Currency:    scheduling.CurrencyEUR,
		PriceAmount: 6500,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("UpsertOffering: %v", err)
	}

	// Regular Saturday (0) and Sunday (1): 10:00..13:00, buffer 0, notice 1h
	if err := svc.SetWeeklyRules(ctx, therapistID, []scheduling.WeeklyAvailabilityRule{
		{TherapistID: therapistID, WeekdaySat0: 0, StartMinute: 600, EndMinute: 780, BufferMin: 0, MinNoticeHr: 1, IsActive: true},
		{TherapistID: therapistID, WeekdaySat0: 1, StartMinute: 600, EndMinute: 780, BufferMin: 0, MinNoticeHr: 1, IsActive: true},
	}); err != nil {
		t.Fatalf("SetWeeklyRules: %v", err)
	}

	// Override 1: Saturday 2026-11-21 full-day closed
	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  therapistID,
		OverrideDate: time.Date(2026, 11, 21, 0, 0, 0, 0, time.UTC),
		IsClosed:     true,
		Reason:       "تعطیل رسمی",
	}); err != nil {
		t.Fatalf("UpsertOverride closed: %v", err)
	}

	// Override 2: Sunday 2026-11-22 custom hours 16:00..18:00 (960..1080)
	startMin := int16(960)
	endMin := int16(1080)
	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  therapistID,
		OverrideDate: time.Date(2026, 11, 22, 0, 0, 0, 0, time.UTC),
		IsClosed:     false,
		StartMinute:  &startMin,
		EndMinute:    &endMin,
		Reason:       "ساعت ویژه",
	}); err != nil {
		t.Fatalf("UpsertOverride custom hours: %v", err)
	}

	from := time.Date(2026, 11, 21, 0, 0, 0, 0, tehranLoc)
	to := time.Date(2026, 11, 22, 23, 59, 59, 0, tehranLoc)
	slots, err := svc.GenerateSlots(ctx, therapistID, offering.ID, from, to, "Europe/Berlin")
	if err != nil {
		t.Fatalf("GenerateSlots: %v", err)
	}

	// Saturday yields 0 slots; Sunday replaces 10:00..13:00 with 16:00..18:00 -> 2 slots (16:00, 17:00 Tehran)
	if len(slots) != 2 {
		t.Fatalf("expected 2 slots on Sunday only, got %d: %+v", len(slots), slots)
	}
	for _, sl := range slots {
		if sl.ClientTimezone != "Europe/Berlin" {
			t.Fatalf("expected ClientTimezone Europe/Berlin, got %s", sl.ClientTimezone)
		}
		if sl.TehranStart.Location().String() != "Asia/Tehran" {
			t.Fatalf("expected TehranStart in Asia/Tehran, got %s", sl.TehranStart.Location())
		}
		if sl.ClientStart.Location().String() != "Europe/Berlin" {
			t.Fatalf("expected ClientStart in Europe/Berlin, got %s", sl.ClientStart.Location())
		}
		if sl.TehranLabel == "" || sl.ClientLabel == "" {
			t.Fatal("expected non-empty TehranLabel and ClientLabel")
		}
	}

	// Window > 90 days rejected
	if _, err := svc.GenerateSlots(ctx, therapistID, offering.ID, from, from.Add(91*24*time.Hour), "Europe/Berlin"); !errors.Is(err, scheduling.ErrInvalidDateRange) {
		t.Fatalf("expected ErrInvalidDateRange for >90d window, got %v", err)
	}
}

func TestScheduling_CrossTenantIDORAndSameDateOverrideReplace(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Scheduling

	victimID := "11111111-1111-1111-1111-111111111111"
	attackerID := "22222222-2222-2222-2222-222222222222"
	for _, th := range []tenant.Therapist{
		{ID: victimID, UserID: "u-v", Slug: "dr-v", DisplayName: "Victim", Headline: "Psych", Timezone: "Asia/Tehran"},
		{ID: attackerID, UserID: "u-a", Slug: "dr-a", DisplayName: "Attacker", Headline: "Psych", Timezone: "Asia/Tehran"},
	} {
		if err := env.SeedTherapist(th); err != nil {
			t.Fatalf("SeedTherapist: %v", err)
		}
	}

	victimOff, err := svc.UpsertOffering(ctx, scheduling.ServiceOffering{
		TherapistID: victimID,
		Track:       "iran",
		Title:       "مشاوره اصلی",
		DurationMin: 50,
		Currency:    scheduling.CurrencyIRT,
		PriceAmount: 1000000,
		IsActive:    true,
	})
	if err != nil {
		t.Fatalf("UpsertOffering victim: %v", err)
	}

	// Cross-tenant offering overwrite must return ErrForbidden
	if _, err := svc.UpsertOffering(ctx, scheduling.ServiceOffering{
		ID:          victimOff.ID,
		TherapistID: attackerID,
		Track:       "iran",
		Title:       "Hacked",
		DurationMin: 50,
		Currency:    scheduling.CurrencyIRT,
		PriceAmount: 1000,
		IsActive:    true,
	}); !errors.Is(err, scheduling.ErrForbidden) {
		t.Fatalf("expected ErrForbidden on cross-tenant offering overwrite, got %v", err)
	}

	targetDate := time.Date(2026, 11, 25, 0, 0, 0, 0, time.UTC)
	victimOv, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victimID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "تعطیل قربانی",
	})
	if err != nil {
		t.Fatalf("UpsertOverride victim: %v", err)
	}

	// Cross-tenant override overwrite must return ErrForbidden
	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		ID:           victimOv.ID,
		TherapistID:  attackerID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "Hacked",
	}); !errors.Is(err, scheduling.ErrForbidden) {
		t.Fatalf("expected ErrForbidden on cross-tenant override overwrite, got %v", err)
	}

	// Same-date override replace without ID: closed -> closed -> custom -> custom -> closed
	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victimID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "تعطیل مجدد",
	}); err != nil {
		t.Fatalf("repeat closed UpsertOverride without ID failed: %v", err)
	}

	s1, e1 := int16(600), int16(840)
	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victimID,
		OverrideDate: targetDate,
		IsClosed:     false,
		StartMinute:  &s1,
		EndMinute:    &e1,
		Reason:       "ساعت ویژه اول",
	}); err != nil {
		t.Fatalf("switch closed -> custom_hours failed: %v", err)
	}

	s2, e2 := int16(720), int16(960)
	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victimID,
		OverrideDate: targetDate,
		IsClosed:     false,
		StartMinute:  &s2,
		EndMinute:    &e2,
		Reason:       "ساعت ویژه دوم",
	}); err != nil {
		t.Fatalf("replace custom_hours without ID failed: %v", err)
	}

	listAfterCustom, err := svc.ListOverrides(ctx, victimID, targetDate, targetDate)
	if err != nil || len(listAfterCustom) != 1 || listAfterCustom[0].IsClosed || *listAfterCustom[0].StartMinute != 720 {
		t.Fatalf("expected single replaced custom_hours override, got %+v err=%v", listAfterCustom, err)
	}

	if _, err := svc.UpsertOverride(ctx, scheduling.AvailabilityOverride{
		TherapistID:  victimID,
		OverrideDate: targetDate,
		IsClosed:     true,
		Reason:       "بازگشت به تعطیلی",
	}); err != nil {
		t.Fatalf("switch custom_hours -> closed failed: %v", err)
	}
	listAfterClosed, err := svc.ListOverrides(ctx, victimID, targetDate, targetDate)
	if err != nil || len(listAfterClosed) != 1 || !listAfterClosed[0].IsClosed {
		t.Fatalf("expected single closed override, got %+v err=%v", listAfterClosed, err)
	}

	// SetWeeklyRules always generates fresh UUIDs instead of trusting caller-supplied ID
	callerID := "99999999-9999-9999-9999-999999999999"
	if err := svc.SetWeeklyRules(ctx, victimID, []scheduling.WeeklyAvailabilityRule{
		{ID: callerID, WeekdaySat0: 0, StartMinute: 600, EndMinute: 900, BufferMin: 10, MinNoticeHr: 2, IsActive: true},
	}); err != nil {
		t.Fatalf("SetWeeklyRules: %v", err)
	}
	rules, err := svc.ListWeeklyRules(ctx, victimID)
	if err != nil || len(rules) != 1 || rules[0].ID == callerID {
		t.Fatalf("expected SetWeeklyRules to generate fresh UUID (not %s), got %+v err=%v", callerID, rules, err)
	}
}
