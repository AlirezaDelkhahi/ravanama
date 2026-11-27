package http

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

type bookingDTO struct {
	ID                 string     `json:"id"`
	ReferenceCode      string     `json:"reference_code"`
	TherapistID        string     `json:"therapist_id"`
	TherapistName      string     `json:"therapist_name,omitempty"`
	TherapistSlug      string     `json:"therapist_slug,omitempty"`
	TherapistSubtitle  string     `json:"therapist_subtitle,omitempty"`
	TherapistAvatarKey *string    `json:"therapist_avatar_key,omitempty"`
	ClientUserID       string     `json:"client_user_id"`
	ServiceOfferingID  string     `json:"service_offering_id"`
	ServiceTitle       string     `json:"service_title,omitempty"`
	Track              string     `json:"track"`
	ClientTimezone     string     `json:"client_timezone"`
	SlotStart          time.Time  `json:"slot_start"`
	SlotEnd            time.Time  `json:"slot_end"`
	Currency           string     `json:"currency"`
	AmountExpected     int64      `json:"amount_expected"`
	Status             string     `json:"status"`
	HoldExpiresAt      *time.Time `json:"hold_expires_at,omitempty"`
	ClientNote         string     `json:"client_note"`
	RejectionReason    *string    `json:"rejection_reason,omitempty"`
	CallJoinURL        *string    `json:"call_join_url,omitempty"`
	HasReview          bool       `json:"has_review"`
	CreatedAt          time.Time  `json:"created_at"`
	UpdatedAt          time.Time  `json:"updated_at"`
}

func buildOfferingTitleMap(
	ctx context.Context,
	sched scheduling.SchedulingService,
	therapistID string,
	cache map[string]map[string]string,
) map[string]string {
	if sched == nil || therapistID == "" {
		return nil
	}
	if cache != nil {
		if existing, ok := cache[therapistID]; ok {
			return existing
		}
	}
	titles := make(map[string]string)
	for _, tr := range []string{"iran", "abroad"} {
		if rows, err := sched.ListActiveOfferings(ctx, therapistID, tr); err == nil {
			for _, o := range rows {
				titles[o.ID] = o.Title
			}
		}
	}
	if cache != nil {
		cache[therapistID] = titles
	}
	return titles
}

func toBookingDTO(b booking.Booking) bookingDTO {
	var callURL *string
	if b.Status == booking.StatusConfirmed || b.Status == booking.StatusCompleted {
		callURL = b.CallJoinURL
	}
	return bookingDTO{
		ID:                b.ID,
		ReferenceCode:     b.ReferenceCode,
		TherapistID:       b.TherapistID,
		ClientUserID:      b.ClientUserID,
		ServiceOfferingID: b.ServiceOfferingID,
		Track:             b.Track,
		ClientTimezone:    b.ClientTimezone,
		SlotStart:         b.SlotStart,
		SlotEnd:           b.SlotEnd,
		Currency:          b.Currency,
		AmountExpected:    b.AmountExpected,
		Status:            string(b.Status),
		HoldExpiresAt:     b.HoldExpiresAt,
		ClientNote:        b.ClientNote,
		RejectionReason:   b.RejectionReason,
		CallJoinURL:       callURL,
		CreatedAt:         b.CreatedAt,
		UpdatedAt:         b.UpdatedAt,
	}
}

type paymentDestinationDTO struct {
	ID             string `json:"id"`
	Track          string `json:"track"`
	Method         string `json:"method"`
	AccountLabel   string `json:"account_label"`
	DestinationVal string `json:"destination_val"`
	HolderName     string `json:"holder_name"`
}

func toPaymentDestinationDTOs(rows []booking.PaymentDestination) []paymentDestinationDTO {
	out := make([]paymentDestinationDTO, len(rows))
	for i, r := range rows {
		out[i] = paymentDestinationDTO{
			ID:             r.ID,
			Track:          r.Track,
			Method:         r.Method,
			AccountLabel:   r.AccountLabel,
			DestinationVal: r.DestinationVal,
			HolderName:     r.HolderName,
		}
	}
	return out
}

type createHoldReq struct {
	TherapistID       string `json:"therapist_id"`
	ServiceOfferingID string `json:"service_offering_id"`
	Track             string `json:"track"`
	ClientTimezone    string `json:"client_timezone"`
	SlotStart         string `json:"slot_start"`
	ClientNote        string `json:"client_note"`
}

func handleCreateBookingHold(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		idemKey := strings.TrimSpace(r.Header.Get("Idempotency-Key"))
		if idemKey == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Idempotency-Key header is required"})
			return
		}
		var req createHoldReq
		if !decodeJSON(w, r, &req) {
			return
		}
		slotStart, err := time.Parse(time.RFC3339, strings.TrimSpace(req.SlotStart))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid slot_start RFC3339 timestamp"})
			return
		}

		res, err := deps.Booking.CreateHold(r.Context(), booking.HoldRequest{
			TherapistID:       req.TherapistID,
			ClientUserID:      user.ID,
			ServiceOfferingID: req.ServiceOfferingID,
			Track:             req.Track,
			ClientTimezone:    req.ClientTimezone,
			SlotStart:         slotStart,
			ClientNote:        req.ClientNote,
			IdempotencyKey:    idemKey,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		dto := toBookingDTO(res.Booking)
		if deps.Tenant != nil {
			if th, err := deps.Tenant.GetTherapistByID(r.Context(), res.Booking.TherapistID); err == nil && th != nil {
				dto.TherapistName = th.DisplayName
				dto.TherapistSlug = th.Slug
				dto.TherapistSubtitle = th.Headline
				dto.TherapistAvatarKey = th.AvatarObjectKey
			}
		}
		if titles := buildOfferingTitleMap(r.Context(), deps.Scheduling, res.Booking.TherapistID, nil); titles != nil {
			dto.ServiceTitle = titles[res.Booking.ServiceOfferingID]
		}

		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusCreated, map[string]any{
			"booking":          dto,
			"payment_accounts": toPaymentDestinationDTOs(res.PaymentAccounts),
		})
	})
}

type submitReceiptReq struct {
	MediaObjectID string `json:"media_object_id"`
	TrackingCode  string `json:"tracking_code"`
}

func handleSubmitBookingReceipt(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		bookingID := strings.TrimSpace(r.PathValue("id"))
		var req submitReceiptReq
		if !decodeJSON(w, r, &req) {
			return
		}
		b, err := deps.Booking.SubmitReceipt(r.Context(), booking.SubmitReceiptRequest{
			BookingID:     bookingID,
			ClientUserID:  user.ID,
			MediaObjectID: req.MediaObjectID,
			TrackingCode:  req.TrackingCode,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"booking": toBookingDTO(*b)})
	})
}

func handleListClientBookings(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		rows, err := deps.Booking.ListClientBookings(r.Context(), user.ID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		therapistCache := make(map[string]*tenant.Therapist)
		offeringTitleCache := make(map[string]map[string]string)
		out := make([]bookingDTO, len(rows))
		for i, b := range rows {
			dto := toBookingDTO(b)
			if deps.Tenant != nil {
				th, seen := therapistCache[b.TherapistID]
				if !seen {
					if fetched, err := deps.Tenant.GetTherapistByID(r.Context(), b.TherapistID); err == nil {
						th = fetched
					}
					therapistCache[b.TherapistID] = th
				}
				if th != nil {
					dto.TherapistName = th.DisplayName
					dto.TherapistSlug = th.Slug
					dto.TherapistSubtitle = th.Headline
					dto.TherapistAvatarKey = th.AvatarObjectKey
				}
			}
			if titles := buildOfferingTitleMap(r.Context(), deps.Scheduling, b.TherapistID, offeringTitleCache); titles != nil {
				dto.ServiceTitle = titles[b.ServiceOfferingID]
			}
			if deps.Content != nil {
				if hasRev, err := deps.Content.HasReviewForBooking(r.Context(), b.ID); err == nil {
					dto.HasReview = hasRev
				}
			}
			out[i] = dto
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{"bookings": out})
	})
}

func handleGetClientBooking(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		bookingID := strings.TrimSpace(r.PathValue("id"))
		b, err := deps.Booking.GetBookingForClient(r.Context(), bookingID, user.ID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		dto := toBookingDTO(*b)
		if deps.Tenant != nil {
			if th, err := deps.Tenant.GetTherapistByID(r.Context(), b.TherapistID); err == nil && th != nil {
				dto.TherapistName = th.DisplayName
				dto.TherapistSlug = th.Slug
				dto.TherapistSubtitle = th.Headline
				dto.TherapistAvatarKey = th.AvatarObjectKey
			}
		}
		if titles := buildOfferingTitleMap(r.Context(), deps.Scheduling, b.TherapistID, nil); titles != nil {
			dto.ServiceTitle = titles[b.ServiceOfferingID]
		}
		if deps.Content != nil {
			if hasRev, err := deps.Content.HasReviewForBooking(r.Context(), b.ID); err == nil {
				dto.HasReview = hasRev
			}
		}

		resp := map[string]any{"booking": dto}
		if b.Status == booking.StatusHeld && deps.Tenant != nil {
			if accs, err := deps.Tenant.ListActivePaymentAccounts(r.Context(), b.TherapistID, tenant.Track(b.Track)); err == nil {
				dests := make([]paymentDestinationDTO, len(accs))
				for i, a := range accs {
					dests[i] = paymentDestinationDTO{
						ID:             a.ID,
						Track:          string(a.Track),
						Method:         string(a.Method),
						AccountLabel:   a.AccountLabel,
						DestinationVal: a.DestinationVal,
						HolderName:     a.HolderName,
					}
				}
				resp["payment_accounts"] = dests
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, resp)
	})
}

func handleGetBookingReceiptURL(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Media == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "media service unavailable"})
			return
		}
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		bookingID := strings.TrimSpace(r.PathValue("id"))

		var actorTherapistID string
		if (user.Role == identity.RoleTherapist || user.Role == identity.RoleAdmin) && deps.Tenant != nil {
			if th, err := deps.Tenant.GetTherapistByUserID(r.Context(), user.ID); err == nil && th != nil {
				actorTherapistID = th.ID
			}
		}

		receipt, err := deps.Booking.GetBookingReceiptForActor(r.Context(), bookingID, user.ID, actorTherapistID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		signedURL, err := deps.Media.MintReceiptDownloadURL(r.Context(), user.ID, receipt.MediaObjectID, 60*time.Second)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{
			"url":                signedURL,
			"expires_in_seconds": 60,
			"tracking_code":      receipt.TrackingCode,
		})
	})
}

type createReviewReq struct {
	ClientLabel string `json:"client_label"`
	Rating      int16  `json:"rating"`
	Comment     string `json:"comment"`
}

func handleCreateBookingReview(deps Dependencies) http.HandlerFunc {
	return requireAuth(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Content == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "content service unavailable"})
			return
		}
		user, _, ok := userFromContext(r.Context())
		if !ok {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		bookingID := strings.TrimSpace(r.PathValue("id"))
		var req createReviewReq
		if !decodeJSON(w, r, &req) {
			return
		}
		rev, err := deps.Content.CreateReview(r.Context(), content.CreateReviewRequest{
			BookingID:    bookingID,
			ClientUserID: user.ID,
			ClientLabel:  req.ClientLabel,
			Rating:       req.Rating,
			Comment:      req.Comment,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"review": toReviewDTO(*rev)})
	})
}
