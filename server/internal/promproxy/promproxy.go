// Package promproxy is a tight, read-only reverse proxy in front of the
// in-cluster Prometheus. It exists so the browser never needs a Prometheus
// ingress and the SPA stays single-origin (no CORS). Only GET, and only a
// fixed set of /api/v1 endpoints, are allowed through.
package promproxy

import (
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
)

// allowed Prometheus API endpoints (everything else is 404'd before proxying).
var allowed = map[string]bool{
	"query":       true,
	"query_range": true,
	"alerts":      true,
	"rules":       true,
}

// New returns a handler mounted at /api/prom/ that forwards e.g.
// /api/prom/query_range?... → <promURL>/api/v1/query_range?...
func New(promURL string) (http.Handler, error) {
	target, err := url.Parse(promURL)
	if err != nil {
		return nil, err
	}
	rp := httputil.NewSingleHostReverseProxy(target)
	rp.ErrorHandler = func(w http.ResponseWriter, _ *http.Request, _ error) {
		// A down Prometheus must not 5xx the SPA shell — the widget shows
		// "unavailable" on a non-200 and retries on its own cadence.
		http.Error(w, `{"status":"error","error":"prometheus unavailable"}`, http.StatusBadGateway)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "read-only", http.StatusMethodNotAllowed)
			return
		}
		ep := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/prom/"), "/")
		if !allowed[ep] {
			http.NotFound(w, r)
			return
		}
		r.URL.Path = "/api/v1/" + ep
		r.Host = target.Host
		rp.ServeHTTP(w, r)
	}), nil
}
