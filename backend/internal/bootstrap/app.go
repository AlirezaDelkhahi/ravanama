package bootstrap

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/ravannama/ravannama/backend/internal/adapters/dns"
	"github.com/ravannama/ravannama/backend/internal/adapters/notify"
	"github.com/ravannama/ravannama/backend/internal/adapters/postgres"
	"github.com/ravannama/ravannama/backend/internal/adapters/ratelimit"
	"github.com/ravannama/ravannama/backend/internal/adapters/storage"
	"github.com/ravannama/ravannama/backend/internal/domain/booking"
	"github.com/ravannama/ravannama/backend/internal/domain/content"
	"github.com/ravannama/ravannama/backend/internal/domain/identity"
	"github.com/ravannama/ravannama/backend/internal/domain/media"
	"github.com/ravannama/ravannama/backend/internal/domain/scheduling"
	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
	"github.com/ravannama/ravannama/backend/migrations"
)

const (
	holdExpirySweepInterval = 30 * time.Second
	cleanupSweepInterval    = 5 * time.Minute
)

// Config holds runtime configuration for the modular monolith.
type Config struct {
	Port             string
	PlatformDomain   string
	LogLevel         slog.Level
	DatabaseURL      string
	S3Endpoint       string
	S3PublicEndpoint string
	S3Region         string
	S3AccessKey      string
	S3SecretKey      string
	S3PublicBucket   string
	S3PrivateBucket  string
	OTPPepper         string
	CookieSecure      bool
	TrustProxyHeaders bool
	AutoMigrate       bool
	SeedPilotData     bool
	DevOTPSinkFile    string
}

// Services holds domain service interfaces and ports wired into transport and workers.
type Services struct {
	TLSDomainChecker tenant.TLSDomainChecker
	Identity         identity.AuthService
	Tenant           tenant.TenantService
	Scheduling       scheduling.SchedulingService
	Booking          booking.BookingService
	Media            media.MediaService
	Content          content.ContentService
}

// App encapsulates the wired HTTP handler and background ticker workers.
type App struct {
	cfg      Config
	logger   *slog.Logger
	handler  http.Handler
	services Services
	testEnv  *TestEnv
}

type realClock struct{}

func (realClock) Now() time.Time {
	return time.Now().UTC()
}

// NewApp constructs the production application scaffold when no DB is configured.
func NewApp(cfg Config, logger *slog.Logger) *App {
	return NewAppWithServices(cfg, logger, Services{
		TLSDomainChecker: noopTLSDomainChecker{},
	})
}

// NewAppFromEnv connects PostgreSQL + S3 + adapters, runs optional idempotent migration/seed,
// and returns a fully wired *App alongside a cleanup function.
func NewAppFromEnv(ctx context.Context, cfg Config, logger *slog.Logger) (*App, func(), error) {
	if logger == nil {
		logger = httptransport.NewRedactingLogger(io.Discard, cfg.LogLevel)
	}
	if strings.TrimSpace(cfg.DatabaseURL) == "" {
		return nil, nil, fmt.Errorf("DATABASE_URL is required")
	}
	if strings.TrimSpace(cfg.OTPPepper) == "" {
		return nil, nil, fmt.Errorf("OTP_PEPPER is required")
	}

	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, nil, fmt.Errorf("connect postgres: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("ping postgres: %w", err)
	}

	if cfg.AutoMigrate {
		if err := applyMigrationsIdempotently(ctx, pool); err != nil {
			pool.Close()
			return nil, nil, fmt.Errorf("auto migrate: %w", err)
		}
	}

	s3Client, err := storage.NewS3Client(storage.S3Config{
		InternalEndpoint: cfg.S3Endpoint,
		PublicEndpoint:   cfg.S3PublicEndpoint,
		Region:           cfg.S3Region,
		AccessKey:        cfg.S3AccessKey,
		SecretKey:        cfg.S3SecretKey,
		PublicBucket:     cfg.S3PublicBucket,
		PrivateBucket:    cfg.S3PrivateBucket,
	})
	if err != nil {
		pool.Close()
		return nil, nil, fmt.Errorf("init s3 client: %w", err)
	}

	if cfg.SeedPilotData {
		if err := postgres.SeedPilotData(ctx, pool, s3Client); err != nil {
			pool.Close()
			return nil, nil, fmt.Errorf("seed pilot data: %w", err)
		}
	}

	clock := realClock{}
	txMgr := postgres.NewTxManager(pool)
	idRepo := postgres.NewIdentityRepository(pool)
	sessRepo := postgres.NewSessionRepository(idRepo)
	rateLimiter := ratelimit.NewMemoryLimiter()
	devNotifier := notify.NewDevNotifier(logger, cfg.DevOTPSinkFile)
	dnsResolver := dns.NewResolver()

	tenantRepo := postgres.NewTenantRepository(pool)
	domainRepo := postgres.NewDomainRepository(pool, txMgr)
	payAccRepo := postgres.NewPaymentAccountRepository(pool)

	offeringRepo := postgres.NewOfferingRepository(pool)
	weeklyRuleRepo := postgres.NewWeeklyRuleRepository(pool, txMgr)
	overrideRepo := postgres.NewOverrideRepository(pool, txMgr)
	busySlotReader := postgres.NewBusySlotReader(pool)

	bookingRepo := postgres.NewBookingRepository(pool, txMgr)
	bookingLookups := postgres.NewBookingLookupAdapters(pool)
	mediaRepo := postgres.NewMediaRepository(pool)
	blogRepo := postgres.NewBlogRepository(pool)
	reviewRepo := postgres.NewReviewRepository(pool)

	idSvc := identity.NewService(
		idRepo,
		idRepo,
		sessRepo,
		rateLimiter,
		devNotifier,
		clock,
		identity.Config{OTPPepper: cfg.OTPPepper},
	)

	tenantSvc := tenant.NewService(
		tenantRepo,
		domainRepo,
		payAccRepo,
		dnsResolver,
		clock,
	)

	schedSvc := scheduling.NewService(
		offeringRepo,
		weeklyRuleRepo,
		overrideRepo,
		tenantRepo,
		busySlotReader,
		clock,
	)

	bookSvc := booking.NewService(
		bookingRepo,
		txMgr,
		bookingLookups,
		bookingLookups,
		bookingLookups,
		devNotifier,
		clock,
	)

	mediaSvc := media.NewService(
		mediaRepo,
		s3Client,
		mediaRepo,
		mediaRepo,
		clock,
	)

	contentSvc := content.NewService(
		blogRepo,
		reviewRepo,
		reviewRepo,
		clock,
	)

	app := NewAppWithServices(cfg, logger, Services{
		TLSDomainChecker: tenantSvc,
		Identity:         idSvc,
		Tenant:           tenantSvc,
		Scheduling:       schedSvc,
		Booking:          bookSvc,
		Media:            mediaSvc,
		Content:          contentSvc,
	})

	return app, pool.Close, nil
}

func applyMigrationsIdempotently(ctx context.Context, pool *pgxpool.Pool) error {
	var reg *string
	if err := pool.QueryRow(ctx, `SELECT to_regclass('booking.bookings')::text`).Scan(&reg); err != nil {
		return err
	}
	if reg != nil {
		return nil
	}
	_, err := pool.Exec(ctx, migrations.InitUpSQL())
	return err
}

// NewAppWithServices constructs an App with explicitly injected domain interfaces.
func NewAppWithServices(cfg Config, logger *slog.Logger, services Services) *App {
	if logger == nil {
		logger = httptransport.NewRedactingLogger(io.Discard, cfg.LogLevel)
	}
	if cfg.PlatformDomain == "" {
		cfg.PlatformDomain = "ravannama.ir"
	}
	if cfg.Port == "" {
		cfg.Port = "8080"
	}

	handler := httptransport.NewHandler(httptransport.Dependencies{
		Logger:           logger,
		PlatformDomain:   cfg.PlatformDomain,
		TLSDomainChecker: services.TLSDomainChecker,
		Identity:         services.Identity,
		Tenant:           services.Tenant,
		Scheduling:       services.Scheduling,
		Booking:          services.Booking,
		Media:             services.Media,
		Content:           services.Content,
		CookieSecure:      cfg.CookieSecure,
		TrustProxyHeaders: cfg.TrustProxyHeaders,
	})

	return &App{
		cfg:      cfg,
		logger:   logger,
		handler:  handler,
		services: services,
	}
}

// Handler returns the root HTTP handler.
func (a *App) Handler() http.Handler {
	return a.handler
}

// Services returns the wired domain service interfaces.
func (a *App) Services() Services {
	return a.services
}

// TestEnv returns the in-memory test harness when constructed via NewTestApp.
func (a *App) TestEnv() *TestEnv {
	return a.testEnv
}

// RunWorkers executes the in-process 30s hold-expiry and 5m cleanup tickers until ctx is canceled.
func (a *App) RunWorkers(ctx context.Context) {
	holdExpiryTicker := time.NewTicker(holdExpirySweepInterval)
	cleanupTicker := time.NewTicker(cleanupSweepInterval)
	defer holdExpiryTicker.Stop()
	defer cleanupTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-holdExpiryTicker.C:
			if a.services.Booking != nil {
				n, err := a.services.Booking.ExpireStaleHolds(ctx, time.Now().UTC())
				if err != nil {
					a.logger.Error("hold-expiry sweep failed", slog.String("error", err.Error()))
				} else if n > 0 {
					a.logger.Info("expired stale holds", slog.Int("count", n))
				}
			} else {
				a.logger.Debug("hold-expiry ticker sweep tick")
			}
		case <-cleanupTicker.C:
			a.logger.Debug("cleanup ticker sweep tick")
		}
	}
}

type noopTLSDomainChecker struct{}

func (noopTLSDomainChecker) IsVerifiedCustomDomain(_ context.Context, _ string) (bool, error) {
	return false, nil
}
