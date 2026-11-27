package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

type dashboardBookingDTO struct {
	bookingDTO
	ClientName    string  `json:"client_name,omitempty"`
	ClientPhone   *string `json:"client_phone_e164,omitempty"`
	ClientEmail   *string `json:"client_email,omitempty"`
	HasReceipt    bool    `json:"has_receipt"`
	TrackingCode  string  `json:"tracking_code,omitempty"`
}

func handleDashboardListBookings(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		th, thOK := therapistFromContext(r.Context())
		if !ok || !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}

		var statusFilter *booking.BookingStatus
		if rawStatus := strings.TrimSpace(r.URL.Query().Get("status")); rawStatus != "" {
			st := booking.BookingStatus(rawStatus)
			statusFilter = &st
		}

		rows, err := deps.Booking.ListTherapistBookings(r.Context(), th.ID, statusFilter)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		offeringTitleCache := make(map[string]map[string]string)
		titles := buildOfferingTitleMap(r.Context(), deps.Scheduling, th.ID, offeringTitleCache)

		out := make([]dashboardBookingDTO, len(rows))
		for i, b := range rows {
			dto := toBookingDTO(b)
			if titles != nil {
				dto.ServiceTitle = titles[b.ServiceOfferingID]
			}
			item := dashboardBookingDTO{bookingDTO: dto}
			if deps.Identity != nil {
				if summary, err := deps.Identity.GetClientContactSummary(r.Context(), user.Role, b.ClientUserID); err == nil && summary != nil {
					item.ClientName = summary.FullName
					item.ClientPhone = summary.PhoneE164
					item.ClientEmail = summary.Email
				}
			}
			if rec, err := deps.Booking.GetBookingReceiptForActor(r.Context(), b.ID, user.ID, th.ID); err == nil && rec != nil {
				item.HasReceipt = true
				item.TrackingCode = rec.TrackingCode
			}
			out[i] = item
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{"bookings": out})
	})
}

type approveBookingReq struct {
	CallJoinURL string `json:"call_join_url"`
}

func handleDashboardApproveBooking(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		th, thOK := therapistFromContext(r.Context())
		if !ok || !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		bookingID := strings.TrimSpace(r.PathValue("id"))
		var req approveBookingReq
		if !decodeJSON(w, r, &req) {
			return
		}

		callURL := strings.TrimSpace(req.CallJoinURL)
		if callURL == "" && th.DefaultCallURL != nil {
			callURL = *th.DefaultCallURL
		}

		updated, err := deps.Booking.ApproveBooking(r.Context(), booking.ApproveBookingRequest{
			BookingID:   bookingID,
			TherapistID: th.ID,
			ActorUserID: user.ID,
			CallJoinURL: callURL,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		dto := toBookingDTO(*updated)
		if titles := buildOfferingTitleMap(r.Context(), deps.Scheduling, th.ID, nil); titles != nil {
			dto.ServiceTitle = titles[updated.ServiceOfferingID]
		}
		writeJSON(w, http.StatusOK, map[string]any{"booking": dto})
	})
}

type rejectBookingReq struct {
	RejectionReason string `json:"rejection_reason"`
}

func handleDashboardRejectBooking(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		th, thOK := therapistFromContext(r.Context())
		if !ok || !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		bookingID := strings.TrimSpace(r.PathValue("id"))
		var req rejectBookingReq
		if !decodeJSON(w, r, &req) {
			return
		}

		updated, err := deps.Booking.RejectBooking(r.Context(), booking.RejectBookingRequest{
			BookingID:       bookingID,
			TherapistID:     th.ID,
			ActorUserID:     user.ID,
			RejectionReason: req.RejectionReason,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		dto := toBookingDTO(*updated)
		if titles := buildOfferingTitleMap(r.Context(), deps.Scheduling, th.ID, nil); titles != nil {
			dto.ServiceTitle = titles[updated.ServiceOfferingID]
		}
		writeJSON(w, http.StatusOK, map[string]any{"booking": dto})
	})
}

type ruleDTO struct {
	ID          string `json:"id"`
	WeekdaySat0 int16  `json:"weekday_sat0"`
	StartMinute int16  `json:"start_minute"`
	EndMinute   int16  `json:"end_minute"`
	BufferMin   int16  `json:"buffer_min"`
	MinNoticeHr int16  `json:"min_notice_hr"`
	IsActive    bool   `json:"is_active"`
}

func toRuleDTOs(rules []scheduling.WeeklyAvailabilityRule) []ruleDTO {
	out := make([]ruleDTO, len(rules))
	for i, rl := range rules {
		out[i] = ruleDTO{
			ID:          rl.ID,
			WeekdaySat0: rl.WeekdaySat0,
			StartMinute: rl.StartMinute,
			EndMinute:   rl.EndMinute,
			BufferMin:   rl.BufferMin,
			MinNoticeHr: rl.MinNoticeHr,
			IsActive:    rl.IsActive,
		}
	}
	return out
}

func handleDashboardGetSchedule(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Scheduling == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduling unavailable"})
			return
		}
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}

		offIran, err := deps.Scheduling.ListActiveOfferings(r.Context(), th.ID, "iran")
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		offAbroad, err := deps.Scheduling.ListActiveOfferings(r.Context(), th.ID, "abroad")
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		rules, err := deps.Scheduling.ListWeeklyRules(r.Context(), th.ID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		now := time.Now().UTC()
		from := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		to := from.AddDate(0, 0, 90)
		overrides, err := deps.Scheduling.ListOverrides(r.Context(), th.ID, from, to)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		ruleDTOs := toRuleDTOs(rules)

		type overrideDTO struct {
			ID           string `json:"id"`
			OverrideDate string `json:"override_date"`
			IsClosed     bool   `json:"is_closed"`
			StartMinute  *int16 `json:"start_minute,omitempty"`
			EndMinute    *int16 `json:"end_minute,omitempty"`
			Reason       string `json:"reason"`
		}
		ovDTOs := make([]overrideDTO, len(overrides))
		for i, ov := range overrides {
			ovDTOs[i] = overrideDTO{
				ID:           ov.ID,
				OverrideDate: ov.OverrideDate.Format("2006-01-02"),
				IsClosed:     ov.IsClosed,
				StartMinute:  ov.StartMinute,
				EndMinute:    ov.EndMinute,
				Reason:       ov.Reason,
			}
		}

		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{
			"offerings_iran":   toOfferingDTOs(offIran),
			"offerings_abroad": toOfferingDTOs(offAbroad),
			"weekly_rules":     ruleDTOs,
			"overrides":        ovDTOs,
		})
	})
}

type setWeeklyRulesReq struct {
	Rules []struct {
		ID          string `json:"id"`
		WeekdaySat0 int16  `json:"weekday_sat0"`
		StartMinute int16  `json:"start_minute"`
		EndMinute   int16  `json:"end_minute"`
		BufferMin   int16  `json:"buffer_min"`
		MinNoticeHr int16  `json:"min_notice_hr"`
		IsActive    bool   `json:"is_active"`
	} `json:"rules"`
}

func handleDashboardSetWeeklyRules(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Scheduling == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduling unavailable"})
			return
		}
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req setWeeklyRulesReq
		if !decodeJSON(w, r, &req) {
			return
		}

		rules := make([]scheduling.WeeklyAvailabilityRule, len(req.Rules))
		for i, item := range req.Rules {
			rules[i] = scheduling.WeeklyAvailabilityRule{
				ID:          item.ID,
				TherapistID: th.ID,
				WeekdaySat0: item.WeekdaySat0,
				StartMinute: item.StartMinute,
				EndMinute:   item.EndMinute,
				BufferMin:   item.BufferMin,
				MinNoticeHr: item.MinNoticeHr,
				IsActive:    item.IsActive,
			}
		}
		if err := deps.Scheduling.SetWeeklyRules(r.Context(), th.ID, rules); err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		updated, err := deps.Scheduling.ListWeeklyRules(r.Context(), th.ID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"weekly_rules": toRuleDTOs(updated)})
	})
}

type upsertOverrideReq struct {
	ID           string `json:"id"`
	OverrideDate string `json:"override_date"`
	IsClosed     bool   `json:"is_closed"`
	StartMinute  *int16 `json:"start_minute"`
	EndMinute    *int16 `json:"end_minute"`
	Reason       string `json:"reason"`
}

func handleDashboardUpsertOverride(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Scheduling == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduling unavailable"})
			return
		}
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req upsertOverrideReq
		if !decodeJSON(w, r, &req) {
			return
		}
		parsedDate, err := time.Parse("2006-01-02", strings.TrimSpace(req.OverrideDate))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid override_date (expected YYYY-MM-DD)"})
			return
		}
		ov, err := deps.Scheduling.UpsertOverride(r.Context(), scheduling.AvailabilityOverride{
			ID:           strings.TrimSpace(req.ID),
			TherapistID:  th.ID,
			OverrideDate: parsedDate,
			IsClosed:     req.IsClosed,
			StartMinute:  req.StartMinute,
			EndMinute:    req.EndMinute,
			Reason:       strings.TrimSpace(req.Reason),
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"override": map[string]any{
				"id":            ov.ID,
				"override_date": ov.OverrideDate.Format("2006-01-02"),
				"is_closed":     ov.IsClosed,
				"start_minute":  ov.StartMinute,
				"end_minute":    ov.EndMinute,
				"reason":        ov.Reason,
			},
		})
	})
}

type upsertOfferingReq struct {
	ID          string `json:"id"`
	Track       string `json:"track"`
	Title       string `json:"title"`
	Description string `json:"description"`
	DurationMin int16  `json:"duration_min"`
	Currency    string `json:"currency"`
	PriceAmount int64  `json:"price_amount"`
	IsActive    bool   `json:"is_active"`
	SortOrder   int16  `json:"sort_order"`
}

func handleDashboardUpsertOffering(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Scheduling == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduling unavailable"})
			return
		}
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req upsertOfferingReq
		if !decodeJSON(w, r, &req) {
			return
		}
		off, err := deps.Scheduling.UpsertOffering(r.Context(), scheduling.ServiceOffering{
			ID:          strings.TrimSpace(req.ID),
			TherapistID: th.ID,
			Track:       strings.TrimSpace(req.Track),
			Title:       req.Title,
			Description: req.Description,
			DurationMin: req.DurationMin,
			Currency:    scheduling.Currency(strings.TrimSpace(req.Currency)),
			PriceAmount: req.PriceAmount,
			IsActive:    req.IsActive,
			SortOrder:   req.SortOrder,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"offering": toOfferingDTO(*off)})
	})
}

type dashboardTherapistDTO struct {
	publicTherapistDTO
	DefaultCallURL *string `json:"default_call_url,omitempty"`
	DirectoryOptIn bool    `json:"directory_opt_in"`
}

func toDashboardTherapistDTO(t tenant.Therapist) dashboardTherapistDTO {
	return dashboardTherapistDTO{
		publicTherapistDTO: toPublicTherapistDTO(t),
		DefaultCallURL:     t.DefaultCallURL,
		DirectoryOptIn:     t.DirectoryOptIn,
	}
}

type domainDTO struct {
	ID         string     `json:"id"`
	Hostname   string     `json:"hostname"`
	IsPrimary  bool       `json:"is_primary"`
	Status     string     `json:"status"`
	TXTToken   string     `json:"txt_token"`
	VerifiedAt *time.Time `json:"verified_at,omitempty"`
	CreatedAt  time.Time  `json:"created_at"`
}

func toDomainDTO(d tenant.TenantDomain) domainDTO {
	return domainDTO{
		ID:         d.ID,
		Hostname:   d.Hostname,
		IsPrimary:  d.IsPrimary,
		Status:     string(d.Status),
		TXTToken:   d.TXTToken,
		VerifiedAt: d.VerifiedAt,
		CreatedAt:  d.CreatedAt,
	}
}

type dashboardPaymentAccountDTO struct {
	ID             string `json:"id"`
	Track          string `json:"track"`
	Method         string `json:"method"`
	AccountLabel   string `json:"account_label"`
	DestinationVal string `json:"destination_val"`
	HolderName     string `json:"holder_name"`
	IsActive       bool   `json:"is_active"`
}

func toDashboardPaymentAccountDTO(a tenant.PaymentAccount) dashboardPaymentAccountDTO {
	return dashboardPaymentAccountDTO{
		ID:             a.ID,
		Track:          string(a.Track),
		Method:         string(a.Method),
		AccountLabel:   a.AccountLabel,
		DestinationVal: a.DestinationVal,
		HolderName:     a.HolderName,
		IsActive:       a.IsActive,
	}
}

func toDashboardPaymentAccountDTOs(rows []tenant.PaymentAccount) []dashboardPaymentAccountDTO {
	out := make([]dashboardPaymentAccountDTO, len(rows))
	for i, r := range rows {
		out[i] = toDashboardPaymentAccountDTO(r)
	}
	return out
}

func handleDashboardGetProfile(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		iranAccs, _ := deps.Tenant.ListActivePaymentAccounts(r.Context(), th.ID, tenant.TrackIran)
		abroadAccs, _ := deps.Tenant.ListActivePaymentAccounts(r.Context(), th.ID, tenant.TrackAbroad)
		domains, _ := deps.Tenant.ListTherapistDomains(r.Context(), th.ID)

		domDTOs := make([]domainDTO, len(domains))
		for i, d := range domains {
			domDTOs[i] = toDomainDTO(d)
		}

		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{
			"therapist":               toDashboardTherapistDTO(*th),
			"payment_accounts_iran":   toDashboardPaymentAccountDTOs(iranAccs),
			"payment_accounts_abroad": toDashboardPaymentAccountDTOs(abroadAccs),
			"domains":                 domDTOs,
		})
	})
}

type updateProfileReq struct {
	DisplayName          string                  `json:"display_name"`
	Headline             string                  `json:"headline"`
	BioMarkdown          string                  `json:"bio_markdown"`
	LicenseNumber        string                  `json:"license_number"`
	YearsExperience      int16                   `json:"years_experience"`
	FocusTags            []string                `json:"focus_tags"`
	EducationTimeline    []tenant.EducationEntry `json:"education_timeline"`
	AvatarObjectKey      *string                 `json:"avatar_object_key"`
	DefaultCallURL       *string                 `json:"default_call_url"`
	DirectoryOptIn       bool                    `json:"directory_opt_in"`
	ReviewsEnabled       bool                    `json:"reviews_enabled"`
	Timezone             string                  `json:"timezone"`
	CancellationPolicyFa string                  `json:"cancellation_policy_fa"`
}

func handleDashboardUpdateProfile(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		user, _, ok := userFromContext(r.Context())
		th, thOK := therapistFromContext(r.Context())
		if !ok || !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req updateProfileReq
		if !decodeJSON(w, r, &req) {
			return
		}
		updated, err := deps.Tenant.UpdateTherapistProfile(r.Context(), th.ID, user.ID, tenant.Therapist{
			DisplayName:          req.DisplayName,
			Headline:             req.Headline,
			BioMarkdown:          req.BioMarkdown,
			LicenseNumber:        req.LicenseNumber,
			YearsExperience:      req.YearsExperience,
			FocusTags:            req.FocusTags,
			EducationTimeline:    req.EducationTimeline,
			AvatarObjectKey:      req.AvatarObjectKey,
			DefaultCallURL:       req.DefaultCallURL,
			DirectoryOptIn:       req.DirectoryOptIn,
			ReviewsEnabled:       req.ReviewsEnabled,
			Timezone:             req.Timezone,
			CancellationPolicyFa: req.CancellationPolicyFa,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"therapist": toDashboardTherapistDTO(*updated)})
	})
}

type upsertPaymentAccountReq struct {
	ID             string `json:"id"`
	Track          string `json:"track"`
	Method         string `json:"method"`
	AccountLabel   string `json:"account_label"`
	DestinationVal string `json:"destination_val"`
	HolderName     string `json:"holder_name"`
	IsActive       bool   `json:"is_active"`
}

func handleDashboardUpsertPaymentAccount(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req upsertPaymentAccountReq
		if !decodeJSON(w, r, &req) {
			return
		}
		acc, err := deps.Tenant.UpsertPaymentAccount(r.Context(), tenant.PaymentAccount{
			ID:             strings.TrimSpace(req.ID),
			TherapistID:    th.ID,
			Track:          tenant.Track(strings.TrimSpace(req.Track)),
			Method:         tenant.PaymentMethod(strings.TrimSpace(req.Method)),
			AccountLabel:   req.AccountLabel,
			DestinationVal: req.DestinationVal,
			HolderName:     req.HolderName,
			IsActive:       req.IsActive,
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"payment_account": toDashboardPaymentAccountDTO(*acc)})
	})
}

type registerDomainReq struct {
	Hostname string `json:"hostname"`
}

func handleDashboardRegisterDomain(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req registerDomainReq
		if !decodeJSON(w, r, &req) {
			return
		}
		d, err := deps.Tenant.RegisterCustomDomain(r.Context(), th.ID, req.Hostname)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"domain": toDomainDTO(*d)})
	})
}

func handleDashboardVerifyDomain(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		domainID := strings.TrimSpace(r.PathValue("id"))
		d, err := deps.Tenant.VerifyCustomDomain(r.Context(), th.ID, domainID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"domain": toDomainDTO(*d)})
	})
}

func handleDashboardListBlog(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Content == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "content service unavailable"})
			return
		}
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		rows, err := deps.Content.ListAllByTherapist(r.Context(), th.ID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		out := make([]blogPostDTO, len(rows))
		for i, p := range rows {
			out[i] = toBlogPostDTO(p)
		}
		writeJSON(w, http.StatusOK, map[string]any{"posts": out})
	})
}

type upsertBlogReq struct {
	ID             string  `json:"id"`
	Slug           string  `json:"slug"`
	Title          string  `json:"title"`
	Excerpt        string  `json:"excerpt"`
	BodyMarkdown   string  `json:"body_markdown"`
	CoverObjectKey *string `json:"cover_object_key"`
	SEOTitle       string  `json:"seo_title"`
	SEODescription string  `json:"seo_description"`
	ReadingMin     int16   `json:"reading_min"`
	Status         string  `json:"status"`
}

func handleDashboardUpsertBlog(deps Dependencies) http.HandlerFunc {
	return requireTherapist(deps, func(w http.ResponseWriter, r *http.Request) {
		if deps.Content == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "content service unavailable"})
			return
		}
		th, thOK := therapistFromContext(r.Context())
		if !thOK {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "authentication required"})
			return
		}
		var req upsertBlogReq
		if !decodeJSON(w, r, &req) {
			return
		}
		post, err := deps.Content.UpsertPost(r.Context(), content.BlogPost{
			ID:             strings.TrimSpace(req.ID),
			TherapistID:    th.ID,
			Slug:           req.Slug,
			Title:          req.Title,
			Excerpt:        req.Excerpt,
			BodyMarkdown:   req.BodyMarkdown,
			CoverObjectKey: req.CoverObjectKey,
			SEOTitle:       req.SEOTitle,
			SEODescription: req.SEODescription,
			ReadingMin:     req.ReadingMin,
			Status:         content.PostStatus(strings.TrimSpace(req.Status)),
		})
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"post": toBlogPostDTO(*post)})
	})
}
