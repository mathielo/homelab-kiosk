// Package kuma proxies the public Uptime Kuma status-page heartbeat JSON so the
// Services tab has a single origin and the SPA needs no Kuma URL/CORS config.
package kuma

import (
	"context"
	"io"
	"net/http"
	"time"
)

type Handler struct {
	base, slug string
	client     *http.Client
}

func New(baseURL, slug string) *Handler {
	return &Handler{base: baseURL, slug: slug, client: &http.Client{Timeout: 5 * time.Second}}
}

// ServeHTTP returns the status-page heartbeat document, or 502 with an empty
// body so the Services tab degrades to "unavailable" instead of breaking.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.base == "" {
		http.Error(w, `{"error":"kuma not configured"}`, http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	url := h.base + "/api/status-page/heartbeat/" + h.slug
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := h.client.Do(req)
	if err != nil {
		http.Error(w, `{"error":"kuma unavailable"}`, http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(resp.StatusCode)
	_, _ = io.Copy(w, resp.Body)
}
