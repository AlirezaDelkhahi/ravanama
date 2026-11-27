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
	app := bootstrap.NewApp(cfg, logger)

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
	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}
	platformDomain := strings.TrimSpace(os.Getenv("PLATFORM_DOMAIN"))
	if platformDomain == "" {
		platformDomain = "ravannama.ir"
	}

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
		Port:           port,
		PlatformDomain: platformDomain,
		LogLevel:       level,
	}
}
