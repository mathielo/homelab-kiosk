// Package pihole is a minimal Pi-hole v6 API client. v6 replaced the legacy
// token API with a session: POST /api/auth → {sid,csrf}; authenticated calls
// send X-FTL-SID, mutations also send X-FTL-CSRF. Sessions are a limited
// resource, so every call logs out (DELETE /api/auth) when done.
package pihole

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type Client struct {
	base, password string
	http           *http.Client
}

func New(base, password string) *Client {
	return &Client{base: base, password: password, http: &http.Client{Timeout: 6 * time.Second}}
}

type session struct {
	SID  string
	CSRF string
}

func (c *Client) login(ctx context.Context) (session, error) {
	body, _ := json.Marshal(map[string]string{"password": c.password})
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/api/auth", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return session{}, err
	}
	defer resp.Body.Close()
	var out struct {
		Session struct {
			Valid bool   `json:"valid"`
			SID   string `json:"sid"`
			CSRF  string `json:"csrf"`
		} `json:"session"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return session{}, err
	}
	if !out.Session.Valid {
		return session{}, fmt.Errorf("pihole auth rejected")
	}
	return session{SID: out.Session.SID, CSRF: out.Session.CSRF}, nil
}

func (c *Client) logout(ctx context.Context, s session) {
	req, _ := http.NewRequestWithContext(ctx, http.MethodDelete, c.base+"/api/auth", nil)
	req.Header.Set("X-FTL-SID", s.SID)
	if resp, err := c.http.Do(req); err == nil {
		resp.Body.Close()
	}
}

func (c *Client) get(ctx context.Context, s session, path string, v any) error {
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, c.base+path, nil)
	req.Header.Set("X-FTL-SID", s.SID)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("pihole GET %s -> %s", path, resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// Stats is the aggregated read used by the Network tab.
type Stats struct {
	PercentBlocked  float64 `json:"percentBlocked"`
	QueriesTotal    int64   `json:"queriesTotal"`
	Blocked         int64   `json:"blocked"`
	GravityDomains  int64   `json:"gravityDomains"`
	BlockingEnabled bool    `json:"blockingEnabled"`
	BlockingTimer   *float64 `json:"blockingTimer"`
}

func (c *Client) Stats(ctx context.Context) (*Stats, error) {
	s, err := c.login(ctx)
	if err != nil {
		return nil, err
	}
	defer c.logout(ctx, s)

	var summary struct {
		Queries struct {
			Total          int64   `json:"total"`
			Blocked        int64   `json:"blocked"`
			PercentBlocked float64 `json:"percent_blocked"`
		} `json:"queries"`
		Gravity struct {
			DomainsBeingBlocked int64 `json:"domains_being_blocked"`
		} `json:"gravity"`
	}
	if err := c.get(ctx, s, "/api/stats/summary", &summary); err != nil {
		return nil, err
	}
	var blocking struct {
		Blocking string   `json:"blocking"`
		Timer    *float64 `json:"timer"`
	}
	if err := c.get(ctx, s, "/api/dns/blocking", &blocking); err != nil {
		return nil, err
	}
	return &Stats{
		PercentBlocked:  summary.Queries.PercentBlocked,
		QueriesTotal:    summary.Queries.Total,
		Blocked:         summary.Queries.Blocked,
		GravityDomains:  summary.Gravity.DomainsBeingBlocked,
		BlockingEnabled: blocking.Blocking == "enabled",
		BlockingTimer:   blocking.Timer,
	}, nil
}

// SetBlocking enables or disables ad-blocking. When disabling, timerSec auto
// re-enables after that many seconds (Pi-hole-side); pass 0 for "until changed".
func (c *Client) SetBlocking(ctx context.Context, enabled bool, timerSec int) error {
	s, err := c.login(ctx)
	if err != nil {
		return err
	}
	defer c.logout(ctx, s)

	payload := map[string]any{"blocking": enabled}
	if !enabled && timerSec > 0 {
		payload["timer"] = timerSec
	} else {
		payload["timer"] = nil
	}
	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, http.MethodPost, c.base+"/api/dns/blocking", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-FTL-SID", s.SID)
	req.Header.Set("X-FTL-CSRF", s.CSRF)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("pihole set blocking -> %s", resp.Status)
	}
	return nil
}
