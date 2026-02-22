import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type AppRole = "admin" | "editor" | "viewer" | "tech" | "sales";

/** Map of role → allowed route prefixes */
const ROLE_ROUTE_ACCESS: Record<AppRole, string[]> = {
  admin: ["*"], // full access
  editor: ["/", "/dashboard", "/builder", "/flowmap", "/settings", "/templates", "/Flow"],
  tech: ["/", "/dashboard", "/flowmap", "/templates"],
  sales: ["/", "/dashboard", "/flowmap"],
  viewer: ["/", "/dashboard", "/flowmap"],
};

/** Which roles can use editing features on the flowmap */
export const FLOWMAP_EDIT_ROLES: AppRole[] = ["admin", "editor", "tech"];

/** Which roles can see the Builder */
export const BUILDER_ROLES: AppRole[] = ["admin", "editor"];

/** Which roles can access admin hub */
export const ADMIN_ROLES: AppRole[] = ["admin"];

/** Which roles can see viability/reservations */
export const VIABILITY_ROLES: AppRole[] = ["admin", "editor", "tech", "sales"];

/** Which roles can see telemetry/OLT health */
export const TELEMETRY_ROLES: AppRole[] = ["admin", "editor", "tech"];

export function useUserRole() {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["user-role", user?.id],
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000, // cache 5 min
    queryFn: async () => {
      // Get tenant
      const { data: profile } = await supabase
        .from("profiles")
        .select("tenant_id")
        .eq("id", user!.id)
        .single();

      if (!profile) return { role: "viewer" as AppRole, tenantId: null, isSuperAdmin: false };

      // Get role
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("tenant_id", profile.tenant_id)
        .single();

      // Check super admin
      const { data: isSuperAdmin } = await supabase.rpc("is_super_admin", { p_user_id: user!.id });

      return {
        role: (roleData?.role as AppRole) ?? "viewer",
        tenantId: profile.tenant_id,
        isSuperAdmin: !!isSuperAdmin,
      };
    },
  });

  const role = data?.role ?? "viewer";
  const isSuperAdmin = data?.isSuperAdmin ?? false;

  const hasRole = (...roles: AppRole[]) => isSuperAdmin || roles.includes(role);

  const canAccessRoute = (path: string) => {
    if (isSuperAdmin) return true;
    const allowed = ROLE_ROUTE_ACCESS[role] ?? [];
    if (allowed.includes("*")) return true;
    return allowed.some((prefix) => path === prefix || path.startsWith(prefix + "/"));
  };

  return {
    role,
    tenantId: data?.tenantId ?? null,
    isSuperAdmin,
    isLoading,
    hasRole,
    canAccessRoute,
  };
}
