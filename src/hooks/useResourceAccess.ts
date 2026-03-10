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
  // joined externally
  grantee_name?: string;
}

export function useResourceAccess(
  resourceType: string,
  resourceId: string | undefined,
  /** Optional name map (id → displayName) to resolve grantee names without extra queries */
  nameMap?: Record<string, string>,
) {
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
      return (data ?? []) as ResourceGrant[];
    },
  });

  // Enrich grants with names from the external nameMap
  const enrichedGrants: ResourceGrant[] = grants.map((g) => ({
    ...g,
    grantee_name: nameMap?.[g.grantee_id] || g.grantee_id,
  }));

  const addGrant = useMutation({
    mutationFn: async (params: { grantee_type: "user" | "team"; grantee_id: string; access_level: "viewer" | "editor" }) => {
      if (!resourceId) throw new Error("Contexto ausente: resourceId não definido");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const resolvedTenantId = await resolveResourceTenantId();
      if (!resolvedTenantId) throw new Error("Tenant do recurso não identificado");

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

  return { grants: enrichedGrants, isLoading, addGrant, removeGrant, updateLevel };
}
