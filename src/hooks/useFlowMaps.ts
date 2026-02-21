import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface FlowMap {
  id: string;
  tenant_id: string;
  name: string;
  center_lat: number;
  center_lon: number;
  zoom: number;
  theme: string;
  refresh_interval: number;
  created_at: string;
  updated_at: string;
}

export interface FlowMapHost {
  id: string;
  map_id: string;
  tenant_id: string;
  zabbix_host_id: string;
  host_name: string;
  host_group: string;
  lat: number;
  lon: number;
  icon_type: string;
  is_critical: boolean;
}

export interface FlowMapLink {
  id: string;
  map_id: string;
  tenant_id: string;
  origin_host_id: string;
  dest_host_id: string;
  link_type: string;
  is_ring: boolean;
  priority: number;
  geometry: { type: string; coordinates: [number, number][] };
  /* ── Engine columns ── */
  capacity_mbps: number;
  status_strategy: string;
  origin_role: string;
  dest_role: string;
  current_status: string;
  last_status_change: string | null;
}

export interface FlowMapLinkItem {
  id: string;
  tenant_id: string;
  link_id: string;
  side: "A" | "B";
  direction: "IN" | "OUT";
  metric: "BPS" | "PPS" | "STATUS" | "UTIL" | "ERRORS";
  zabbix_host_id: string;
  zabbix_item_id: string;
  key_: string;
  name: string;
  created_at: string;
}

export interface HostStatus {
  status: "UP" | "DOWN" | "UNKNOWN";
  latency?: number;
  lastCheck?: string;
  availability24h?: number;
}

/* ── List maps ── */
export function useFlowMapList() {
  return useQuery({
    queryKey: ["flow-maps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_maps")
        .select("*")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as FlowMap[];
    },
  });
}

/* ── Single map with hosts & links ── */
export function useFlowMapDetail(mapId: string | undefined) {
  return useQuery({
    queryKey: ["flow-map", mapId],
    enabled: !!mapId,
    queryFn: async () => {
      const [mapRes, hostsRes, linksRes] = await Promise.all([
        supabase.from("flow_maps").select("*").eq("id", mapId!).single(),
        supabase.from("flow_map_hosts").select("*").eq("map_id", mapId!),
        supabase.from("flow_map_links").select("*").eq("map_id", mapId!),
      ]);
      if (mapRes.error) throw mapRes.error;
      return {
        map: mapRes.data as FlowMap,
        hosts: (hostsRes.data ?? []) as FlowMapHost[],
        links: (linksRes.data ?? []) as unknown as FlowMapLink[],
      };
    },
  });
}

/* ── Link items for a specific link ── */
export function useFlowMapLinkItems(linkId: string | undefined) {
  return useQuery({
    queryKey: ["flow-map-link-items", linkId],
    enabled: !!linkId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("flow_map_link_items" as any)
        .select("*")
        .eq("link_id", linkId!);
      if (error) throw error;
      return (data ?? []) as unknown as FlowMapLinkItem[];
    },
  });
}

/* ── Mutations ── */
export function useFlowMapMutations() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const createMap = useMutation({
    mutationFn: async (input: Partial<FlowMap> & { tenant_id: string; name: string }) => {
      const { data, error } = await supabase.from("flow_maps").insert(input).select().single();
      if (error) throw error;
      return data as FlowMap;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-maps"] });
      toast({ title: "Mapa criado" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro ao criar mapa", description: String(e) }),
  });

  const updateMap = useMutation({
    mutationFn: async ({ id, ...rest }: Partial<FlowMap> & { id: string }) => {
      const { error } = await supabase.from("flow_maps").update(rest).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["flow-maps"] });
      qc.invalidateQueries({ queryKey: ["flow-map", v.id] });
      toast({ title: "Mapa atualizado" });
    },
  });

  const deleteMap = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("flow_maps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["flow-maps"] });
      toast({ title: "Mapa excluído" });
    },
  });

  const addHost = useMutation({
    mutationFn: async (input: Omit<FlowMapHost, "id">) => {
      const { data, error } = await supabase.from("flow_map_hosts").insert(input as any).select().single();
      if (error) throw error;
      return data as FlowMapHost;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["flow-map", v.map_id] }),
  });

  const removeHost = useMutation({
    mutationFn: async ({ id, map_id }: { id: string; map_id: string }) => {
      const { error } = await supabase.from("flow_map_hosts").delete().eq("id", id);
      if (error) throw error;
      return map_id;
    },
    onSuccess: (mapId) => qc.invalidateQueries({ queryKey: ["flow-map", mapId] }),
  });

  const addLink = useMutation({
    mutationFn: async (input: Omit<FlowMapLink, "id" | "capacity_mbps" | "status_strategy" | "origin_role" | "dest_role" | "current_status" | "last_status_change"> & Partial<Pick<FlowMapLink, "capacity_mbps" | "status_strategy" | "origin_role" | "dest_role" | "current_status" | "last_status_change">>) => {
      const { data, error } = await supabase.from("flow_map_links").insert(input as any).select().single();
      if (error) throw error;
      return data as unknown as FlowMapLink;
    },
    onSuccess: (_, v) => qc.invalidateQueries({ queryKey: ["flow-map", v.map_id] }),
  });

  const updateLink = useMutation({
    mutationFn: async ({ id, map_id, ...rest }: Partial<FlowMapLink> & { id: string; map_id: string }) => {
      const { error } = await supabase.from("flow_map_links").update(rest as any).eq("id", id);
      if (error) throw error;
      return map_id;
    },
    onSuccess: (mapId) => qc.invalidateQueries({ queryKey: ["flow-map", mapId] }),
  });

  const removeLink = useMutation({
    mutationFn: async ({ id, map_id }: { id: string; map_id: string }) => {
      const { error } = await supabase.from("flow_map_links").delete().eq("id", id);
      if (error) throw error;
      return map_id;
    },
    onSuccess: (mapId) => qc.invalidateQueries({ queryKey: ["flow-map", mapId] }),
  });

  /* ── Link Item mutations ── */
  const addLinkItem = useMutation({
    mutationFn: async (input: Omit<FlowMapLinkItem, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("flow_map_link_items" as any)
        .insert(input as any)
        .select()
        .single();
      if (error) throw error;
      return data as unknown as FlowMapLinkItem;
    },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ["flow-map-link-items", d.link_id] });
    },
  });

  const removeLinkItem = useMutation({
    mutationFn: async ({ id, link_id }: { id: string; link_id: string }) => {
      const { error } = await supabase.from("flow_map_link_items" as any).delete().eq("id", id);
      if (error) throw error;
      return link_id;
    },
    onSuccess: (linkId) => {
      qc.invalidateQueries({ queryKey: ["flow-map-link-items", linkId] });
    },
  });

  return { createMap, updateMap, deleteMap, addHost, removeHost, addLink, updateLink, removeLink, addLinkItem, removeLinkItem };
}
