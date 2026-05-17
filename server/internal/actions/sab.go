package actions

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

// sab is a minimal SABnzbd API client. SABnzbd authenticates with an apikey
// query param, so there is no session to manage.
type sab struct {
	base, key string
	client    *http.Client
}

func newSab(base, key string) *sab {
	return &sab{base: base, key: key, client: &http.Client{Timeout: 6 * time.Second}}
}

func (s *sab) call(ctx context.Context, mode string, extra url.Values) ([]byte, error) {
	v := url.Values{"mode": {mode}, "output": {"json"}, "apikey": {s.key}}
	for k, vals := range extra {
		for _, val := range vals {
			v.Add(k, val)
		}
	}
	u := s.base + "/api?" + v.Encode()
	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	resp, err := s.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("sab %s -> %s", mode, resp.Status)
	}
	return io.ReadAll(resp.Body)
}

func (s *sab) setPaused(ctx context.Context, paused bool) error {
	mode := "resume"
	if paused {
		mode = "pause"
	}
	_, err := s.call(ctx, mode, nil)
	return err
}

type sabQueue struct {
	Paused   bool
	SpeedBps float64
	Slots    int
}

func (s *sab) queue(ctx context.Context) (sabQueue, error) {
	body, err := s.call(ctx, "queue", nil)
	if err != nil {
		return sabQueue{}, err
	}
	var out struct {
		Queue struct {
			Paused   bool   `json:"paused"`
			KbPerSec string `json:"kbpersec"`
			NoOfSlots int   `json:"noofslots"`
		} `json:"queue"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return sabQueue{}, err
	}
	kb, _ := strconv.ParseFloat(out.Queue.KbPerSec, 64)
	return sabQueue{Paused: out.Queue.Paused, SpeedBps: kb * 1024, Slots: out.Queue.NoOfSlots}, nil
}

func (s *sab) paused(ctx context.Context) (bool, error) {
	q, err := s.queue(ctx)
	return q.Paused, err
}
