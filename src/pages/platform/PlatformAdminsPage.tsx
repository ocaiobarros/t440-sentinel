import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { ShieldCheck, Plus, Trash2, Loader2, Crown } from "lucide-react";

interface PlatformAdminRow {
  id: string;
  user_id: string;
  role: string;
  created_at: string;
}

export default function PlatformAdminsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState("");

  const { data: admins = [], isLoading } = useQuery({
    queryKey: ["platform-admins-list"],
    queryFn: async () => {
      // Platform admins can only see their own record via RLS
      // For a full list, we need to use an edge function or service role
      // For now, use the current user's visibility
      const { data, error } = await supabase
        .from("platform_admins")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) {
        console.warn("[PlatformAdminsPage] Error:", error.message);
        return [];
      }
      return (data ?? []) as PlatformAdminRow[];
    },
  });

  const { data: profileMap = {} } = useQuery({
    queryKey: ["platform-admins-profiles"],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke("tenant-admin", { body: { action: "members" } });
      const profiles = (data?.profiles ?? []) as { id: string; display_name: string | null; email: string | null }[];
      return Object.fromEntries(profiles.map((p) => [p.id, { name: p.display_name ?? p.email ?? "—", email: p.email ?? "" }]));
    },
  });

  const addMutation = useMutation({
    mutationFn: async (targetEmail: string) => {
      // Find user by email via edge function
      const { data, error } = await supabase.functions.invoke("tenant-admin", {
        body: { action: "add_platform_admin", email: targetEmail.trim().toLowerCase() },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({ title: "Platform Admin adicionado" });
      setAddOpen(false);
      setEmail("");
      queryClient.invalidateQueries({ queryKey: ["platform-admins-list"] });
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "Erro", description: err?.message });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Platform Admins</h2>
          <p className="text-sm text-muted-foreground mt-1">Gerencie quem tem acesso ao Platform Hub.</p>
        </div>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Adicionar Admin
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {admins.map((admin) => {
            const profile = profileMap[admin.user_id];
            return (
              <div key={admin.id} className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center">
                    <Crown className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{profile?.name ?? admin.user_id.slice(0, 8)}</p>
                    <p className="text-xs text-muted-foreground font-mono">{profile?.email ?? ""}</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs font-mono">{admin.role}</Badge>
              </div>
            );
          })}
          {admins.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="text-sm">Nenhum platform admin encontrado.</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={(o) => !addMutation.isPending && setAddOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Platform Admin</DialogTitle>
            <DialogDescription>O usuário precisa existir na plataforma.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">E-mail do usuário</Label>
            <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@empresa.com" className="bg-muted/50 border-border" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={() => addMutation.mutate(email)} disabled={addMutation.isPending || !email.trim()}>
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />} Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
