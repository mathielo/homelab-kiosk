// Command kiosk is the homelab rack-screen server: it embeds the React SPA and
// fronts it with a thin, read-mostly BFF. One binary, one port, no state.
package main

import (
	"context"
	"embed"
	"errors"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/mathielo/homelab-kiosk/server/internal/actions"
	"github.com/mathielo/homelab-kiosk/server/internal/config"
	"github.com/mathielo/homelab-kiosk/server/internal/kuma"
	"github.com/mathielo/homelab-kiosk/server/internal/promproxy"
)

//go:embed all:webdist
var webdist embed.FS

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	mux := http.NewServeMux()

	prom, err := promproxy.New(cfg.PromURL)
	if err != nil {
		log.Fatalf("promproxy: %v", err)
	}
	mux.Handle("/api/prom/", prom)
	mux.Handle("GET /api/kuma/heartbeat", kuma.New(cfg.KumaBaseURL, cfg.KumaSlug))
	actions.New(cfg).Register(mux)

	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})

	// Serve the embedded SPA, with history-API fallback to index.html for any
	// non-/api, non-asset path so deep links / tab routes resolve.
	dist, _ := fs.Sub(webdist, "webdist")
	fileServer := http.FileServer(http.FS(dist))
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}
		if _, err := fs.Stat(dist, strings.TrimPrefix(r.URL.Path, "/")); err != nil && r.URL.Path != "/" {
			r.URL.Path = "/"
		}
		fileServer.ServeHTTP(w, r)
	})

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Printf("kiosk listening on %s (actions=%v, qbt=%d)", cfg.Addr, cfg.AllowActions, len(cfg.QBt))
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("listen: %v", err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	log.Println("kiosk stopped")
}
