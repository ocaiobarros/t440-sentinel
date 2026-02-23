import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useCallback, useState } from "react";
import { useToast } from "@/hooks/use-toast";

export interface AlertInstance {
  id: string;
  tenant_id: string;
  title: string;
  summary: string | null;
  severity: "info" | "warning" | "average" | "high" | "disaster";
  status: "open" | "ack" | "resolved";
  dedupe_key: string;
  payload: Record<string, any>;
  opened_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  suppressed: boolean;
  rule_id: string | null;
  created_at: string;
  updated_at: string;
  ack_due_at: string | null;
  resolve_due_at: string | null;
  ack_breached_at: string | null;
  resolve_breached_at: string | null;
}

export interface AlertEvent {
  id: string;
  alert_id: string;
  event_type: string;
  from_status: string | null;
  to_status: string | null;
  user_id: string | null;
  message: string | null;
  payload: Record<string, any>;
  occurred_at: string;
}

export function useAlertInstances(filters: {
  statuses?: ("open" | "ack" | "resolved")[];
  severities?: ("info" | "warning" | "average" | "high" | "disaster")[];
}) {
  return useQuery({
    queryKey: ["alert-instances", filters],
    queryFn: async () => {
      let q = supabase
        .from("alert_instances")
        .select("*")
        .order("opened_at", { ascending: false })
        .limit(500);

      if (filters.statuses?.length) {
        q = q.in("status", filters.statuses);
      }
      if (filters.severities?.length) {
        q = q.in("severity", filters.severities);
      }

      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as AlertInstance[];
    },
    refetchInterval: 30_000,
  });
}

export function useAlertEvents(alertId: string | null) {
  return useQuery({
    queryKey: ["alert-events", alertId],
    enabled: !!alertId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("alert_events")
        .select("*")
        .eq("alert_id", alertId!)
        .order("occurred_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AlertEvent[];
    },
  });
}

export function useAlertActions() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const transition = useMutation({
    mutationFn: async ({ alertId, to, message }: { alertId: string; to: "ack" | "resolved"; message?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.rpc("alert_transition", {
        p_alert_id: alertId,
        p_to: to,
        p_user_id: user.id,
        p_message: message ?? null,
      });
      if (error) throw error;
    },
    onSuccess: (_, v) => {
      qc.invalidateQueries({ queryKey: ["alert-instances"] });
      qc.invalidateQueries({ queryKey: ["alert-events", v.alertId] });
      toast({ title: v.to === "ack" ? "Alerta reconhecido" : "Alerta resolvido" });
    },
    onError: (e) => toast({ variant: "destructive", title: "Erro", description: String(e) }),
  });

  return { transition };
}

export function useAlertRealtime() {
  const qc = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("incidents-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "alert_instances" },
        () => {
          qc.invalidateQueries({ queryKey: ["alert-instances"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);
}
