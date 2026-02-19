import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface RMSConnectionItem {
  id: string;
  name: string;
  url: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
}

function invoke(action: string, extra: Record<string, unknown> = {}) {
  return supabase.functions.invoke("rms-connections", {
    body: { action, ...extra },
  });
}

export function useRMSConnections() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const key = ["rms-connections"];

  const query = useQuery({
    queryKey: key,
    queryFn: async () => {
      const { data, error } = await invoke("list");
      if (error) throw error;
      return (data as { connections: RMSConnectionItem[] }).connections;
    },
  });

  const createMutation = useMutation({
    mutationFn: async (input: { name: string; url: string; api_token: string }) => {
      const { data, error } = await invoke("create", input);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Conexão RMS criada com sucesso" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro ao criar conexão", description: String(err) });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (input: { id: string; name?: string; url?: string; api_token?: string; is_active?: boolean }) => {
      const { data, error } = await invoke("update", input);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Conexão RMS atualizada" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro ao atualizar", description: String(err) });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await invoke("delete", { id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: key });
      toast({ title: "Conexão RMS removida" });
    },
    onError: (err) => {
      toast({ variant: "destructive", title: "Erro ao remover", description: String(err) });
    },
  });

  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [testing, setTesting] = useState(false);

  const testConnection = useCallback(async (input: { id?: string; url?: string; api_token?: string }) => {
    setTesting(true);
    setTestResult(null);
    try {
      const { data, error } = await invoke("test", input);
      if (error) throw error;
      setTestResult(data as { ok: boolean; error?: string });
    } catch (err) {
      setTestResult({ ok: false, error: String(err) });
    } finally {
      setTesting(false);
    }
  }, []);

  return {
    connections: query.data ?? [],
    isLoading: query.isLoading,
    create: createMutation.mutateAsync,
    isCreating: createMutation.isPending,
    update: updateMutation.mutateAsync,
    isUpdating: updateMutation.isPending,
    remove: deleteMutation.mutateAsync,
    isDeleting: deleteMutation.isPending,
    testConnection,
    testing,
    testResult,
    clearTestResult: () => setTestResult(null),
  };
}
