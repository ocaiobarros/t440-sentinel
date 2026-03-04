import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";

export interface ResourceGrant {
  id: string;
  resource_type: string;
  resource_id: string;
  grantee_type: "user" | "team";
  grantee_id: string;
  access_level: "viewer" | "editor";
  granted_by: string | null;
  created_at: string;
  // joined
  grantee_name?: string;
}

export function useResourceAccess(resourceType: string, resourceId: string | undefined) {
  const queryClient = useQueryClient();
  const { tenantId } = useUserRole();

  const resolveResourceTenantId = async (): Promise<string | null> => {
    if (!resourceId) return null;

    if (resourceType === "dashboard") {
      const { data, error } = await supabase
        .from("dashboards")
        .select("tenant_id")
        .eq("id", resourceId)
        .maybeSingle();
      if (error) throw error;
      return data?.tenant_id ?? tenantId;
    }

    if (resourceType === "flow_map") {
      const { data, error } = await supabase
        .from("flow_maps")
        .select("tenant_id")
        .eq("id", resourceId)
        .maybeSingle();
      if (error) throw error;
      return data?.tenant_id ?? tenantId;
    }

    return tenantId;
  };

  const { data: grants = [], isLoading } = useQuery({
    queryKey: ["resource-access", resourceType, resourceId],
    enabled: !!resourceId && !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("resource_access")
        .select("*")
        .eq("resource_type", resourceType)
        .eq("resource_id", resourceId!);
      if (error) throw error;

      // Enrich with names
      const userIds = data.filter(g => g.grantee_type === "user").map(g => g.grantee_id);
      const teamIds = data.filter(g => g.grantee_type === "team").map(g => g.grantee_id);

      const [profiles, teams] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, display_name, email").in("id", userIds).then(r => r.data ?? [])
          : Promise.resolve([]),
        teamIds.length > 0
          ? supabase.from("teams").select("id, name").in("id", teamIds).then(r => r.data ?? [])
          : Promise.resolve([]),
      ]);

      const nameMap: Record<string, string> = {};
      profiles.forEach(p => { nameMap[p.id] = p.display_name || p.email || p.id; });
      teams.forEach(t => { nameMap[t.id] = t.name; });

      return data.map(g => ({ ...g, grantee_name: nameMap[g.grantee_id] || g.grantee_id })) as ResourceGrant[];
    },
  });

  const addGrant = useMutation({
    mutationFn: async (params: { grantee_type: "user" | "team"; grantee_id: string; access_level: "viewer" | "editor" }) => {
      if (!resourceId) throw new Error("Contexto ausente: resourceId não definido");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const resolvedTenantId = await resolveResourceTenantId();
      if (!resolvedTenantId) throw new Error("Tenant do recurso não identificado");

      console.log("[ResourceAccess] Granting:", { tenantId: resolvedTenantId, resourceType, resourceId, ...params, granted_by: user.id });

      const { data, error } = await supabase.from("resource_access").upsert({
        tenant_id: resolvedTenantId,
        resource_type: resourceType,
        resource_id: resourceId,
        grantee_type: params.grantee_type,
        grantee_id: params.grantee_id,
        access_level: params.access_level,
        granted_by: user.id,
      }, { onConflict: "tenant_id,resource_type,resource_id,grantee_type,grantee_id" })
        .select("id")
        .single();

      if (error) {
        console.error("[ResourceAccess] Grant failed:", error);
        throw new Error(`Falha ao conceder acesso: ${error.message}`);
      }
      console.log("[ResourceAccess] Grant success:", data);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resource-access", resourceType, resourceId] }),
  });

  const removeGrant = useMutation({
    mutationFn: async (grantId: string) => {
      const { error } = await supabase.from("resource_access").delete().eq("id", grantId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resource-access", resourceType, resourceId] }),
  });

  const updateLevel = useMutation({
    mutationFn: async (params: { grantId: string; access_level: "viewer" | "editor" }) => {
      const { error } = await supabase.from("resource_access").update({ access_level: params.access_level }).eq("id", params.grantId);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["resource-access", resourceType, resourceId] }),
  });

  return { grants, isLoading, addGrant, removeGrant, updateLevel };
}
