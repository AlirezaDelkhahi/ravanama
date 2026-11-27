//go:build integration

package bootstrap_test

import (
	"os"
	"testing"
)

func TestIntegrationSmoke_PostgresEnvGate(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL is empty; skipping Milestone 0 integration DB smoke test")
	}
	t.Logf("TEST_DATABASE_URL detected (length=%d)", len(dsn))
}
