package actions

import (
	"net/http"

	"github.com/mathielo/homelab-kiosk/server/internal/pihole"
)

// piholeStats is the read for the Network tab (block %, queries, blocking state).
func (s *Service) piholeStats(w http.ResponseWriter, r *http.Request) {
	if s.cfg.PiholeURL == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "pihole not configured"})
		return
	}
	st, err := pihole.New(s.cfg.PiholeURL, s.cfg.PiholePass).Stats(r.Context())
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, st)
}

// piholeBlocking toggles ad-blocking. "disable" lasts KIOSK_PIHOLE_DISABLE_SECONDS
// and Pi-hole auto-re-enables it; "enable" turns it back on immediately.
func (s *Service) piholeBlocking(w http.ResponseWriter, r *http.Request) {
	if s.cfg.PiholeURL == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "pihole not configured"})
		return
	}
	op := r.PathValue("op")
	if op != "enable" && op != "disable" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "op must be enable|disable"})
		return
	}
	enable := op == "enable"
	err := pihole.New(s.cfg.PiholeURL, s.cfg.PiholePass).
		SetBlocking(r.Context(), enable, s.cfg.PiholeDisable)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"blockingEnabled": enable})
}
