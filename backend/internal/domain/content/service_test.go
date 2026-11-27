package content_test

import (
	"context"
	"errors"
	"testing"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
)

func TestCreateReview_RequiresCompletedBooking(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	env := app.TestEnv()
	svc := app.Services().Content

	clientID := "client-rev-1"
	therapistID := "therapist-rev-1"

	nonCompleted := []booking.BookingStatus{
		booking.StatusHeld,
		booking.StatusPendingVerification,
		booking.StatusConfirmed,
		booking.StatusRejected,
	}
	for _, st := range nonCompleted {
		bID := "b-" + string(st)
		if err := env.SeedBooking(booking.Booking{
			ID:           bID,
			TherapistID:  therapistID,
			ClientUserID: clientID,
			Status:       st,
		}); err != nil {
			t.Fatalf("SeedBooking: %v", err)
		}
		_, err := svc.CreateReview(ctx, content.CreateReviewRequest{
			BookingID:    bID,
			ClientUserID: clientID,
			ClientLabel:  "مراجع فردی · آذر ۱۴۰۵",
			Rating:       5,
			Comment:      "عالی بود",
		})
		if !errors.Is(err, content.ErrBookingNotCompleted) {
			t.Fatalf("status %s: expected ErrBookingNotCompleted, got %v", st, err)
		}
	}

	// Completed booking allows one review
	if err := env.SeedBooking(booking.Booking{
		ID:           "b-completed",
		TherapistID:  therapistID,
		ClientUserID: clientID,
		Status:       booking.StatusCompleted,
	}); err != nil {
		t.Fatalf("SeedBooking completed: %v", err)
	}

	// Wrong client blocked
	if _, err := svc.CreateReview(ctx, content.CreateReviewRequest{
		BookingID:    "b-completed",
		ClientUserID: "other-user",
		ClientLabel:  "مراجع",
		Rating:       5,
		Comment:      "خوب",
	}); !errors.Is(err, content.ErrForbidden) {
		t.Fatalf("expected ErrForbidden for wrong client, got %v", err)
	}

	rev, err := svc.CreateReview(ctx, content.CreateReviewRequest{
		BookingID:    "b-completed",
		ClientUserID: clientID,
		ClientLabel:  "مراجع فردی · آذر ۱۴۰۵",
		Rating:       5,
		Comment:      "جلسه بسیار مفید و حرفه‌ای بود.",
	})
	if err != nil {
		t.Fatalf("CreateReview failed: %v", err)
	}
	if rev.TherapistID != therapistID || rev.Rating != 5 {
		t.Fatalf("unexpected review: %+v", rev)
	}

	// Duplicate review on same booking rejected
	if _, err := svc.CreateReview(ctx, content.CreateReviewRequest{
		BookingID:    "b-completed",
		ClientUserID: clientID,
		ClientLabel:  "مراجع فردی · آذر ۱۴۰۵",
		Rating:       4,
		Comment:      "دوباره",
	}); !errors.Is(err, content.ErrReviewAlreadyExists) {
		t.Fatalf("expected ErrReviewAlreadyExists on duplicate review, got %v", err)
	}
}

func TestUpsertPost_CrossTenantIDORAndSlugRename(t *testing.T) {
	ctx := context.Background()
	app := bootstrap.NewTestApp()
	svc := app.Services().Content

	victimID := "therapist-blog-victim"
	attackerID := "therapist-blog-attacker"

	p1, err := svc.UpsertPost(ctx, content.BlogPost{
		TherapistID:  victimID,
		Slug:         "first-post",
		Title:        "عنوان اول",
		BodyMarkdown: "متن اول",
		Status:       content.PostStatusPublished,
	})
	if err != nil {
		t.Fatalf("UpsertPost p1: %v", err)
	}

	// Attacker trying to overwrite victim's post by ID must receive ErrForbidden
	if _, err := svc.UpsertPost(ctx, content.BlogPost{
		ID:           p1.ID,
		TherapistID:  attackerID,
		Slug:         "hacked-slug",
		Title:        "Hacked",
		BodyMarkdown: "Hacked body",
		Status:       content.PostStatusPublished,
	}); !errors.Is(err, content.ErrForbidden) {
		t.Fatalf("expected ErrForbidden on cross-tenant blog post overwrite, got %v", err)
	}

	// Victim renaming p1's slug must succeed and keep ID
	renamed, err := svc.UpsertPost(ctx, content.BlogPost{
		ID:           p1.ID,
		TherapistID:  victimID,
		Slug:         "renamed-post",
		Title:        "عنوان ویرایش‌شده",
		BodyMarkdown: "متن ویرایش‌شده",
		Status:       content.PostStatusPublished,
	})
	if err != nil {
		t.Fatalf("slug rename failed: %v", err)
	}
	if renamed.ID != p1.ID || renamed.Slug != "renamed-post" {
		t.Fatalf("expected same ID %s with slug renamed-post, got %+v", p1.ID, renamed)
	}

	// Creating a second post with colliding slug must return ErrSlugConflict
	if _, err := svc.UpsertPost(ctx, content.BlogPost{
		TherapistID:  victimID,
		Slug:         "renamed-post",
		Title:        "مقاله تکراری",
		BodyMarkdown: "متن",
		Status:       content.PostStatusDraft,
	}); !errors.Is(err, content.ErrSlugConflict) {
		t.Fatalf("expected ErrSlugConflict for duplicate slug, got %v", err)
	}
}
