import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface TenantOption {
  id: string;
  name: string;
  slug: string;
}

interface TenantFilterContextType {
  /** The currently active tenant filter (null = show all / normal user) */
  activeTenantId: string | null;
  /** Set a specific tenant to filter by */
  setActiveTenantId: (id: string | null) => void;
  /** Whether the current user is a super admin */
  isSuperAdmin: boolean;
  /** List of all tenants (only populated for super admins) */
  tenants: TenantOption[];
  /** Name of the active tenant */
  activeTenantName: string | null;
  /** Clear the filter (show all) */
  clearFilter: () => void;
}

const TenantFilterCtx = createContext<TenantFilterContextType>({
  activeTenantId: null,
  setActiveTenantId: () => {},
  isSuperAdmin: false,
  tenants: [],
  activeTenantName: null,
  clearFilter: () => {},
});

const STORAGE_KEY = "fp_tenant_filter";

export function TenantFilterProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [activeTenantId, setActiveTenantIdState] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) || null;
    } catch {
      return null;
    }
  });
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [tenants, setTenants] = useState<TenantOption[]>([]);

  // Load super admin status and tenants
  useEffect(() => {
    if (!user?.id) {
      setIsSuperAdmin(false);
      setTenants([]);
      return;
    }

    let cancelled = false;

    (async () => {
      const { data: isSA } = await supabase.rpc("is_super_admin", { p_user_id: user.id });
      if (cancelled) return;
      const superAdmin = Boolean(isSA);
      setIsSuperAdmin(superAdmin);

      if (superAdmin) {
        // Load all tenants via edge function
        const { data } = await supabase.functions.invoke("tenant-admin", {
          body: { action: "list" },
        });
        if (cancelled) return;
        const list = (data?.tenants ?? []) as TenantOption[];
        setTenants(list);

        // If user had a stored filter, validate it still exists
        const stored = sessionStorage.getItem(STORAGE_KEY);
        if (stored && !list.some((t) => t.id === stored)) {
          sessionStorage.removeItem(STORAGE_KEY);
          setActiveTenantIdState(null);
        }

        // Auto-select user's own tenant if no filter is set
        if (!stored && list.length > 0) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("tenant_id")
            .eq("id", user.id)
            .maybeSingle();
          if (cancelled) return;
          if (profile?.tenant_id) {
            setActiveTenantIdState(profile.tenant_id);
            sessionStorage.setItem(STORAGE_KEY, profile.tenant_id);
          }
        }
      } else {
        // Normal users: get their tenant_id from profile
        const { data: profile } = await supabase
          .from("profiles")
          .select("tenant_id")
          .eq("id", user.id)
          .maybeSingle();
        if (cancelled) return;
        if (profile?.tenant_id) {
          setActiveTenantIdState(profile.tenant_id);
        }
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
  }, []);

  const clearFilter = useCallback(() => {
    setActiveTenantIdState(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const activeTenantName = tenants.find((t) => t.id === activeTenantId)?.name ?? null;

  return (
    <TenantFilterCtx.Provider
      value={{
        activeTenantId,
        setActiveTenantId,
        isSuperAdmin,
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
