/** Ring-break / isolation detection for FlowMap links */

import type { FlowMapLink, HostStatus } from "@/hooks/useFlowMaps";

interface GraphNode {
  hostId: string;
  neighbors: Set<string>;
}

/**
 * Build adjacency list from ring-marked links where both endpoints are UP.
 * Returns list of link IDs that are "impacted" — i.e. form part of a ring
 * but a DOWN host has broken connectivity.
 */
export function detectRingBreaks(
  links: FlowMapLink[],
  statusMap: Record<string, HostStatus>,
): Set<string> {
  const ringLinks = links.filter((l) => l.is_ring);
  if (ringLinks.length === 0) return new Set();

  // Collect all host IDs in ring topology
  const allHosts = new Set<string>();
  ringLinks.forEach((l) => {
    allHosts.add(l.origin_host_id);
    allHosts.add(l.dest_host_id);
  });

  // Build graph only with links where BOTH hosts are UP
  const graph = new Map<string, GraphNode>();
  for (const hid of allHosts) {
    graph.set(hid, { hostId: hid, neighbors: new Set() });
  }

  const activeLinks = ringLinks.filter((l) => {
    const a = statusMap[l.origin_host_id]?.status ?? "UNKNOWN";
    const b = statusMap[l.dest_host_id]?.status ?? "UNKNOWN";
    return a === "UP" && b === "UP";
  });

  for (const l of activeLinks) {
    graph.get(l.origin_host_id)!.neighbors.add(l.dest_host_id);
    graph.get(l.dest_host_id)!.neighbors.add(l.origin_host_id);
  }

  // BFS from first UP host to find connected component
  const upHosts = [...allHosts].filter(
    (h) => (statusMap[h]?.status ?? "UNKNOWN") === "UP",
  );
  if (upHosts.length === 0) {
    return new Set(ringLinks.map((l) => l.id));
  }

  const visited = new Set<string>();
  const queue = [upHosts[0]];
  visited.add(upHosts[0]);

  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of graph.get(cur)?.neighbors ?? []) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  // Any UP host not visited is isolated
  const isolated = upHosts.filter((h) => !visited.has(h));
  if (isolated.length === 0) return new Set();

  // Mark links adjacent to isolated hosts
  const impacted = new Set<string>();
  for (const l of ringLinks) {
    if (isolated.includes(l.origin_host_id) || isolated.includes(l.dest_host_id)) {
      impacted.add(l.id);
    }
  }
  return impacted;
}
