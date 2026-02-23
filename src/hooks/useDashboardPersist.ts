import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface UseDashboardPersistOptions {
  category: string;
  listPath: string;
}

/**
 * Hook that provides save/load functionality for wizard-based dashboards.
 * - Loads config from DB when dashboardId is present in URL params
 * - Provides a save function that upserts to the dashboards table
 */
export function useDashboardPersist<T>({
  category,
  listPath,
}: UseDashboardPersistOptions) {
  const { dashboardId } = useParams<{ dashboardId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [saving, setSaving] = useState(false);
  const [loadedConfig, setLoadedConfig] = useState<T | null>(null);
  const [loadedName, setLoadedName] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!dashboardId);

  // Load existing dashboard config from DB
  useEffect(() => {
    if (!dashboardId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("dashboards")
        .select("name, settings")
        .eq("id", dashboardId)
        .single();
      if (cancelled) return;
      if (data) {
        const settings = data.settings as Record<string, unknown>;
        setLoadedConfig((settings?.wizardConfig as T) ?? null);
        setLoadedName(data.name);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [dashboardId]);

  const save = useCallback(async (name: string, wizardConfig: T) => {
    setSaving(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error("Not authenticated");
      const userId = session.session.user.id;
      const { data: tenantData } = await supabase.rpc("get_user_tenant_id", { p_user_id: userId });
      const tenantId = tenantData as string;

      if (dashboardId) {
        // Update existing
        const { error } = await supabase.from("dashboards").update({
          name,
          settings: { wizardConfig } as any,
        }).eq("id", dashboardId);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase.from("dashboards").insert({
          tenant_id: tenantId,
          name,
          category,
          settings: { wizardConfig } as any,
          created_by: userId,
        } as any).select("id").single();
        if (error) throw error;
      }

      toast({ title: "Painel salvo!", description: `"${name}" foi persistido na lista de ${category}.` });
      navigate(listPath);
    } catch (err) {
      toast({ title: "Erro ao salvar", description: (err as Error).message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }, [dashboardId, category, listPath, navigate, toast]);

  return { dashboardId, save, saving, loadedConfig, loadedName, loading };
}
