package dns

import (
	"context"
	"net"

	"github.com/ravannama/ravannama/backend/internal/domain/tenant"
)

var _ tenant.TXTLookupPort = (*Resolver)(nil)

// Resolver implements tenant.TXTLookupPort using Go's standard DNS resolver.
type Resolver struct {
	inner *net.Resolver
}

// NewResolver constructs a DNS TXT Resolver.
func NewResolver() *Resolver {
	return &Resolver{inner: net.DefaultResolver}
}

func (r *Resolver) LookupTXT(ctx context.Context, hostname string) ([]string, error) {
	return r.inner.LookupTXT(ctx, hostname)
}
