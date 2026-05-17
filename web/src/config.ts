// Static topology the kiosk renders. Kept in one place so adding a node, a qBt
// instance, or a tab is a one-line change — not a hunt through components.
//
// `promInstance` is the node-exporter `instance` label as Prometheus sees it.
// Adjust to match the homelab scrape config if it differs.

export interface NodeDef {
  name: string
  promInstance: string
  /** filesystem mountpoints to show used/total for (node-exporter labels). */
  mounts: { label: string; mountpoint: string }[]
}

// `promInstance` is the node-exporter `instance` label. In this cluster
// node-exporter runs hostNetwork, so the label is the node IP (optionally
// with a :port — instanceSelector() in promql.ts tolerates both).
export const K3S_NODES: NodeDef[] = [
  {
    name: 'k3s-server',
    promInstance: '10.10.50.10',
    mounts: [
      { label: 'root', mountpoint: '/' },
      { label: 'longhorn', mountpoint: '/mnt/nvme/longhorn' },
      { label: 'ssd/local', mountpoint: '/mnt/ssd/local' },
    ],
  },
  {
    name: 'k3s-node-01',
    promInstance: '10.10.50.11',
    mounts: [
      { label: 'root', mountpoint: '/' },
      { label: 'longhorn', mountpoint: '/mnt/nvme/longhorn' },
      { label: 'ssd/local', mountpoint: '/mnt/ssd/local' },
    ],
  },
  {
    name: 'k3s-node-02',
    promInstance: '10.10.50.12',
    mounts: [
      { label: 'root', mountpoint: '/' },
      { label: 'longhorn', mountpoint: '/mnt/nvme/longhorn' },
      { label: 'nvme/local', mountpoint: '/mnt/nvme/local' },
    ],
  },
]

// Pi-hole / Home Assistant run on standalone Pis that Prometheus does NOT
// scrape (only k3s nodes have node-exporter). They'd be permanently-dead
// tiles here, so they're intentionally omitted — Pi-hole has its own card on
// the Network tab. To add them, run node-exporter on those hosts (or proxy
// their Glances through the BFF) and append entries here.

// qBittorrent instances (must match KIOSK_QBT_NAMES on the server). Today
// there is one instance; `br` (Brazil exit) is added with the qbt-br
// migration — append it here and to KIOSK_QBT_NAMES at the same time.
export const QBT_INSTANCES = [{ name: 'se', label: 'qbt-se', exit: 'Sweden exit' }]

/** ~30 MB/s sustained NAS write ceiling (see homelab qbt-br-migration.md). */
export const NAS_WRITE_CEILING_MBPS = 30

/**
 * NAS pool usage is read for free from node-exporter on a k3s node that
 * NFS-mounts the Media share (same RAID volume) — no UNAS scraper needed.
 * Drive temps would need snmp_exporter; intentionally out of scope here.
 */
export const NAS = { promInstance: '10.10.50.10', mountpoint: '/var/nfs/shared/Media' }

export const TABS = ['Overview', 'Nodes', 'Downloads', 'Network', 'Services'] as const
export type TabName = (typeof TABS)[number]
