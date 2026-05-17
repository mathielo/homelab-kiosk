package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/url"
	"strings"
	"time"

	"github.com/mathielo/homelab-kiosk/server/internal/config"
)

// qbt is a minimal qBittorrent WebUI API client. We run qBittorrent 5.x, where
// pause/resume were renamed to stop/start. A fresh login per call keeps the BFF
// stateless — fine at one-screen scale.
type qbt struct {
	inst   config.QBtInstance
	client *http.Client
}

type qbtTorrent struct {
	Hash  string `json:"hash"`
	State string `json:"state"`
}

func newQbt(inst config.QBtInstance) *qbt {
	jar, _ := cookiejar.New(nil)
	return &qbt{inst: inst, client: &http.Client{Jar: jar, Timeout: 8 * time.Second}}
}

func (q *qbt) login(ctx context.Context) error {
	form := url.Values{"username": {q.inst.User}, "password": {q.inst.Pass}}
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		q.inst.URL+"/api/v2/auth/login", strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Referer", q.inst.URL)
	resp, err := q.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), "Ok.") {
		return fmt.Errorf("qbt %s login failed: %s", q.inst.Name, resp.Status)
	}
	return nil
}

func (q *qbt) torrentsInCategory(ctx context.Context, cat string) ([]qbtTorrent, error) {
	u := fmt.Sprintf("%s/api/v2/torrents/info?category=%s", q.inst.URL, url.QueryEscape(cat))
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	resp, err := q.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	var ts []qbtTorrent
	if err := json.NewDecoder(resp.Body).Decode(&ts); err != nil {
		return nil, err
	}
	return ts, nil
}

func (q *qbt) post(ctx context.Context, path string, form url.Values) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost,
		q.inst.URL+path, strings.NewReader(form.Encode()))
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := q.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("qbt %s %s -> %s", q.inst.Name, path, resp.Status)
	}
	return nil
}

// setFreeleechPaused stops (or starts) every torrent in the freeleech category.
func (q *qbt) setFreeleechPaused(ctx context.Context, cat string, paused bool) error {
	if err := q.login(ctx); err != nil {
		return err
	}
	ts, err := q.torrentsInCategory(ctx, cat)
	if err != nil {
		return err
	}
	if len(ts) == 0 {
		return nil
	}
	hashes := make([]string, len(ts))
	for i, t := range ts {
		hashes[i] = t.Hash
	}
	endpoint := "/api/v2/torrents/start"
	if paused {
		endpoint = "/api/v2/torrents/stop"
	}
	return q.post(ctx, endpoint, url.Values{"hashes": {strings.Join(hashes, "|")}})
}

// freeleechPaused reports true when every freeleech torrent is in a stopped state.
func (q *qbt) freeleechPaused(ctx context.Context, cat string) (bool, error) {
	if err := q.login(ctx); err != nil {
		return false, err
	}
	ts, err := q.torrentsInCategory(ctx, cat)
	if err != nil {
		return false, err
	}
	if len(ts) == 0 {
		return false, nil
	}
	for _, t := range ts {
		if !strings.Contains(t.State, "stopped") && !strings.Contains(t.State, "paused") {
			return false, nil
		}
	}
	return true, nil
}

type qbtTransfer struct {
	DlBps int64 `json:"dl_info_speed"`
	UpBps int64 `json:"up_info_speed"`
}

func (q *qbt) transfer(ctx context.Context) (qbtTransfer, int, error) {
	if err := q.login(ctx); err != nil {
		return qbtTransfer{}, 0, err
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		q.inst.URL+"/api/v2/transfer/info", nil)
	resp, err := q.client.Do(req)
	if err != nil {
		return qbtTransfer{}, 0, err
	}
	defer resp.Body.Close()
	var t qbtTransfer
	if err := json.NewDecoder(resp.Body).Decode(&t); err != nil {
		return qbtTransfer{}, 0, err
	}
	// total torrent count (best-effort; 0 on failure, not an error).
	total := 0
	if r2, e2 := http.NewRequestWithContext(ctx, http.MethodGet, q.inst.URL+"/api/v2/torrents/info", nil); e2 == nil {
		if resp2, e3 := q.client.Do(r2); e3 == nil {
			defer resp2.Body.Close()
			var ts []qbtTorrent
			if json.NewDecoder(resp2.Body).Decode(&ts) == nil {
				total = len(ts)
			}
		}
	}
	return t, total, nil
}

func (q *qbt) throttled(ctx context.Context) (bool, error) {
	if err := q.login(ctx); err != nil {
		return false, err
	}
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet,
		q.inst.URL+"/api/v2/transfer/speedLimitsMode", nil)
	resp, err := q.client.Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return strings.TrimSpace(string(body)) == "1", nil
}

func (q *qbt) toggleThrottle(ctx context.Context) error {
	if err := q.login(ctx); err != nil {
		return err
	}
	return q.post(ctx, "/api/v2/transfer/toggleSpeedLimitsMode", url.Values{})
}
