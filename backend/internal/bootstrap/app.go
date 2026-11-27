package bootstrap

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

const (
	holdExpirySweepInterval = 30 * time.Second
	cleanupSweepInterval    = 5 * time.Minute
)

// Config holds runtime configuration for the modular monolith.
type Config struct {
	Port           string
	PlatformDomain string
	LogLevel       slog.Level
}

// Services holds domain service interfaces and ports wired into transport and workers.
type Services struct {
	TLSDomainChecker tenant.TLSDomainChecker
}

// App encapsulates the wired HTTP handler and background ticker workers.
type App struct {
	cfg      Config
	logger   *slog.Logger
	handler  http.Handler
	services Services
}

// NewApp constructs the production application scaffold.
func NewApp(cfg Config, logger *slog.Logger) *App {
	return NewAppWithServices(cfg, logger, Services{
		TLSDomainChecker: noopTLSDomainChecker{},
	})
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
			a.logger.Debug("hold-expiry ticker sweep tick")
		case <-cleanupTicker.C:
			a.logger.Debug("cleanup ticker sweep tick")
		}
	}
}

type noopTLSDomainChecker struct{}

func (noopTLSDomainChecker) IsVerifiedCustomDomain(_ context.Context, _ string) (bool, error) {
	return false, nil
}
