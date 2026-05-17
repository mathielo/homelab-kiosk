# homelab-kiosk

Touch dashboard for the DeskPi 7.84" 1280×400 rack screen. One Go binary that
**embeds** a React/Vite SPA and exposes a thin backend-for-frontend (BFF):

```
┌─────────────────────────── kiosk (one container) ─────────────────────────────┐
│  Go net/http server                                                           │
│   ├─ /            → embedded React SPA (//go:embed)                           │
│   ├─ /api/prom/*  → read-only passthrough to in-cluster Prometheus            │
│   ├─ /api/kuma/*  → read-only passthrough to Uptime Kuma status page          │
│   ├─ /api/state   → aggregated action state (paused? throttled?)              │
│   └─ /api/actions/* → whitelisted, reversible verbs (SAB/qBt), creds via env  │
└───────────────────────────────────────────────────────────────────────────────┘
```

The browser never holds a credential and never talks to Prometheus/qBt/SAB
directly — the BFF is the only thing with secrets, and it only ever performs a
**fixed whitelist** of reversible verbs. Prometheus stays cluster-internal.

## Why this exists / design rules

- **No bespoke metrics backend.** Read data is reused from what the homelab
  already runs: Prometheus (node-exporter, kube-state-metrics) and Uptime Kuma.
  The BFF only _proxies_ them; it stores nothing, has no DB, is stateless.
- **Server-side code is the minimum that the action buttons force**: auth, CORS,
  and credential-hiding for the qBt/SAB APIs. Reads could be CORS-direct, but
  routing them through the BFF keeps Prometheus internal and the SPA single-origin.
- **Actions are reversible-only.** Pause/resume, throttle on/off, toggle a
  category. No delete, no purge, no pod/node mutation. The screen is
  unauthenticated and physically reachable — destructive verbs are not allowed
  to exist in the binary.
- **Every widget degrades independently.** A down node/pod/endpoint renders a
  friendly "unavailable" tile; the app never white-screens and auto-recovers.

## Repo layout

```
server/                Go BFF (stdlib only, single binary)
  main.go              mux, SPA embed + SPA-fallback, graceful shutdown
  internal/config      env-driven config (SOPS-injected at runtime)
  internal/promproxy   Prometheus /api/v1 reverse proxy (GET, whitelisted paths)
  internal/kuma        Uptime Kuma status-page passthrough
  internal/actions     SAB + qBt verbs + aggregated /api/state
  webdist/             build artifact: web/dist copied here, then embedded
web/                   React 19 + Vite 8 + TS SPA
  src/api              typed client + DTOs
  src/hooks            usePolledResource (visibility-aware, backoff, stale)
  src/components       Sparkline, Unavailable, ActionButton, AlertsBell, KeepAwake
  src/tabs             Overview, Nodes, Downloads, Network, Services
```

## Data sources (all reused, nothing new to deploy)

| Screen element                | Source            | PromQL / endpoint                                                                                            |
| ----------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------ |
| Per-node load sparkline (~3h) | Prometheus range  | `node_load1{instance=~"..."}` via `query_range`                                                              |
| Per-node CPU / RAM            | Prometheus        | `node_cpu_seconds_total` rate, `node_memory_*`                                                               |
| Per-node filesystem usage     | Prometheus        | `node_filesystem_avail_bytes` / `_size_bytes` per `mountpoint` (`/`, `/mnt/nvme/longhorn`, `/mnt/ssd/local`) |
| k3s cluster / pods            | Prometheus        | kube-state-metrics series                                                                                    |
| Firing alerts (top-right)     | Prometheus        | `GET /api/v1/alerts` (state=firing)                                                                          |
| Download speeds / queues      | SAB + qBt via BFF | SAB `queue`, qBt `transfer/info` + `torrents/info`                                                           |
| Service health (Services tab) | Uptime Kuma       | `GET /api/status-page/heartbeat/<slug>`                                                                      |
| NAS pool used %               | Prometheus        | node-exporter `node_filesystem_*` on the NFS mount                                                           |

## Polling strategy

Polling is tiered and **never faster than the data actually changes**:

| Tier            | Interval | Rationale                                         |
| --------------- | -------- | ------------------------------------------------- |
| qBt/SAB live    | 5 s      | speeds/queues/action-state change continuously    |
| Prometheus inst | 15 s     | pointless to poll faster than the scrape interval |
| Load range/fs   | 30 s     | sparkline + capacity move slowly                  |
| Uptime Kuma     | 30 s     | heartbeat cadence                                 |

`usePolledResource` also **pauses every poll when the tab is hidden or the
screen is asleep** (Page Visibility API) and applies exponential backoff on
error so a dead endpoint can't hammer anything.

## Screen sleep & "keep awake"

Display power is an **OS concern on the node**, not the app — handled by the
homelab repo's Ansible kiosk play, not here:

- `swayidle -w timeout 900 'wlopm --off "*"' resume 'wlopm --on "*"'`
  (cage is wlroots-based, so `wlopm`/DPMS blanks the panel after 15 min; any
  touch wakes it via libinput `resume`).
- The top-bar **💡 keep-awake** toggle uses the browser
  [Screen Wake Lock API](https://developer.mozilla.org/docs/Web/API/Screen_Wake_Lock_API)
  first. cage/wlroots honoring of wake-lock is not guaranteed; the documented
  fallback is a BFF `/api/display/keepawake` sentinel that the `swayidle`
  wrapper checks before blanking (see homelab `ansible/kiosk.yaml`). The bulb
  reflects actual lock state, not just the tap.

## Build & run

```sh
make web      # vite build → copies web/dist into server/webdist
make build    # go build → ./bin/kiosk (SPA embedded)
make run      # build + run locally (needs the KIOSK_* env below)
make image    # multi-stage container build
```

Versions are pinned and Renovate-tracked (`renovate.json5`): Go 1.26.3,
React 19.2.6, Vite 8.0.13. Bump via PR, never float.

### Local development

```sh
cp .env.example .env            # edit: point at real services or leave blank
set -a; . ./.env; set +a        # export vars (Go reads plain env, no autoload)
make build && ./bin/kiosk       # SPA + API on :8080
# optional, in another shell, for frontend hot-reload:
npm --prefix web run dev        # Vite proxies /api → :8080
```

Cutting a release is a manual button — see [Releasing](#releasing) below.

## Configuration (env — injected from SOPS in-cluster)

| Env                       | Purpose                                                         |
| ------------------------- | --------------------------------------------------------------- |
| `KIOSK_ADDR`              | listen address (default `:8080`)                                |
| `KIOSK_PROM_URL`          | in-cluster Prometheus base URL                                  |
| `KIOSK_KUMA_BASE_URL`     | Uptime Kuma base URL                                            |
| `KIOSK_KUMA_SLUG`         | status-page slug (e.g. `homelab`)                               |
| `KIOSK_ALLOW_ACTIONS`     | `false` ships a read-only screen (default `true`)               |
| `KIOSK_SAB_URL`           | SABnzbd base URL                                                |
| `KIOSK_SAB_APIKEY`        | SABnzbd API key (secret)                                        |
| `KIOSK_QBT_NAMES`         | comma list of instances, e.g. `se,br`                           |
| `KIOSK_QBT_<NAME>_URL`    | per-instance qBittorrent base URL                               |
| `KIOSK_QBT_<NAME>_USER`   | per-instance WebUI user (secret)                                |
| `KIOSK_QBT_<NAME>_PASS`   | per-instance WebUI password (secret)                            |
| `KIOSK_QBT_FREELEECH_CAT` | qBt category the freeleech toggle targets (default `freeleech`) |

Secrets are provided by the homelab repo's SOPS file at deploy time (this repo
contains **no** secrets). See the homelab chart for the exact key list.

## Releasing

Releases are cut by hand from the Actions tab — there is no auto-tag-on-merge.

1. **Actions → `release` → Run workflow**, enter a bare version number, digits
   and dots only, e.g. `0.1.0` (no `v`, no pre-release suffixes — the input is
   validated against `^[0-9]+\.[0-9]+\.[0-9]+$` and rejected otherwise).
2. The `release` workflow then:
   - renders release notes from the commit log with **git-cliff**
     (config: [`cliff.toml`](cliff.toml)), grouped Features / Fixes / … ;
   - creates and pushes the annotated tag **`v0.1.0`**;
   - publishes a **GitHub Release** with those notes;
   - calls the **`publish`** workflow, which builds and pushes
     `ghcr.io/mathielo/homelab-kiosk:0.1.0` (+ `0.1`, `sha-…`).

```
release.yml  (workflow_dispatch: version=0.1.0)
   ├─ validate semver + ensure tag is free
   ├─ git-cliff  → release notes
   ├─ git tag -a v0.1.0 && push
   ├─ GitHub Release (notes)
   └─ uses: publish.yml (tag=v0.1.0)  → ghcr.io/…:0.1.0
```

`publish.yml` is also wired to `push: tags: v*`, so a tag pushed **by a human**
from a workstation still builds an image. A tag pushed by `release.yml` does
**not** re-trigger it — GitHub suppresses workflow events from the built-in
`GITHUB_TOKEN`, which is the whole reason `release.yml` *calls* `publish.yml`
directly instead of relying on the tag push. Net effect for the maintainer: one
button, one image, no double build.

**Release-note quality depends on [Conventional Commits].** `feat:` / `fix:` /
`perf:` / `refactor:` / `docs:` land in their own sections; `chore(deps):`
(Renovate already does this) and `chore(ci):` get their own groups; bare
`chore:` / `style:` / `build:` are omitted from notes. Keep hand-written commit
subjects in that style or they fall into a generic "Other" bucket.

[Conventional Commits]: https://www.conventionalcommits.org/

## Deployment

This repo only **produces the image** (`ghcr.io/mathielo/homelab-kiosk:vX.Y.Z`).
The Helm chart, ArgoCD app, ingress (`kiosk.hl.mathielo.com`) and SOPS secret
live in the `homelab` repo and **pin** that tag, per its GitOps/versioning policy.
