import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useQueryClient } from "@tanstack/react-query";

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface TenantFilterContextType {
  /** The currently active tenant */
  activeTenantId: string | null;
  /** Set a specific tenant to filter by */
  setActiveTenantId: (id: string | null) => void;
  /** Whether the current user is a super admin */
  isSuperAdmin: boolean;
  /** Whether the user has access to multiple tenants */
  hasMultipleTenants: boolean;
  /** List of tenants the user belongs to */
  tenants: TenantOption[];
  /** Name of the active tenant */
  activeTenantName: string | null;
  /** Clear the filter (show all — super admin only) */
  clearFilter: () => void;
}

const TenantFilterCtx = createContext<TenantFilterContextType>({
  activeTenantId: null,
  setActiveTenantId: () => {},
  isSuperAdmin: false,
  hasMultipleTenants: false,
  tenants: [],
  activeTenantName: null,
  clearFilter: () => {},
});

const STORAGE_KEY = "fp_tenant_filter";

export function TenantFilterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  // Load tenants the user belongs to (via user_roles)
  useEffect(() => {
    if (!user?.id) {
      setIsSuperAdmin(false);
      setTenants([]);
      return;
    }

    let cancelled = false;

    (async () => {
      // Check super admin status
      const { data: isSA } = await supabase.rpc("is_super_admin", { p_user_id: user.id });
      if (cancelled) return;
      const superAdmin = Boolean(isSA);
      setIsSuperAdmin(superAdmin);

      let tenantList: TenantOption[] = [];

      if (superAdmin) {
        // Super admins prefer edge function list, but fallback to direct table for backward compatibility
        const { data, error } = await supabase.functions.invoke("tenant-admin", {
          body: { action: "list" },
        });
        if (cancelled) return;

        const functionError =
          (typeof data?.error === "string" && data.error) ||
          (typeof error?.message === "string" && error.message) ||
          "";

        if (error || data?.error) {
          const { data: tenantRows, error: tenantRowsError } = await supabase
            .from("tenants")
            .select("id, name, slug")
            .order("name");
          if (cancelled) return;

          if (tenantRowsError) {
            console.error("[TenantFilter] Falha ao listar tenants:", functionError || tenantRowsError.message);
            tenantList = [];
          } else {
            tenantList = (tenantRows ?? []) as TenantOption[];
          }
        } else {
          tenantList = (data?.tenants ?? []) as TenantOption[];
        }
      } else {
        // Regular users: get tenants from user_roles
        const { data: roles } = await supabase
          .from("user_roles")
          .select("tenant_id")
          .eq("user_id", user.id);
        if (cancelled) return;

        const uniqueTenantIds = [...new Set((roles ?? []).map((r) => r.tenant_id))];

        if (uniqueTenantIds.length > 0) {
          const { data: tenantRows } = await supabase
            .from("tenants")
            .select("id, name, slug")
            .in("id", uniqueTenantIds)
            .order("name");
          if (cancelled) return;
          tenantList = (tenantRows ?? []) as TenantOption[];
        }
      }

      setTenants(tenantList);

      // Validate stored filter
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored && !tenantList.some((t) => t.id === stored)) {
        sessionStorage.removeItem(STORAGE_KEY);
        setActiveTenantIdState(null);
      }

      // Auto-select: use stored, or user's profile tenant, or first available
      const currentStored = sessionStorage.getItem(STORAGE_KEY);
      if (!currentStored && tenantList.length > 0) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;

        const defaultTenant = profile?.tenant_id && tenantList.some((t) => t.id === profile.tenant_id)
          ? profile.tenant_id
          : tenantList[0].id;

        setActiveTenantIdState(defaultTenant);
        sessionStorage.setItem(STORAGE_KEY, defaultTenant);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id]);

  const setActiveTenantId = useCallback((id: string | null) => {
    setActiveTenantIdState(id);
    if (id) {
      sessionStorage.setItem(STORAGE_KEY, id);
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
    // Invalidate all cached queries so data reloads for the new tenant
    queryClient.invalidateQueries();
  }, [queryClient]);

  const clearFilter = useCallback(() => {
    setActiveTenantIdState(null);
    sessionStorage.removeItem(STORAGE_KEY);
    queryClient.invalidateQueries();
  }, [queryClient]);

  const activeTenantName = tenants.find((t) => t.id === activeTenantId)?.name ?? null;
  const hasMultipleTenants = tenants.length > 1;

  return (
    <TenantFilterCtx.Provider
      value={{
        activeTenantId,
        setActiveTenantId,
        isSuperAdmin,
        hasMultipleTenants,
        tenants,
        activeTenantName,
        clearFilter,
      }}
    >
      {children}
    </TenantFilterCtx.Provider>
  );
}

export const useTenantFilter = () => useContext(TenantFilterCtx);
