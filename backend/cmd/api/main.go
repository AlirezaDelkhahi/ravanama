package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/ravannama/ravannama/backend/internal/bootstrap"
	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

func main() {
	cfg := loadConfig()
	logger := httptransport.NewRedactingLogger(os.Stdout, cfg.LogLevel)

	var app *bootstrap.App
	var closeFn func()
	if cfg.DatabaseURL != "" {
		initCtx, initCancel := context.WithTimeout(context.Background(), 30*time.Second)
		var err error
		app, closeFn, err = bootstrap.NewAppFromEnv(initCtx, cfg, logger)
		initCancel()
		if err != nil {
			logger.Error("failed to initialize application from environment", slog.String("error", err.Error()))
			os.Exit(1)
		}
		defer closeFn()
	} else {
		app = bootstrap.NewApp(cfg, logger)
	}

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           app.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		app.RunWorkers(ctx)
	}()

	errCh := make(chan error, 1)
	go func() {
		logger.Info("starting api server",
			slog.String("port", cfg.Port),
			slog.String("platform_domain", cfg.PlatformDomain),
		)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
		close(errCh)
	}()

	select {
	case <-ctx.Done():
		logger.Info("shutdown signal received")
	case err := <-errCh:
		if err != nil {
			logger.Error("server exited with error", slog.String("error", err.Error()))
			stop()
		}
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		logger.Error("graceful server shutdown failed", slog.String("error", err.Error()))
	}
	wg.Wait()
	logger.Info("server shutdown complete")
}

func loadConfig() bootstrap.Config {
	port := envOrDefault("PORT", "8080")
	platformDomain := envOrDefault("PLATFORM_DOMAIN", "ravannama.ir")

	level := slog.LevelInfo
	switch strings.ToUpper(strings.TrimSpace(os.Getenv("LOG_LEVEL"))) {
	case "DEBUG":
		level = slog.LevelDebug
	case "WARN", "WARNING":
		level = slog.LevelWarn
	case "ERROR":
		level = slog.LevelError
	}

	return bootstrap.Config{
		Port:             port,
		PlatformDomain:   platformDomain,
		LogLevel:         level,
		DatabaseURL:      strings.TrimSpace(os.Getenv("DATABASE_URL")),
		S3Endpoint:       envOrDefault("S3_ENDPOINT", "http://minio:9000"),
		S3PublicEndpoint: strings.TrimSpace(os.Getenv("S3_PUBLIC_ENDPOINT")),
		S3Region:         envOrDefault("S3_REGION", "ir-thr-at1"),
		S3AccessKey:      strings.TrimSpace(os.Getenv("S3_ACCESS_KEY")),
		S3SecretKey:      strings.TrimSpace(os.Getenv("S3_SECRET_KEY")),
		S3PublicBucket:   envOrDefault("S3_PUBLIC_BUCKET", "ravannama-public"),
		S3PrivateBucket:  envOrDefault("S3_PRIVATE_BUCKET", "ravannama-private"),
		OTPPepper:         strings.TrimSpace(os.Getenv("OTP_PEPPER")),
		CookieSecure:      parseBoolEnv("COOKIE_SECURE", false),
		TrustProxyHeaders: parseBoolEnv("TRUST_PROXY_HEADERS", false),
		AutoMigrate:       parseBoolEnv("AUTO_MIGRATE", false),
		SeedPilotData:     parseBoolEnv("SEED_PILOT_DATA", false),
		DevOTPSinkFile:    strings.TrimSpace(os.Getenv("DEV_OTP_SINK_FILE")),
	}
}

func envOrDefault(key, fallback string) string {
	v := strings.TrimSpace(os.Getenv(key))
	if v == "" {
		return fallback
	}
	return v
}

func parseBoolEnv(key string, fallback bool) bool {
	v := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	switch v {
	case "true", "1", "yes":
		return true
	case "false", "0", "no":
		return false
	default:
		return fallback
	}
}
