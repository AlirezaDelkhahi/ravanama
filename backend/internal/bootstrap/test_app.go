package bootstrap

import (
	"context"
	"io"
	"log/slog"
	"strings"

	httptransport "github.com/ravannama/ravannama/backend/internal/transport/http"
)

type fakeTLSDomainChecker struct {
	verified map[string]bool
}

func (f fakeTLSDomainChecker) IsVerifiedCustomDomain(_ context.Context, hostname string) (bool, error) {
	return f.verified[strings.ToLower(strings.TrimSpace(hostname))], nil
}

// NewTestApp returns an in-memory wired *App with zero external DB/network dependencies.
func NewTestApp() *App {
	logger := httptransport.NewRedactingLogger(io.Discard, slog.LevelInfo)
	cfg := Config{
		Port:           "8080",
		PlatformDomain: "ravannama.ir",
		LogLevel:       slog.LevelInfo,
	}
	services := Services{
		TLSDomainChecker: fakeTLSDomainChecker{
			verified: map[string]bool{
				"dr-example.ir": true,
			},
		},
	}
	return NewAppWithServices(cfg, logger, services)
}
