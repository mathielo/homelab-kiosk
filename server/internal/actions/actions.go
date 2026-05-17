// Package actions implements the only write surface of the kiosk: a fixed,
// reversible verb whitelist over SABnzbd and qBittorrent, plus an aggregated
// /api/state read so the UI toggles reflect reality, not just the last tap.
//
// Nothing here can delete, purge, or mutate the cluster. Adding a destructive
// verb is intentionally not a small change — it would mean a new handler here.
package actions

import (
	"encoding/json"
	"net/http"

	"github.com/mathielo/homelab-kiosk/server/internal/config"
)

type Service struct{ cfg *config.Config }

func New(cfg *config.Config) *Service { return &Service{cfg: cfg} }

// Register mounts the action + state routes on the given mux.
func (s *Service) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/state", s.state)
	mux.HandleFunc("GET /api/downloads", s.downloads)
	mux.HandleFunc("GET /api/pihole", s.piholeStats)
	mux.HandleFunc("POST /api/actions/sab/{op}", s.guarded(s.sabOp))
	mux.HandleFunc("POST /api/actions/qbt/{name}/freeleech/{op}", s.guarded(s.qbtFreeleech))
	mux.HandleFunc("POST /api/actions/qbt/{name}/throttle/toggle", s.guarded(s.qbtThrottle))
	mux.HandleFunc("POST /api/actions/pihole/blocking/{op}", s.guarded(s.piholeBlocking))
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

// guarded blocks every write when actions are disabled by config, so a
// read-only deployment cannot be coerced into mutating anything.
func (s *Service) guarded(h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !s.cfg.AllowActions {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "actions disabled"})
			return
		}
		h(w, r)
	}
}

func (s *Service) sabOp(w http.ResponseWriter, r *http.Request) {
	op := r.PathValue("op")
	if op != "pause" && op != "resume" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "op must be pause|resume"})
		return
	}
	if s.cfg.SabURL == "" {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "sab not configured"})
		return
	}
	if err := newSab(s.cfg.SabURL, s.cfg.SabAPIKey).setPaused(r.Context(), op == "pause"); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"paused": op == "pause"})
}

func (s *Service) qbtFreeleech(w http.ResponseWriter, r *http.Request) {
	inst, ok := s.cfg.QBtByName(r.PathValue("name"))
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown qbt instance"})
		return
	}
	op := r.PathValue("op")
	if op != "pause" && op != "resume" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "op must be pause|resume"})
		return
	}
	if err := newQbt(inst).setFreeleechPaused(r.Context(), s.cfg.FreeleechCat, op == "pause"); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"paused": op == "pause"})
}

func (s *Service) qbtThrottle(w http.ResponseWriter, r *http.Request) {
	inst, ok := s.cfg.QBtByName(r.PathValue("name"))
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "unknown qbt instance"})
		return
	}
	if err := newQbt(inst).toggleThrottle(r.Context()); err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "toggled"})
}

// state aggregates current toggle state across SAB + every qBt instance. Each
// probe is best-effort: an unreachable instance reports nulls, never errors,
// so the screen degrades per-tile instead of failing whole.
func (s *Service) state(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	type qbtState struct {
		Name            string `json:"name"`
		FreeleechPaused *bool  `json:"freeleechPaused"`
		Throttled       *bool  `json:"throttled"`
	}
	out := struct {
		ActionsEnabled bool       `json:"actionsEnabled"`
		SabPaused      *bool      `json:"sabPaused"`
		QBt            []qbtState `json:"qbt"`
	}{ActionsEnabled: s.cfg.AllowActions}

	if s.cfg.SabURL != "" {
		if p, err := newSab(s.cfg.SabURL, s.cfg.SabAPIKey).paused(ctx); err == nil {
			out.SabPaused = &p
		}
	}
	for _, inst := range s.cfg.QBt {
		c := newQbt(inst)
		st := qbtState{Name: inst.Name}
		if fp, err := c.freeleechPaused(ctx, s.cfg.FreeleechCat); err == nil {
			st.FreeleechPaused = &fp
		}
		if th, err := c.throttled(ctx); err == nil {
			st.Throttled = &th
		}
		out.QBt = append(out.QBt, st)
	}
	writeJSON(w, http.StatusOK, out)
}
