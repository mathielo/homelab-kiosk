// Package config loads the kiosk BFF configuration from the environment.
//
// Secrets (qBt/SAB credentials) are injected at deploy time from the homelab
// repo's SOPS file. This repo never contains secrets and never persists them;
// they live only in this process's memory.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

type QBtInstance struct {
	Name string
	URL  string
	User string
	Pass string
}

type Config struct {
	Addr          string
	PromURL       string
	KumaBaseURL   string
	KumaSlug      string
	AllowActions  bool
	SabURL        string
	SabAPIKey     string
	QBt           []QBtInstance
	FreeleechCat  string
	PiholeURL     string
	PiholePass    string
	PiholeDisable int // seconds the "disable blocking" action lasts
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// Load reads KIOSK_* env vars. It never errors on missing optional integrations
// (a missing SAB/qBt just means those tiles render "unavailable"); it only
// fails fast on a missing Prometheus URL, which the whole screen depends on.
func Load() (*Config, error) {
	c := &Config{
		Addr:         env("KIOSK_ADDR", ":8080"),
		PromURL:      strings.TrimRight(os.Getenv("KIOSK_PROM_URL"), "/"),
		KumaBaseURL:  strings.TrimRight(os.Getenv("KIOSK_KUMA_BASE_URL"), "/"),
		KumaSlug:     env("KIOSK_KUMA_SLUG", "homelab"),
		AllowActions: env("KIOSK_ALLOW_ACTIONS", "true") == "true",
		SabURL:       strings.TrimRight(os.Getenv("KIOSK_SAB_URL"), "/"),
		SabAPIKey:    os.Getenv("KIOSK_SAB_APIKEY"),
		FreeleechCat: env("KIOSK_QBT_FREELEECH_CAT", "freeleech"),
		PiholeURL:    strings.TrimRight(os.Getenv("KIOSK_PIHOLE_URL"), "/"),
		PiholePass:   os.Getenv("KIOSK_PIHOLE_PASSWORD"),
	}
	c.PiholeDisable = 300
	if v := os.Getenv("KIOSK_PIHOLE_DISABLE_SECONDS"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			c.PiholeDisable = n
		}
	}
	if c.PromURL == "" {
		return nil, fmt.Errorf("KIOSK_PROM_URL is required")
	}
	for _, name := range strings.Split(env("KIOSK_QBT_NAMES", ""), ",") {
		name = strings.TrimSpace(name)
		if name == "" {
			continue
		}
		p := "KIOSK_QBT_" + strings.ToUpper(name) + "_"
		c.QBt = append(c.QBt, QBtInstance{
			Name: name,
			URL:  strings.TrimRight(os.Getenv(p+"URL"), "/"),
			User: os.Getenv(p + "USER"),
			Pass: os.Getenv(p + "PASS"),
		})
	}
	return c, nil
}

func (c *Config) QBtByName(name string) (QBtInstance, bool) {
	for _, q := range c.QBt {
		if q.Name == name {
			return q, true
		}
	}
	return QBtInstance{}, false
}
