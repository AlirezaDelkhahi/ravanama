package postgres

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
)

// ObjectPutter uploads seed objects to object storage without coupling postgres to storage internals.
type ObjectPutter interface {
	PutObject(ctx context.Context, bucket media.BucketKind, key string, mimeType media.AllowedMIMEType, data []byte) error
}

func deterministicUUID(name string) string {
	return uuid.NewSHA1(uuid.NameSpaceDNS, []byte("ravannama-seed:"+name)).String()
}

// SeedPilotData idempotently populates the local pilot dataset (4 therapists, offerings,
// weekly rules, overrides, blog posts, verified reviews, pilot client, 4 bookings, and a real PNG receipt).
func SeedPilotData(ctx context.Context, pool *pgxpool.Pool, storage ObjectPutter) error {
	now := time.Now().UTC().Truncate(time.Minute)

	// Deterministic IDs
	saraUserID := deterministicUUID("user:dr-sara-ahmadi")
	kavehUserID := deterministicUUID("user:dr-kaveh-rezaei")
	minaUserID := deterministicUUID("user:dr-mina-farhadi")
	omidUserID := deterministicUUID("user:dr-omid-nikzad")
	clientNegarID := deterministicUUID("user:client-negar")
	clientPastID := deterministicUUID("user:client-historical")

	saraID := deterministicUUID("therapist:dr-sara-ahmadi")
	kavehID := deterministicUUID("therapist:dr-kaveh-rezaei")
	minaID := deterministicUUID("therapist:dr-mina-farhadi")
	omidID := deterministicUUID("therapist:dr-omid-nikzad")

	saraOffIranInd := deterministicUUID("offering:sara-iran-ind")
	saraOffIranCouple := deterministicUUID("offering:sara-iran-couple")
	saraOffAbroadUSD := deterministicUUID("offering:sara-abroad-usd")
	saraOffAbroadEUR := deterministicUUID("offering:sara-abroad-eur")

	kavehOffIran := deterministicUUID("offering:kaveh-iran")
	kavehOffAbroad := deterministicUUID("offering:kaveh-abroad")
	minaOffIran := deterministicUUID("offering:mina-iran")
	minaOffAbroad := deterministicUUID("offering:mina-abroad")
	omidOffIran := deterministicUUID("offering:omid-iran")

	// Build valid PNG receipt binary upfront and upload to private S3 bucket if storage is provided.
	receiptPNG, err := buildSampleReceiptPNG()
	if err != nil {
		return fmt.Errorf("build sample receipt png: %w", err)
	}
	receiptSum := sha256.Sum256(receiptPNG)
	receiptSHA := hex.EncodeToString(receiptSum[:])
	receiptMediaID := deterministicUUID("media:pilot-negar-pending-receipt")
	receiptKey := fmt.Sprintf("receipts/%s/%s.png", clientNegarID, receiptMediaID)

	if storage != nil {
		if err := storage.PutObject(ctx, media.BucketPrivate, receiptKey, media.MIMETypePNG, receiptPNG); err != nil {
			return fmt.Errorf("put seed receipt png: %w", err)
		}
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	// 1. Seed users
	type seedUser struct {
		id, role, name string
		phone, email   *string
	}
	strPtr := func(s string) *string { return &s }

	users := []seedUser{
		{saraUserID, "therapist", "دکتر سارا احمدی", strPtr("+989121112233"), strPtr("sara.ahmadi@ravannama.ir")},
		{kavehUserID, "therapist", "دکتر کاوه رضایی", strPtr("+989121112244"), strPtr("kaveh.rezaei@ravannama.ir")},
		{minaUserID, "therapist", "دکتر مینا فرهادی", strPtr("+989121112255"), strPtr("mina.farhadi@ravannama.ir")},
		{omidUserID, "therapist", "دکتر امید نیکزاد", strPtr("+989121112266"), strPtr("omid.nikzad@ravannama.ir")},
		{clientNegarID, "client", "نگار موسوی", strPtr("+989123456789"), nil},
		{clientPastID, "client", "آرش کریمی", strPtr("+989129998877"), nil},
	}
	for _, u := range users {
		if _, err := tx.Exec(ctx, `
			INSERT INTO identity.users (id, role, full_name, phone_e164, email, locale, created_at, updated_at)
			VALUES ($1, $2, $3, $4, $5, 'fa-IR', $6, $6)
			ON CONFLICT (id) DO NOTHING
		`, u.id, u.role, u.name, u.phone, u.email, now); err != nil {
			return fmt.Errorf("seed user %s: %w", u.name, err)
		}
	}

	// 2. Seed therapists
	type seedTherapist struct {
		id, userID, slug, displayName, headline, bio, license string
		years                                                int16
		tags                                                 []string
		edu                                                  []map[string]string
		avatar                                               string
		defaultCall                                          string
		optIn, reviews                                       bool
	}

	therapists := []seedTherapist{
		{
			id:          saraID,
			userID:      saraUserID,
			slug:        "dr-sara-ahmadi",
			displayName: "دکتر سارا احمدی",
			headline:    "روانشناس بالینی و زوج‌درمانگر · رویکرد ACT و طرحواره‌درمانی",
			bio:         "بیش از ۱۲ سال تجربه بالینی در مشاوره فردی، درمان اضطراب، فرسودگی شغلی و زوج‌درمانی برای مراجعان داخل ایران و ایرانیان مقیم خارج از کشور.",
			license:     "۴۸۲۹۱",
			years:       12,
			tags:        []string{"اضطراب و وسواس", "زوج‌درمانی", "رویکرد ACT", "مهاجرت و هویت", "فرسودگی شغلی", "طرحواره‌درمانی"},
			edu: []map[string]string{
				{"degree": "دکترای تخصصی روانشناسی بالینی", "institution": "دانشگاه تهران", "start_jalali": "۱۳۹۳", "end_jalali": "۱۳۹۷"},
				{"degree": "کارشناسی ارشد روانشناسی بالینی", "institution": "دانشگاه شهید بهشتی", "start_jalali": "۱۳۹۰", "end_jalali": "۱۳۹۲"},
			},
			avatar:      "/images/therapist-sara.jpg",
			defaultCall: "https://meet.google.com/ravan-sara-act",
			optIn:       true,
			reviews:     true,
		},
		{
			id:          kavehID,
			userID:      kavehUserID,
			slug:        "dr-kaveh-rezaei",
			displayName: "دکتر کاوه رضایی",
			headline:    "روانشناس سلامت و درمانگر شناختی-رفتاری (CBT)",
			bio:         "تمرکز تخصصی بر اختلالات خواب، مدیریت استرس، افسردگی و تنظیم هیجان در بزرگسالان.",
			license:     "۵۱۹۰۲",
			years:       9,
			tags:        []string{"درمان CBT", "افسردگی", "اختلال خواب", "مدیریت استرس", "تنظیم هیجان"},
			edu: []map[string]string{
				{"degree": "دکترای روانشناسی سلامت", "institution": "دانشگاه علامه طباطبایی", "start_jalali": "۱۳۹۴", "end_jalali": "۱۳۹۸"},
			},
			avatar:      "/images/therapist-kaveh.jpg",
			defaultCall: "https://meet.google.com/ravan-kaveh-cbt",
			optIn:       true,
			reviews:     true,
		},
		{
			id:          minaID,
			userID:      minaUserID,
			slug:        "dr-mina-farhadi",
			displayName: "دکتر مینا فرهادی",
			headline:    "مشاور خانواده، نوجوان و روابط بین‌فرهنگی",
			bio:         "همراهی با خانواده‌ها و زوج‌های دوفرهنگی برای بازسازی گفتگو، مرزهای سالم و فرزندپروری آگاهانه.",
			license:     "۶۰۳۱۸",
			years:       8,
			tags:        []string{"مشاوره خانواده", "نوجوانان", "روابط بین‌فرهنگی", "فرزندپروری"},
			edu: []map[string]string{
				{"degree": "دکترای مشاوره خانواده", "institution": "دانشگاه خوارزمی", "start_jalali": "۱۳۹۵", "end_jalali": "۱۳۹۹"},
			},
			avatar:      "/images/therapist-mina.jpg",
			defaultCall: "https://meet.google.com/ravan-mina-fam",
			optIn:       true,
			reviews:     true,
		},
		{
			id:          omidID,
			userID:      omidUserID,
			slug:        "dr-omid-nikzad",
			displayName: "دکتر امید نیکزاد",
			headline:    "روان‌پژوه و روان‌درمانگر تحلیلی",
			bio:         "ارائه جلسات روان‌درمانی پویشی کوتاه‌مدت به‌صورت خصوصی با معرفی همکاران.",
			license:     "۷۱۲۰۵",
			years:       11,
			tags:        []string{"روان‌درمانی تحلیلی", "ISTDP", "روابط عاطفی"},
			edu: []map[string]string{
				{"degree": "دکترای روانشناسی بالینی", "institution": "دانشگاه شیراز", "start_jalali": "۱۳۹۲", "end_jalali": "۱۳۹۶"},
			},
			avatar:      "/images/therapist-omid.svg",
			defaultCall: "https://meet.google.com/ravan-omid-istdp",
			optIn:       false,
			reviews:     false,
		},
	}

	policyFa := "لطفاً حداقل ۲۴ ساعت پیش از شروع جلسه در صورت نیاز به تغییر زمان اطلاع دهید. لغو در کمتر از ۲۴ ساعت امکان بازپرداخت ندارد."
	for _, th := range therapists {
		eduJSON, err := json.Marshal(th.edu)
		if err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO tenant.therapists (
				id, user_id, slug, display_name, headline, bio_markdown, license_number,
				years_experience, focus_tags, education_timeline, avatar_object_key,
				default_call_url, directory_opt_in, reviews_enabled, timezone,
				cancellation_policy_fa, created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5, $6, $7,
				$8, $9, $10, $11,
				$12, $13, $14, 'Asia/Tehran',
				$15, $16, $16
			)
			ON CONFLICT (id) DO NOTHING
		`, th.id, th.userID, th.slug, th.displayName, th.headline, th.bio, th.license,
			th.years, th.tags, eduJSON, th.avatar, th.defaultCall, th.optIn, th.reviews, policyFa, now); err != nil {
			return fmt.Errorf("seed therapist %s: %w", th.slug, err)
		}
	}

	// 3. Seed payment accounts for dr-sara-ahmadi (and Track A for others)
	type seedPayAcc struct {
		id, therapistID, track, method, label, dest, holder string
	}
	payAccounts := []seedPayAcc{
		{deterministicUUID("pay:sara-card"), saraID, "iran", "card_to_card", "کارت بانک سامان", "6219861048291042", "سارا احمدی"},
		{deterministicUUID("pay:sara-sheba"), saraID, "iran", "sheba", "شماره شبا بانک سامان", "IR560560081080004829104201", "سارا احمدی"},
		{deterministicUUID("pay:sara-paypal"), saraID, "abroad", "paypal", "PayPal (Friends & Family)", "sara.ahmadi.therapy@paypal.example", "Sara Ahmadi"},
		{deterministicUUID("pay:sara-iban"), saraID, "abroad", "iban", "DE IBAN (SEPA)", "DE89370400440532013000", "Sara Ahmadi"},
		{deterministicUUID("pay:sara-usdt"), saraID, "abroad", "usdt", "USDT (TRC-20)", "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE", "Sara Ahmadi"},
		{deterministicUUID("pay:kaveh-card"), kavehID, "iran", "card_to_card", "کارت بانک ملت", "6104337948102934", "کاوه رضایی"},
		{deterministicUUID("pay:kaveh-paypal"), kavehID, "abroad", "paypal", "PayPal", "kaveh.rezaei@paypal.example", "Kaveh Rezaei"},
		{deterministicUUID("pay:mina-card"), minaID, "iran", "card_to_card", "کارت بانک پاسارگاد", "5022291038471920", "مینا فرهادی"},
		{deterministicUUID("pay:mina-iban"), minaID, "abroad", "iban", "NL IBAN (SEPA)", "NL91ABNA0417164300", "Mina Farhadi"},
		{deterministicUUID("pay:omid-card"), omidID, "iran", "card_to_card", "کارت بانک پارسیان", "6221061094827103", "امید نیکزاد"},
	}
	for _, p := range payAccounts {
		if _, err := tx.Exec(ctx, `
			INSERT INTO tenant.therapist_payment_accounts (
				id, therapist_id, track, method, account_label, destination_val, holder_name, is_active, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, true, $8, $8)
			ON CONFLICT (id) DO NOTHING
		`, p.id, p.therapistID, p.track, p.method, p.label, p.dest, p.holder, now); err != nil {
			return fmt.Errorf("seed payment account %s: %w", p.label, err)
		}
	}

	// 4. Seed service offerings
	type seedOffering struct {
		id, therapistID, track, title, desc string
		duration                            int16
		currency                            string
		price                               int64
		sortOrder                           int16
	}
	offerings := []seedOffering{
		{saraOffIranInd, saraID, "iran", "مشاوره فردی آنلاین", "جلسه ۵۰ دقیقه‌ای ارزیابی، اضطراب یا درمان فردی با رویکرد ACT", 50, "IRT", 950000, 1},
		{saraOffIranCouple, saraID, "iran", "زوج‌درمانی آنلاین", "جلسه ۷۵ دقیقه‌ای ویژه زوج‌ها برای بهبود الگوهای ارتباطی", 75, "IRT", 1350000, 2},
		{saraOffAbroadUSD, saraID, "abroad", "Individual Therapy (USD)", "50-minute online individual session in Persian or English", 50, "USD", 4000, 1},
		{saraOffAbroadEUR, saraID, "abroad", "Couples Therapy (EUR)", "75-minute online couples session tailored for diaspora couples", 75, "EUR", 5500, 2},
		{kavehOffIran, kavehID, "iran", "مشاوره فردی CBT", "جلسه ۵۰ دقیقه‌ای درمان شناختی-رفتاری اضطراب و خواب", 50, "IRT", 890000, 1},
		{kavehOffAbroad, kavehID, "abroad", "CBT Online Session (USD)", "50-minute structured CBT session", 50, "USD", 3800, 1},
		{minaOffIran, minaID, "iran", "مشاوره خانواده و نوجوان", "جلسه ۶۰ دقیقه‌ای خانواده یا نوجوان", 60, "IRT", 920000, 1},
		{minaOffAbroad, minaID, "abroad", "Family & Cross-Cultural (EUR)", "60-minute online family session", 60, "EUR", 4500, 1},
		{omidOffIran, omidID, "iran", "روان‌درمانی تحلیلی", "جلسه ۵۰ دقیقه‌ای روان‌درمانی پویشی", 50, "IRT", 1100000, 1},
	}
	for _, o := range offerings {
		if _, err := tx.Exec(ctx, `
			INSERT INTO scheduling.service_offerings (
				id, therapist_id, track, title, description, duration_min, currency, price_amount, is_active, sort_order, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9, $10)
			ON CONFLICT (id) DO NOTHING
		`, o.id, o.therapistID, o.track, o.title, o.desc, o.duration, o.currency, o.price, o.sortOrder, now); err != nil {
			return fmt.Errorf("seed offering %s: %w", o.title, err)
		}
	}

	// 5. Seed weekly rules (Sat=0 .. Wed=4, 10:00-13:00 and 16:00-20:00, buffer=10, min_notice=2)
	for _, tid := range []string{saraID, kavehID, minaID, omidID} {
		for day := int16(0); day <= 4; day++ {
			morningID := deterministicUUID(fmt.Sprintf("rule:%s:%d:am", tid, day))
			eveningID := deterministicUUID(fmt.Sprintf("rule:%s:%d:pm", tid, day))
			if _, err := tx.Exec(ctx, `
				INSERT INTO scheduling.weekly_availability_rules (
					id, therapist_id, weekday_sat0, start_minute, end_minute, buffer_min, min_notice_hr, is_active
				) VALUES
					($1, $2, $3, 600, 780, 10, 2, true),
					($4, $2, $3, 960, 1200, 10, 2, true)
				ON CONFLICT (id) DO NOTHING
			`, morningID, tid, day, eveningID); err != nil {
				return fmt.Errorf("seed weekly rules for %s: %w", tid, err)
			}
		}
	}

	// 6. Seed 2 upcoming availability overrides for dr-sara-ahmadi
	ovDate1 := now.AddDate(0, 0, 3)
	ovDate2 := now.AddDate(0, 0, 7)
	ov1ID := deterministicUUID("override:sara:custom-hours")
	ov2ID := deterministicUUID("override:sara:closed")
	if _, err := tx.Exec(ctx, `
		INSERT INTO scheduling.availability_overrides (
			id, therapist_id, override_date, is_closed, start_minute, end_minute, reason
		) VALUES
			($1, $2, $3::date, false, 660, 840, 'ساعت ویژه کارگاه آموزشی'),
			($4, $2, $5::date, true, NULL, NULL, 'مرخصی روزانه')
		ON CONFLICT DO NOTHING
	`, ov1ID, saraID, ovDate1.Format("2006-01-02"), ov2ID, ovDate2.Format("2006-01-02")); err != nil {
		return fmt.Errorf("seed overrides: %w", err)
	}

	// 7. Seed blog posts
	type seedPost struct {
		id, therapistID, slug, title, excerpt, body, cover string
		readingMin                                         int16
		publishedAt                                        time.Time
	}
	posts := []seedPost{
		{
			id:          deterministicUUID("post:sara-anxiety"),
			therapistID: saraID,
			slug:        "act-for-daily-anxiety",
			title:       "چگونه با رویکرد ACT اضطراب روزمره را مدیریت کنیم؟",
			excerpt:     "آشنایی با تکنیک‌های پذیرش و تعهد برای کاهش درگیری ذهنی با افکار نگران‌کننده.",
			body:        "## پذیرش به‌جای جنگیدن با اضطراب\n\nدر رویکرد درمان مبتنی بر پذیرش و تعهد (ACT)، هدف حذف کامل اضطراب نیست؛ بلکه ایجاد فضای امن برای حضور ذهن و حرکت به‌سوی ارزش‌های زندگی است.\n\n### تمرین گسلش شناختی\n\nوقتی فکری نگران‌کننده به ذهن می‌آید، به‌جای هم‌ذات‌پنداری با آن، بگویید: «ذهنم اکنون این فکر را تولید می‌کند که...».",
			cover:       "/images/blog-anxiety.jpg",
			readingMin:  6,
			publishedAt: now.Add(-10 * 24 * time.Hour),
		},
		{
			id:          deterministicUUID("post:sara-couples"),
			therapistID: saraID,
			slug:        "couples-communication-patterns",
			title:       "چرخه سکوت و انتقاد در روابط زوج‌ها و راه خروج از آن",
			excerpt:     "شناخت الگوهای تکرارشونده تعارض در زوجین و بازسازی گفتگوی امن.",
			body:        "## چرا بحث‌های زوج‌ها تکراری می‌شوند؟\n\nبسیاری از زوج‌ها بر سر موضوعات سطحی بحث نمی‌کنند؛ بلکه نیازهای عاطفی دیده‌نشده در پس انتقاد یا کناره‌گیری پنهان شده‌اند.\n\n### مکث ۹۰ ثانیه‌ای\n\nدر لحظه بالا رفتن هیجان، یک مکث کوتاه به سیستم عصبی فرصت بازگشت به تعادل می‌دهد.",
			cover:       "/images/blog-couples.jpg",
			readingMin:  5,
			publishedAt: now.Add(-6 * 24 * time.Hour),
		},
		{
			id:          deterministicUUID("post:sara-diaspora"),
			therapistID: saraID,
			slug:        "diaspora-belonging-and-identity",
			title:       "حس تعلق و فرسودگی عاطفی در سال‌های نخست مهاجرت",
			excerpt:     "نگاهی بالینی به سوگ مهاجرت، دلتنگی و بازسازی ریشه‌های هویتی در کشور جدید.",
			body:        "## سوگ بی‌صدا در مهاجرت\n\nمهاجرت تنها تغییر جغرافیا نیست؛ سوگ از دست دادن زبان روزمره، شبکه‌های حمایتی و حس آشنا بودن است.\n\n### ساختن لنگرهای روزانه\n\nحفظ ارتباط معنادار با فرهنگ مبدأ در کنار پذیرش تدریجی محیط جدید، تاب‌آوری روانی را تقویت می‌کند.",
			cover:       "/images/blog-diaspora.jpg",
			readingMin:  7,
			publishedAt: now.Add(-2 * 24 * time.Hour),
		},
		{
			id:          deterministicUUID("post:kaveh-sleep"),
			therapistID: kavehID,
			slug:        "cbt-i-for-better-sleep",
			title:       "اصول درمان شناختی-رفتاری بی‌خوابی (CBT-I) بدون دارو",
			excerpt:     "تنظیم ساعت زیستی و شکستن چرخه نگرانی از بی‌خوابی شبانه.",
			body:        "## بهداشت خواب کافی نیست\n\nاگر بیش از ۲۰ دقیقه در رختخواب بیدار هستید، برخاستن و انجام فعالیت آرام با نور کم، شرطی‌شدن ذهن با اضطراب رختخواب را کاهش می‌دهد.",
			cover:       "/images/blog-anxiety.jpg",
			readingMin:  5,
			publishedAt: now.Add(-5 * 24 * time.Hour),
		},
		{
			id:          deterministicUUID("post:mina-teen"),
			therapistID: minaID,
			slug:        "building-trust-with-teenagers",
			title:       "مرزهای سالم و گفتگوی بدون قضاوت با نوجوانان",
			excerpt:     "راهکارهای عملی برای والدین جهت حفظ پیوند عاطفی در دوران بلوغ و تغییر.",
			body:        "## شنیدن پیش از نصیحت\n\nنوجوانی که احساس کند شنیده می‌شود، با مقاومت کمتری قوانین و مرزهای توافق‌شده خانوادگی را می‌پذیرد.",
			cover:       "/images/blog-couples.jpg",
			readingMin:  4,
			publishedAt: now.Add(-4 * 24 * time.Hour),
		},
	}
	for _, p := range posts {
		if _, err := tx.Exec(ctx, `
			INSERT INTO content.blog_posts (
				id, therapist_id, slug, title, excerpt, body_markdown, cover_object_key,
				seo_title, seo_description, reading_min, status, published_at, created_at, updated_at
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $4, $5, $8, 'published', $9, $9, $9)
			ON CONFLICT (therapist_id, slug) DO NOTHING
		`, p.id, p.therapistID, p.slug, p.title, p.excerpt, p.body, p.cover, p.readingMin, p.publishedAt); err != nil {
			return fmt.Errorf("seed blog post %s: %w", p.slug, err)
		}
	}

	// 8. Seed pilot bookings (idempotent by deterministic ID check so repeat runs never hit EXCLUDE)
	type seedBooking struct {
		id, ref, therapistID, clientID, offeringID, track, tz, currency string
		slotStart, slotEnd                                              time.Time
		amount                                                          int64
		status, idemKey                                                 string
		holdExpires, rejectionReason, callURL                           any
		clientNote                                                      string
	}

	pilotBookings := []seedBooking{
		// Pilot client Negar's 4 bookings under dr-sara-ahmadi
		{
			id:          deterministicUUID("booking:negar-confirmed"),
			ref:         "RN-1042A1",
			therapistID: saraID,
			clientID:    clientNegarID,
			offeringID:  saraOffIranInd,
			track:       "iran",
			tz:          "Asia/Tehran",
			currency:    "IRT",
			slotStart:   now.Add(26 * time.Hour),
			slotEnd:     now.Add(26*time.Hour + 50*time.Minute),
			amount:      950000,
			status:      "confirmed",
			idemKey:     "seed-negar-confirmed",
			callURL:     "https://meet.google.com/ravan-sara-act",
			clientNote:  "جلسه پیگیری اضطراب",
		},
		{
			id:              deterministicUUID("booking:negar-rejected"),
			ref:             "RN-1042B2",
			therapistID:     saraID,
			clientID:        clientNegarID,
			offeringID:      saraOffIranCouple,
			track:           "iran",
			tz:              "Asia/Tehran",
			currency:        "IRT",
			slotStart:       now.Add(48 * time.Hour),
			slotEnd:         now.Add(48*time.Hour + 75*time.Minute),
			amount:          1350000,
			status:          "rejected",
			idemKey:         "seed-negar-rejected",
			rejectionReason: "تصویر رسید ناخوانا است و مبلغ واریزی مشخص نیست",
			clientNote:      "درخواست مشاوره زوجین",
		},
		{
			id:          deterministicUUID("booking:negar-completed"),
			ref:         "RN-1042C3",
			therapistID: saraID,
			clientID:    clientNegarID,
			offeringID:  saraOffIranInd,
			track:       "iran",
			tz:          "Asia/Tehran",
			currency:    "IRT",
			slotStart:   now.Add(-72 * time.Hour),
			slotEnd:     now.Add(-72*time.Hour + 50*time.Minute),
			amount:      950000,
			status:      "completed",
			idemKey:     "seed-negar-completed",
			callURL:     "https://meet.google.com/ravan-sara-act",
			clientNote:  "اولین جلسه ارزیابی",
		},
		{
			id:          deterministicUUID("booking:negar-pending"),
			ref:         "RN-1042D4",
			therapistID: saraID,
			clientID:    clientNegarID,
			offeringID:  saraOffIranInd,
			track:       "iran",
			tz:          "Asia/Tehran",
			currency:    "IRT",
			slotStart:   now.Add(74 * time.Hour),
			slotEnd:     now.Add(74*time.Hour + 50*time.Minute),
			amount:      950000,
			status:      "pending_verification",
			idemKey:     "seed-negar-pending",
			clientNote:  "ارسال رسید کارت به کارت",
		},
		// Historical completed bookings backing verified reviews
		{
			id:          deterministicUUID("booking:hist-sara-1"),
			ref:         "RN-0911A1",
			therapistID: saraID,
			clientID:    clientPastID,
			offeringID:  saraOffIranInd,
			track:       "iran",
			tz:          "Asia/Tehran",
			currency:    "IRT",
			slotStart:   now.Add(-14 * 24 * time.Hour),
			slotEnd:     now.Add(-14*24*time.Hour + 50*time.Minute),
			amount:      950000,
			status:      "completed",
			idemKey:     "seed-hist-sara-1",
			callURL:     "https://meet.google.com/ravan-sara-act",
		},
		{
			id:          deterministicUUID("booking:hist-sara-2"),
			ref:         "RN-0912B2",
			therapistID: saraID,
			clientID:    clientPastID,
			offeringID:  saraOffAbroadUSD,
			track:       "abroad",
			tz:          "Europe/Berlin",
			currency:    "USD",
			slotStart:   now.Add(-9 * 24 * time.Hour),
			slotEnd:     now.Add(-9*24*time.Hour + 50*time.Minute),
			amount:      4000,
			status:      "completed",
			idemKey:     "seed-hist-sara-2",
			callURL:     "https://meet.google.com/ravan-sara-act",
		},
		{
			id:          deterministicUUID("booking:hist-kaveh-1"),
			ref:         "RN-0913C3",
			therapistID: kavehID,
			clientID:    clientPastID,
			offeringID:  kavehOffIran,
			track:       "iran",
			tz:          "Asia/Tehran",
			currency:    "IRT",
			slotStart:   now.Add(-11 * 24 * time.Hour),
			slotEnd:     now.Add(-11*24*time.Hour + 50*time.Minute),
			amount:      890000,
			status:      "completed",
			idemKey:     "seed-hist-kaveh-1",
			callURL:     "https://meet.google.com/ravan-kaveh-cbt",
		},
		{
			id:          deterministicUUID("booking:hist-mina-1"),
			ref:         "RN-0914D4",
			therapistID: minaID,
			clientID:    clientPastID,
			offeringID:  minaOffIran,
			track:       "iran",
			tz:          "Asia/Tehran",
			currency:    "IRT",
			slotStart:   now.Add(-10 * 24 * time.Hour),
			slotEnd:     now.Add(-10*24*time.Hour + 60*time.Minute),
			amount:      920000,
			status:      "completed",
			idemKey:     "seed-hist-mina-1",
			callURL:     "https://meet.google.com/ravan-mina-fam",
		},
	}

	for _, b := range pilotBookings {
		var exists bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM booking.bookings WHERE id = $1)`, b.id).Scan(&exists); err != nil {
			return fmt.Errorf("check booking %s: %w", b.ref, err)
		}
		if exists {
			continue
		}
		if _, err := tx.Exec(ctx, `
			INSERT INTO booking.bookings (
				id, reference_code, therapist_id, client_user_id, service_offering_id,
				payment_source, track, client_timezone, slot_range, currency,
				amount_expected, commission_bps, status, idempotency_key,
				hold_expires_at, client_note, rejection_reason, call_join_url,
				created_at, updated_at
			) VALUES (
				$1, $2, $3, $4, $5,
				'manual_receipt', $6, $7, tstzrange($8::timestamptz, $9::timestamptz, '[)'), $10,
				$11, 0, $12, $13,
				$14, $15, $16, $17,
				$18, $18
			)
		`, b.id, b.ref, b.therapistID, b.clientID, b.offeringID,
			b.track, b.tz, b.slotStart, b.slotEnd, b.currency,
			b.amount, b.status, b.idemKey,
			b.holdExpires, b.clientNote, b.rejectionReason, b.callURL, now); err != nil {
			return fmt.Errorf("seed booking %s: %w", b.ref, err)
		}
	}

	// 9. Seed confirmed media_object + booking_receipt for Negar's pending_verification booking
	if _, err := tx.Exec(ctx, `
		INSERT INTO media.media_objects (
			id, owner_user_id, bucket_kind, object_key, mime_type, size_bytes,
			status, sha256_hex, created_at, confirmed_at
		) VALUES (
			$1, $2, 'private', $3, 'image/png', $4,
			'confirmed', $5, $6, $6
		)
		ON CONFLICT (id) DO NOTHING
	`, receiptMediaID, clientNegarID, receiptKey, int64(len(receiptPNG)), receiptSHA, now); err != nil {
		return fmt.Errorf("seed receipt media object: %w", err)
	}

	pendingBookingID := deterministicUUID("booking:negar-pending")
	receiptID := deterministicUUID("receipt:negar-pending")
	if _, err := tx.Exec(ctx, `
		INSERT INTO booking.booking_receipts (
			id, booking_id, media_object_id, tracking_code, submitted_at
		) VALUES ($1, $2, $3, '98451237', $4)
		ON CONFLICT (booking_id) DO NOTHING
	`, receiptID, pendingBookingID, receiptMediaID, now); err != nil {
		return fmt.Errorf("seed booking receipt: %w", err)
	}

	// 10. Seed verified published reviews
	type seedReview struct {
		id, bookingID, therapistID, label, comment string
		rating                                     int16
	}
	reviews := []seedReview{
		{
			id:          deterministicUUID("review:sara-1"),
			bookingID:   deterministicUUID("booking:hist-sara-1"),
			therapistID: saraID,
			label:       "مراجع فردی · آبان ۱۴۰۵",
			rating:      5,
			comment:     "فضای جلسات بسیار آرام و بدون قضاوت بود و تمرین‌های عملی ACT در مدیریت اضطراب روزانه‌ام بسیار مؤثر واقع شد.",
		},
		{
			id:          deterministicUUID("review:sara-2"),
			bookingID:   deterministicUUID("booking:hist-sara-2"),
			therapistID: saraID,
			label:       "مراجع خارج از کشور · آذر ۱۴۰۵",
			rating:      5,
			comment:     "درک عمیق ایشان از چالش‌های مهاجرت و هماهنگی دقیق ساعت جلسات به وقت اروپا باعث شد با اطمینان درمان را ادامه دهم.",
		},
		{
			id:          deterministicUUID("review:kaveh-1"),
			bookingID:   deterministicUUID("booking:hist-kaveh-1"),
			therapistID: kavehID,
			label:       "مراجع فردی · آبان ۱۴۰۵",
			rating:      5,
			comment:     "ساختار منظم جلسات CBT به بهبود کیفیت خواب و کاهش نشخوار فکری من کمک زیادی کرد.",
		},
		{
			id:          deterministicUUID("review:mina-1"),
			bookingID:   deterministicUUID("booking:hist-mina-1"),
			therapistID: minaID,
			label:       "مشاوره خانواده · آبان ۱۴۰۵",
			rating:      5,
			comment:     "همدلی و راهنمایی‌های کاربردی دکتر فرهادی ارتباط ما با فرزند نوجوانمان را بسیار صمیمی‌تر کرد.",
		},
	}
	for _, rev := range reviews {
		if _, err := tx.Exec(ctx, `
			INSERT INTO content.reviews (
				id, booking_id, therapist_id, client_label, rating, comment, is_published, created_at
			) VALUES ($1, $2, $3, $4, $5, $6, true, $7)
			ON CONFLICT (booking_id) DO NOTHING
		`, rev.id, rev.bookingID, rev.therapistID, rev.label, rev.rating, rev.comment, now); err != nil {
			return fmt.Errorf("seed review %s: %w", rev.id, err)
		}
	}

	return tx.Commit(ctx)
}

func buildSampleReceiptPNG() ([]byte, error) {
	const w, h = 320, 200
	img := image.NewRGBA(image.Rect(0, 0, w, h))

	bg := color.RGBA{R: 250, G: 248, B: 245, A: 255}
	border := color.RGBA{R: 227, G: 221, B: 211, A: 255}
	accent := color.RGBA{R: 45, G: 106, B: 98, A: 255}
	ink := color.RGBA{R: 31, G: 41, B: 39, A: 255}
	muted := color.RGBA{R: 242, G: 239, B: 233, A: 255}

	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, bg)
		}
	}
	// Outer border
	for x := 8; x < w-8; x++ {
		img.Set(x, 8, border)
		img.Set(x, h-9, border)
	}
	for y := 8; y < h-8; y++ {
		img.Set(8, y, border)
		img.Set(w-9, y, border)
	}
	// Header accent bar
	for y := 16; y < 48; y++ {
		for x := 16; x < w-16; x++ {
			img.Set(x, y, accent)
		}
	}
	// Receipt summary blocks
	for y := 64; y < 80; y++ {
		for x := 24; x < 180; x++ {
			img.Set(x, y, ink)
		}
	}
	for y := 92; y < 140; y++ {
		for x := 24; x < w-24; x++ {
			img.Set(x, y, muted)
		}
	}
	for y := 152; y < 166; y++ {
		for x := 24; x < 220; x++ {
			img.Set(x, y, accent)
		}
	}

	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
