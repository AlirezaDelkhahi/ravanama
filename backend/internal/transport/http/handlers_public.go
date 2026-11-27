package http

import (
	"net/http"
	"strings"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

// publicTherapistDTO strictly excludes default_call_url and payment_accounts (anti-scraping).
type publicTherapistDTO struct {
	ID                   string                  `json:"id"`
	Slug                 string                  `json:"slug"`
	DisplayName          string                  `json:"display_name"`
	Headline             string                  `json:"headline"`
	BioMarkdown          string                  `json:"bio_markdown"`
	LicenseNumber        string                  `json:"license_number"`
	YearsExperience      int16                   `json:"years_experience"`
	FocusTags            []string                `json:"focus_tags"`
	EducationTimeline    []tenant.EducationEntry `json:"education_timeline"`
	AvatarObjectKey      *string                 `json:"avatar_object_key,omitempty"`
	ReviewsEnabled       bool                    `json:"reviews_enabled"`
	Timezone             string                  `json:"timezone"`
	CancellationPolicyFa string                  `json:"cancellation_policy_fa"`
}

func toPublicTherapistDTO(t tenant.Therapist) publicTherapistDTO {
	tags := t.FocusTags
	if tags == nil {
		tags = []string{}
	}
	edu := t.EducationTimeline
	if edu == nil {
		edu = []tenant.EducationEntry{}
	}
	return publicTherapistDTO{
		ID:                   t.ID,
		Slug:                 t.Slug,
		DisplayName:          t.DisplayName,
		Headline:             t.Headline,
		BioMarkdown:          t.BioMarkdown,
		LicenseNumber:        t.LicenseNumber,
		YearsExperience:      t.YearsExperience,
		FocusTags:            tags,
		EducationTimeline:    edu,
		AvatarObjectKey:      t.AvatarObjectKey,
		ReviewsEnabled:       t.ReviewsEnabled,
		Timezone:             t.Timezone,
		CancellationPolicyFa: t.CancellationPolicyFa,
	}
}

type offeringDTO struct {
	ID          string `json:"id"`
	TherapistID string `json:"therapist_id"`
	Track       string `json:"track"`
	Title       string `json:"title"`
	Description string `json:"description"`
	DurationMin int16  `json:"duration_min"`
	Currency    string `json:"currency"`
	PriceAmount int64  `json:"price_amount"`
	IsActive    bool   `json:"is_active"`
	SortOrder   int16  `json:"sort_order"`
}

func toOfferingDTO(o scheduling.ServiceOffering) offeringDTO {
	return offeringDTO{
		ID:          o.ID,
		TherapistID: o.TherapistID,
		Track:       o.Track,
		Title:       o.Title,
		Description: o.Description,
		DurationMin: o.DurationMin,
		Currency:    string(o.Currency),
		PriceAmount: o.PriceAmount,
		IsActive:    o.IsActive,
		SortOrder:   o.SortOrder,
	}
}

func toOfferingDTOs(rows []scheduling.ServiceOffering) []offeringDTO {
	out := make([]offeringDTO, len(rows))
	for i, r := range rows {
		out[i] = toOfferingDTO(r)
	}
	return out
}

type reviewDTO struct {
	ID          string    `json:"id"`
	BookingID   string    `json:"booking_id"`
	TherapistID string    `json:"therapist_id"`
	ClientLabel string    `json:"client_label"`
	Rating      int16     `json:"rating"`
	Comment     string    `json:"comment"`
	IsPublished bool      `json:"is_published"`
	CreatedAt   time.Time `json:"created_at"`
}

func toReviewDTO(r content.Review) reviewDTO {
	return reviewDTO{
		ID:          r.ID,
		BookingID:   r.BookingID,
		TherapistID: r.TherapistID,
		ClientLabel: r.ClientLabel,
		Rating:      r.Rating,
		Comment:     r.Comment,
		IsPublished: r.IsPublished,
		CreatedAt:   r.CreatedAt,
	}
}

type blogPostDTO struct {
	ID             string     `json:"id"`
	TherapistID    string     `json:"therapist_id"`
	Slug           string     `json:"slug"`
	Title          string     `json:"title"`
	Excerpt        string     `json:"excerpt"`
	BodyMarkdown   string     `json:"body_markdown"`
	CoverObjectKey *string    `json:"cover_object_key,omitempty"`
	SEOTitle       string     `json:"seo_title"`
	SEODescription string     `json:"seo_description"`
	ReadingMin     int16      `json:"reading_min"`
	Status         string     `json:"status"`
	PublishedAt    *time.Time `json:"published_at,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	UpdatedAt      time.Time  `json:"updated_at"`
}

func toBlogPostDTO(p content.BlogPost) blogPostDTO {
	return blogPostDTO{
		ID:             p.ID,
		TherapistID:    p.TherapistID,
		Slug:           p.Slug,
		Title:          p.Title,
		Excerpt:        p.Excerpt,
		BodyMarkdown:   p.BodyMarkdown,
		CoverObjectKey: p.CoverObjectKey,
		SEOTitle:       p.SEOTitle,
		SEODescription: p.SEODescription,
		ReadingMin:     p.ReadingMin,
		Status:         string(p.Status),
		PublishedAt:    p.PublishedAt,
		CreatedAt:      p.CreatedAt,
		UpdatedAt:      p.UpdatedAt,
	}
}

func handleResolveTenantHost(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rawHost := strings.TrimSpace(r.URL.Query().Get("host"))
		host, ok := normalizeAndValidateHostname(rawHost)
		if !ok {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid host"})
			return
		}
		th, err := deps.Tenant.GetTherapistByHostname(r.Context(), host)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{
			"slug":     th.Slug,
			"hostname": host,
		})
	}
}

type directoryTherapistDTO struct {
	publicTherapistDTO
	OfferingsIran   []offeringDTO `json:"offerings_iran"`
	OfferingsAbroad []offeringDTO `json:"offerings_abroad"`
}

func handleListDirectoryTherapists(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		therapists, err := deps.Tenant.ListDirectoryTherapists(r.Context())
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		out := make([]directoryTherapistDTO, len(therapists))
		for i, t := range therapists {
			item := directoryTherapistDTO{
				publicTherapistDTO: toPublicTherapistDTO(t),
				OfferingsIran:      []offeringDTO{},
				OfferingsAbroad:    []offeringDTO{},
			}
			if deps.Scheduling != nil {
				if rowsIran, err := deps.Scheduling.ListActiveOfferings(r.Context(), t.ID, "iran"); err == nil {
					item.OfferingsIran = toOfferingDTOs(rowsIran)
				}
				if rowsAbroad, err := deps.Scheduling.ListActiveOfferings(r.Context(), t.ID, "abroad"); err == nil {
					item.OfferingsAbroad = toOfferingDTOs(rowsAbroad)
				}
			}
			out[i] = item
		}
		writeJSON(w, http.StatusOK, map[string]any{"therapists": out})
	}
}

func handleGetTherapistCatalog(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := strings.TrimSpace(r.PathValue("slug"))
		th, err := deps.Tenant.GetTherapistBySlug(r.Context(), slug)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		offeringsIran := []offeringDTO{}
		offeringsAbroad := []offeringDTO{}
		if deps.Scheduling != nil {
			rowsIran, err := deps.Scheduling.ListActiveOfferings(r.Context(), th.ID, "iran")
			if err != nil {
				writeDomainError(w, deps.Logger, err)
				return
			}
			offeringsIran = toOfferingDTOs(rowsIran)

			rowsAbroad, err := deps.Scheduling.ListActiveOfferings(r.Context(), th.ID, "abroad")
			if err != nil {
				writeDomainError(w, deps.Logger, err)
				return
			}
			offeringsAbroad = toOfferingDTOs(rowsAbroad)
		}

		reviews := []reviewDTO{}
		posts := []blogPostDTO{}
		if deps.Content != nil {
			if th.ReviewsEnabled {
				revRows, err := deps.Content.ListPublishedReviews(r.Context(), th.ID)
				if err != nil {
					writeDomainError(w, deps.Logger, err)
					return
				}
				for _, rv := range revRows {
					reviews = append(reviews, toReviewDTO(rv))
				}
			}
			postRows, err := deps.Content.ListPublishedPosts(r.Context(), th.ID)
			if err != nil {
				writeDomainError(w, deps.Logger, err)
				return
			}
			for _, p := range postRows {
				posts = append(posts, toBlogPostDTO(p))
			}
		}

		var primaryCustomDomain *string
		if domains, err := deps.Tenant.ListTherapistDomains(r.Context(), th.ID); err == nil {
			for _, d := range domains {
				if d.Status == tenant.DomainStatusVerified && d.IsPrimary {
					host := d.Hostname
					primaryCustomDomain = &host
					break
				}
			}
			if primaryCustomDomain == nil {
				for _, d := range domains {
					if d.Status == tenant.DomainStatusVerified {
						host := d.Hostname
						primaryCustomDomain = &host
						break
					}
				}
			}
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"therapist":             toPublicTherapistDTO(*th),
			"offerings_iran":        offeringsIran,
			"offerings_abroad":      offeringsAbroad,
			"reviews":               reviews,
			"blog_posts":            posts,
			"primary_custom_domain": primaryCustomDomain,
		})
	}
}

func handleGenerateSlots(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if deps.Scheduling == nil || deps.Tenant == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduling unavailable"})
			return
		}
		slug := strings.TrimSpace(r.PathValue("slug"))
		th, err := deps.Tenant.GetTherapistBySlug(r.Context(), slug)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		q := r.URL.Query()
		offeringID := strings.TrimSpace(q.Get("offering_id"))
		tz := strings.TrimSpace(q.Get("timezone"))
		if tz == "" {
			tz = "Asia/Tehran"
		}

		fromStr := strings.TrimSpace(q.Get("from"))
		toStr := strings.TrimSpace(q.Get("to"))
		var from, to time.Time
		if fromStr == "" {
			from = time.Now().UTC()
		} else {
			parsed, err := time.Parse(time.RFC3339, fromStr)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid from timestamp"})
				return
			}
			from = parsed
		}
		if toStr == "" {
			to = from.Add(14 * 24 * time.Hour)
		} else {
			parsed, err := time.Parse(time.RFC3339, toStr)
			if err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid to timestamp"})
				return
			}
			to = parsed
		}

		slots, err := deps.Scheduling.GenerateSlots(r.Context(), th.ID, offeringID, from, to, tz)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}

		type slotDTO struct {
			StartAt        time.Time `json:"start_at"`
			EndAt          time.Time `json:"end_at"`
			Track          string    `json:"track"`
			ClientTimezone string    `json:"client_timezone"`
			TehranStart    time.Time `json:"tehran_start"`
			TehranEnd      time.Time `json:"tehran_end"`
			ClientStart    time.Time `json:"client_start"`
			ClientEnd      time.Time `json:"client_end"`
			TehranLabel    string    `json:"tehran_label"`
			ClientLabel    string    `json:"client_label"`
		}
		out := make([]slotDTO, len(slots))
		for i, sl := range slots {
			out[i] = slotDTO{
				StartAt:        sl.StartAt,
				EndAt:          sl.EndAt,
				Track:          sl.Track,
				ClientTimezone: sl.ClientTimezone,
				TehranStart:    sl.TehranStart,
				TehranEnd:      sl.TehranEnd,
				ClientStart:    sl.ClientStart,
				ClientEnd:      sl.ClientEnd,
				TehranLabel:    sl.TehranLabel,
				ClientLabel:    sl.ClientLabel,
			}
		}
		w.Header().Set("Cache-Control", "no-store")
		writeJSON(w, http.StatusOK, map[string]any{"slots": out})
	}
}

func handleListTherapistBlog(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := strings.TrimSpace(r.PathValue("slug"))
		th, err := deps.Tenant.GetTherapistBySlug(r.Context(), slug)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		rows, err := deps.Content.ListPublishedPosts(r.Context(), th.ID)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		out := make([]blogPostDTO, len(rows))
		for i, p := range rows {
			out[i] = toBlogPostDTO(p)
		}
		writeJSON(w, http.StatusOK, map[string]any{"posts": out})
	}
}

func handleGetTherapistBlogPost(deps Dependencies) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		slug := strings.TrimSpace(r.PathValue("slug"))
		postSlug := strings.TrimSpace(r.PathValue("post"))
		th, err := deps.Tenant.GetTherapistBySlug(r.Context(), slug)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		post, err := deps.Content.GetPublishedPostBySlug(r.Context(), th.ID, postSlug)
		if err != nil {
			writeDomainError(w, deps.Logger, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"post": toBlogPostDTO(*post)})
	}
}
