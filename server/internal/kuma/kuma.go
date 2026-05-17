// Package kuma proxies Uptime Kuma's status-page JSON so the Services tab has a
// single origin and the SPA needs no Kuma URL/CORS config.
//
// Kuma splits a status page across two endpoints:
//
//	/api/status-page/<slug>            → { publicGroupList: [...] }  (the monitors)
//	/api/status-page/heartbeat/<slug>  → { heartbeatList, uptimeList } (the beats)
//
// The SPA needs both, so this handler fetches them concurrently and merges
// them into one document the frontend already expects:
//
//	{ "publicGroupList": [...], "heartbeatList": {...}, "uptimeList": {...} }
package kuma

import (
	"context"
	"encoding/json"
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

// fetchJSON GETs url and decodes it into a flat map of raw JSON values so we
// can re-emit Kuma's shapes verbatim without modelling its schema.
func (h *Handler) fetchJSON(ctx context.Context, url string) (map[string]json.RawMessage, error) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var m map[string]json.RawMessage
	if err := json.NewDecoder(resp.Body).Decode(&m); err != nil {
		return nil, err
	}
	return m, nil
}

// ServeHTTP returns the merged status-page document, or 502 with a JSON body so
// the Services tab degrades to "unavailable" instead of breaking.
func (h *Handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if h.base == "" {
		http.Error(w, `{"error":"kuma not configured"}`, http.StatusServiceUnavailable)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	type res struct {
		m   map[string]json.RawMessage
		err error
	}
	pageCh, beatCh := make(chan res, 1), make(chan res, 1)
	go func() { m, err := h.fetchJSON(ctx, h.base+"/api/status-page/"+h.slug); pageCh <- res{m, err} }()
	go func() {
		m, err := h.fetchJSON(ctx, h.base+"/api/status-page/heartbeat/"+h.slug)
		beatCh <- res{m, err}
	}()
	page, beat := <-pageCh, <-beatCh
	if page.err != nil || beat.err != nil {
		http.Error(w, `{"error":"kuma unavailable"}`, http.StatusBadGateway)
		return
	}

	out := map[string]json.RawMessage{}
	if v, ok := page.m["publicGroupList"]; ok {
		out["publicGroupList"] = v
	}
	if v, ok := beat.m["heartbeatList"]; ok {
		out["heartbeatList"] = v
	}
	if v, ok := beat.m["uptimeList"]; ok {
		out["uptimeList"] = v
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
