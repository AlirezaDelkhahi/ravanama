package scheduling

import (
	"context"
	"errors"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	defaultTherapistTimezone = "Asia/Tehran"
	defaultBufferMin         = int16(10)
	defaultMinNoticeHr       = int16(12)
	maxSlotWindow            = 90 * 24 * time.Hour
)

var allowedDurations = map[int16]struct{}{
	30: {}, 45: {}, 50: {}, 60: {}, 75: {}, 90: {}, 120: {},
}

// Service implements SchedulingService.
type Service struct {
	offerings  OfferingRepository
	rules      WeeklyRuleRepository
	overrides  OverrideRepository
	tzReader   TherapistTimezoneReader
	busyReader BusySlotReader
	clock      Clock
}

// NewService constructs a scheduling Service with injected ports.
func NewService(
	offerings OfferingRepository,
	rules WeeklyRuleRepository,
	overrides OverrideRepository,
	tzReader TherapistTimezoneReader,
	busyReader BusySlotReader,
	clock Clock,
) *Service {
	return &Service{
		offerings:  offerings,
		rules:      rules,
		overrides:  overrides,
		tzReader:   tzReader,
		busyReader: busyReader,
		clock:      clock,
	}
}

func (s *Service) ListActiveOfferings(ctx context.Context, therapistID string, track string) ([]ServiceOffering, error) {
	if strings.TrimSpace(therapistID) == "" || (track != "iran" && track != "abroad") {
		return nil, ErrInvalidInput
	}
	return s.offerings.ListActiveByTherapist(ctx, therapistID, track)
}

func (s *Service) UpsertOffering(ctx context.Context, offering ServiceOffering) (*ServiceOffering, error) {
	if strings.TrimSpace(offering.TherapistID) == "" || strings.TrimSpace(offering.Title) == "" {
		return nil, ErrInvalidInput
	}
	if _, ok := allowedDurations[offering.DurationMin]; !ok {
		return nil, ErrInvalidDuration
	}
	if offering.PriceAmount <= 0 {
		return nil, ErrInvalidPrice
	}
	switch offering.Track {
	case "iran":
		if offering.Currency != CurrencyIRT {
			return nil, ErrInvalidCurrency
		}
	case "abroad":
		if offering.Currency != CurrencyUSD && offering.Currency != CurrencyEUR {
			return nil, ErrInvalidCurrency
		}
	default:
		return nil, ErrInvalidTrack
	}
	offering.ID = strings.TrimSpace(offering.ID)
	if offering.ID != "" {
		existing, err := s.offerings.GetByID(ctx, offering.ID)
		if err == nil && existing != nil {
			if existing.TherapistID != offering.TherapistID {
				return nil, ErrForbidden
			}
			offering.CreatedAt = existing.CreatedAt
		} else if err != nil && !errors.Is(err, ErrOfferingNotFound) {
			return nil, err
		}
	}
	if offering.ID == "" {
		offering.ID = uuid.Must(uuid.NewV7()).String()
		offering.CreatedAt = s.clock.Now()
	} else if offering.CreatedAt.IsZero() {
		offering.CreatedAt = s.clock.Now()
	}
	offering.Title = strings.TrimSpace(offering.Title)
	return s.offerings.Upsert(ctx, offering)
}

func (s *Service) ListWeeklyRules(ctx context.Context, therapistID string) ([]WeeklyAvailabilityRule, error) {
	trimmed := strings.TrimSpace(therapistID)
	if trimmed == "" {
		return nil, ErrInvalidInput
	}
	return s.rules.ListActiveByTherapist(ctx, trimmed)
}

func (s *Service) SetWeeklyRules(ctx context.Context, therapistID string, rules []WeeklyAvailabilityRule) error {
	if strings.TrimSpace(therapistID) == "" {
		return ErrInvalidInput
	}
	normalized := make([]WeeklyAvailabilityRule, len(rules))
	for i, r := range rules {
		if r.WeekdaySat0 < 0 || r.WeekdaySat0 > 6 ||
			r.StartMinute < 0 || r.StartMinute > 1439 ||
			r.EndMinute <= r.StartMinute || r.EndMinute > 1440 ||
			r.BufferMin < 0 || r.BufferMin > 60 ||
			r.MinNoticeHr < 1 || r.MinNoticeHr > 168 {
			return ErrInvalidRule
		}
		r.ID = uuid.Must(uuid.NewV7()).String()
		r.TherapistID = therapistID
		normalized[i] = r
	}
	return s.rules.ReplaceForTherapist(ctx, therapistID, normalized)
}

func (s *Service) ListOverrides(ctx context.Context, therapistID string, from time.Time, to time.Time) ([]AvailabilityOverride, error) {
	trimmed := strings.TrimSpace(therapistID)
	if trimmed == "" {
		return nil, ErrInvalidInput
	}
	if from.IsZero() || to.IsZero() || to.Before(from) {
		return nil, ErrInvalidDateRange
	}
	fromDate := time.Date(from.Year(), from.Month(), from.Day(), 0, 0, 0, 0, time.UTC)
	toDate := time.Date(to.Year(), to.Month(), to.Day(), 0, 0, 0, 0, time.UTC)
	return s.overrides.ListByTherapistInRange(ctx, trimmed, fromDate, toDate)
}

func (s *Service) UpsertOverride(ctx context.Context, override AvailabilityOverride) (*AvailabilityOverride, error) {
	if strings.TrimSpace(override.TherapistID) == "" || override.OverrideDate.IsZero() {
		return nil, ErrInvalidInput
	}
	if override.IsClosed {
		if override.StartMinute != nil || override.EndMinute != nil {
			return nil, ErrInvalidOverride
		}
	} else {
		if override.StartMinute == nil || override.EndMinute == nil ||
			*override.StartMinute < 0 || *override.StartMinute > 1439 ||
			*override.EndMinute <= *override.StartMinute || *override.EndMinute > 1440 {
			return nil, ErrInvalidOverride
		}
	}
	override.ID = strings.TrimSpace(override.ID)
	if override.ID != "" {
		existing, err := s.overrides.GetByID(ctx, override.ID)
		if err == nil && existing != nil {
			if existing.TherapistID != override.TherapistID {
				return nil, ErrForbidden
			}
		} else if err != nil && !errors.Is(err, ErrOverrideNotFound) {
			return nil, err
		}
	}
	override.OverrideDate = time.Date(
		override.OverrideDate.Year(),
		override.OverrideDate.Month(),
		override.OverrideDate.Day(),
		0, 0, 0, 0, time.UTC,
	)
	return s.overrides.Upsert(ctx, override)
}

func (s *Service) GenerateSlots(
	ctx context.Context,
	therapistID string,
	offeringID string,
	from time.Time,
	to time.Time,
	clientTimezone string,
) ([]AvailableSlot, error) {
	if strings.TrimSpace(therapistID) == "" || strings.TrimSpace(offeringID) == "" || strings.TrimSpace(clientTimezone) == "" {
		return nil, ErrInvalidInput
	}
	if !to.After(from) || to.Sub(from) > maxSlotWindow {
		return nil, ErrInvalidDateRange
	}
	clientLoc, err := time.LoadLocation(strings.TrimSpace(clientTimezone))
	if err != nil {
		return nil, ErrInvalidTimezone
	}

	offering, err := s.offerings.GetByID(ctx, offeringID)
	if err != nil {
		return nil, err
	}
	if offering.TherapistID != therapistID {
		return nil, ErrOfferingNotFound
	}
	if !offering.IsActive {
		return nil, ErrOfferingInactive
	}

	therapistTZ := defaultTherapistTimezone
	if s.tzReader != nil {
		if tz, err := s.tzReader.GetTherapistTimezone(ctx, therapistID); err == nil && strings.TrimSpace(tz) != "" {
			therapistTZ = strings.TrimSpace(tz)
		}
	}
	therapistLoc, err := time.LoadLocation(therapistTZ)
	if err != nil {
		return nil, ErrInvalidTimezone
	}
	tehranLoc, err := time.LoadLocation(defaultTherapistTimezone)
	if err != nil {
		tehranLoc = therapistLoc
	}

	rules, err := s.rules.ListActiveByTherapist(ctx, therapistID)
	if err != nil {
		return nil, err
	}

	fromLocal := from.In(therapistLoc)
	toLocal := to.In(therapistLoc)
	startDay := time.Date(fromLocal.Year(), fromLocal.Month(), fromLocal.Day(), 0, 0, 0, 0, therapistLoc)
	endDay := time.Date(toLocal.Year(), toLocal.Month(), toLocal.Day(), 0, 0, 0, 0, therapistLoc)

	fromDateUTC := time.Date(startDay.Year(), startDay.Month(), startDay.Day(), 0, 0, 0, 0, time.UTC)
	toDateUTC := time.Date(endDay.Year(), endDay.Month(), endDay.Day(), 0, 0, 0, 0, time.UTC)
	overrides, err := s.overrides.ListByTherapistInRange(ctx, therapistID, fromDateUTC, toDateUTC)
	if err != nil {
		return nil, err
	}

	var busySlots []BusySlot
	if s.busyReader != nil {
		busySlots, err = s.busyReader.ListBusySlots(ctx, therapistID, from, to)
		if err != nil {
			return nil, err
		}
	}

	rulesByWeekday := make(map[int16][]WeeklyAvailabilityRule)
	fallbackBuffer := defaultBufferMin
	fallbackNotice := defaultMinNoticeHr
	if len(rules) > 0 {
		fallbackBuffer = rules[0].BufferMin
		fallbackNotice = rules[0].MinNoticeHr
	}
	for _, r := range rules {
		rulesByWeekday[r.WeekdaySat0] = append(rulesByWeekday[r.WeekdaySat0], r)
	}

	overridesByDay := make(map[string][]AvailabilityOverride)
	for _, ov := range overrides {
		key := ov.OverrideDate.Format("2006-01-02")
		overridesByDay[key] = append(overridesByDay[key], ov)
	}

	now := s.clock.Now()
	var slots []AvailableSlot

	for day := startDay; !day.After(endDay); day = day.AddDate(0, 0, 1) {
		dayKey := day.Format("2006-01-02")
		weekdaySat0 := int16((int(day.Weekday()) + 1) % 7)

		var windows []timeWindow
		if dayOverrides, hasOverride := overridesByDay[dayKey]; hasOverride {
			closedDay := false
			for _, ov := range dayOverrides {
				if ov.IsClosed {
					closedDay = true
					break
				}
			}
			if closedDay {
				continue
			}
			buf := fallbackBuffer
			notice := fallbackNotice
			if dayRules := rulesByWeekday[weekdaySat0]; len(dayRules) > 0 {
				buf = dayRules[0].BufferMin
				notice = dayRules[0].MinNoticeHr
			}
			for _, ov := range dayOverrides {
				if ov.StartMinute != nil && ov.EndMinute != nil {
					windows = append(windows, timeWindow{
						startMinute: *ov.StartMinute,
						endMinute:   *ov.EndMinute,
						bufferMin:   buf,
						minNoticeHr: notice,
					})
				}
			}
		} else {
			for _, r := range rulesByWeekday[weekdaySat0] {
				windows = append(windows, timeWindow{
					startMinute: r.StartMinute,
					endMinute:   r.EndMinute,
					bufferMin:   r.BufferMin,
					minNoticeHr: r.MinNoticeHr,
				})
			}
		}

		for _, w := range windows {
			minAllowed := now.Add(time.Duration(w.minNoticeHr) * time.Hour)
			cursor := w.startMinute
			for cursor+offering.DurationMin <= w.endMinute {
				slotStart := time.Date(day.Year(), day.Month(), day.Day(), 0, int(cursor), 0, 0, therapistLoc)
				slotEnd := slotStart.Add(time.Duration(offering.DurationMin) * time.Minute)
				cursor += offering.DurationMin + w.bufferMin

				if slotStart.Before(from) || slotEnd.After(to) {
					continue
				}
				if slotStart.Before(minAllowed) {
					continue
				}
				if overlapsBusy(slotStart, slotEnd, busySlots) {
					continue
				}

				tehranStart := slotStart.In(tehranLoc)
				tehranEnd := slotEnd.In(tehranLoc)
				clientStart := slotStart.In(clientLoc)
				clientEnd := slotEnd.In(clientLoc)

				slots = append(slots, AvailableSlot{
					StartAt:        slotStart.UTC(),
					EndAt:          slotEnd.UTC(),
					Track:          offering.Track,
					ClientTimezone: clientLoc.String(),
					TehranStart:    tehranStart,
					TehranEnd:      tehranEnd,
					ClientStart:    clientStart,
					ClientEnd:      clientEnd,
					TehranLabel:    tehranStart.Format("2006-01-02 15:04"),
					ClientLabel:    clientStart.Format("2006-01-02 15:04"),
				})
			}
		}
	}

	sort.Slice(slots, func(i, j int) bool {
		return slots[i].StartAt.Before(slots[j].StartAt)
	})
	return slots, nil
}

type timeWindow struct {
	startMinute int16
	endMinute   int16
	bufferMin   int16
	minNoticeHr int16
}

func overlapsBusy(start, end time.Time, busy []BusySlot) bool {
	for _, b := range busy {
		if start.Before(b.EndAt) && end.After(b.StartAt) {
			return true
		}
	}
	return false
}
