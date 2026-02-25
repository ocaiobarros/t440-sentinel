import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, Eye, Pencil, Trash2, LayoutDashboard, ExternalLink, Download, Upload } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import RoleGate from "@/components/auth/RoleGate";

interface ModuleDashboardListProps {
  category: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  /** Path for the "New Panel" button. Defaults to /builder?category={category} */
  createPath?: string;
  /** Base path for viewing a saved panel. Defaults to /dashboard/{id}. If set, navigates to {viewBasePath}/{id} */
  viewBasePath?: string;
}

export default function ModuleDashboardList({ category, title, description, icon, createPath, viewBasePath }: ModuleDashboardListProps) {
  const defaultCreatePath = createPath || `/builder?category=${category}`;
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ["dashboards", category],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboards")
        .select("id, name, description, is_default, updated_at, zabbix_connection_id, category")
        .eq("category", category)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from("widgets").delete().eq("dashboard_id", id);
      const { error } = await supabase.from("dashboards").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboards", category] });
      toast({ title: "Painel excluído" });
    },
  });

  // ── Export logic ──
  const handleExport = useCallback(async (dashId: string, dashName: string) => {
    try {
      const [{ data: dash, error: dErr }, { data: widgets, error: wErr }] = await Promise.all([
        supabase.from("dashboards").select("name, description, category, settings, layout").eq("id", dashId).single(),
        supabase.from("widgets").select("widget_type, title, position_x, position_y, width, height, config, query, adapter").eq("dashboard_id", dashId),
      ]);
      if (dErr || wErr) throw dErr || wErr;

      const payload = {
        _flowpulse_version: 1,
        exported_at: new Date().toISOString(),
        dashboard: dash,
        widgets: widgets ?? [],
      };

      const slug = dashName.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
      const date = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `flowpulse-dash-${slug}-${date}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exportado!", description: `"${dashName}" salvo como JSON.` });
    } catch (err) {
      toast({ title: "Erro ao exportar", description: (err as Error).message, variant: "destructive" });
    }
  }, [toast]);

  // ── Import logic ──
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // reset so same file can be re-imported
    e.target.value = "";

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      // Validate structure
      if (!payload?._flowpulse_version || !payload?.dashboard || !Array.isArray(payload?.widgets)) {
        throw new Error("Arquivo JSON inválido — não é um export FlowPulse.");
      }

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) throw new Error("Não autenticado");
      const userId = session.session.user.id;
      const { data: tenantData } = await supabase.rpc("get_user_tenant_id", { p_user_id: userId });
      const tenantId = tenantData as string;

      const dashData = payload.dashboard;
      const importedName = `${dashData.name ?? "Importado"} (Import)`;

      // Create dashboard — strip any sensitive fields
      const { data: newDash, error: insertErr } = await supabase.from("dashboards").insert({
        tenant_id: tenantId,
        name: importedName,
        description: dashData.description ?? null,
        category: dashData.category ?? category,
        settings: dashData.settings ?? {},
        layout: dashData.layout ?? [],
        created_by: userId,
      } as any).select("id").single();
      if (insertErr) throw insertErr;

      // Insert widgets
      if (payload.widgets.length > 0 && newDash) {
        const widgetRows = payload.widgets.map((w: any) => ({
          dashboard_id: newDash.id,
          widget_type: w.widget_type,
          title: w.title ?? "Widget",
          position_x: w.position_x ?? 0,
          position_y: w.position_y ?? 0,
          width: w.width ?? 4,
          height: w.height ?? 3,
          config: w.config ?? {},
          query: w.query ?? {},
          adapter: w.adapter ?? {},
        }));
        const { error: wInsertErr } = await supabase.from("widgets").insert(widgetRows);
        if (wInsertErr) throw wInsertErr;
      }

      queryClient.invalidateQueries({ queryKey: ["dashboards", category] });
      toast({ title: "Importado com sucesso!", description: `Dashboard "${importedName}" importado para a CBLabs!` });
    } catch (err) {
      toast({ title: "Erro ao importar", description: (err as Error).message, variant: "destructive" });
    }
  }, [category, queryClient, toast]);

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Hidden file input for import */}
      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImport} />

      <div className="max-w-[1200px] mx-auto relative z-10">
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-3">
            {icon}
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">{title}</h1>
              <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <RoleGate allowed={["admin", "editor"]}>
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 text-xs"
              >
                <Upload className="w-3.5 h-3.5" />
                Importar
              </Button>
            </RoleGate>

            <RoleGate allowed={["admin", "editor"]}>
              <Button
                size="sm"
                onClick={() => navigate(defaultCreatePath)}
                className="gap-1.5 text-xs bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
              >
                <Plus className="w-3.5 h-3.5" />
                Novo Painel
              </Button>
            </RoleGate>
          </div>
        </motion.header>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="glass-card rounded-xl p-6 h-[180px] animate-pulse" />
            ))}
          </div>
        ) : dashboards.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card-elevated rounded-xl p-12 text-center max-w-md mx-auto"
          >
            <LayoutDashboard className="w-12 h-12 text-neon-green mx-auto mb-4" />
            <h2 className="text-lg font-display font-bold text-foreground mb-2">Nenhum painel criado</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Crie seu primeiro painel de {title.toLowerCase()} para começar o monitoramento.
            </p>
            <RoleGate allowed={["admin", "editor"]}>
              <Button
                onClick={() => navigate(defaultCreatePath)}
                className="gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
              >
                <Plus className="w-4 h-4" />
                Criar Painel
              </Button>
            </RoleGate>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((dash, i) => {
              const viewUrl = viewBasePath ? `${viewBasePath}/${dash.id}` : `/dashboard/${dash.id}`;
              const kioskUrl = `${viewUrl}?kiosk=true`;
              const openNewTab = () => window.open(viewUrl, "_blank");
              const openKiosk = () => window.open(kioskUrl, "_blank");

              return (
                <ContextMenu key={dash.id}>
                  <ContextMenuTrigger asChild>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="glass-card rounded-xl p-5 border border-border/50 hover:border-neon-green/20 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="text-sm font-display font-bold text-foreground group-hover:text-neon-green transition-colors">
                            {dash.name}
                          </h3>
                          {dash.description && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{dash.description}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-4">
                        <span className={`w-1.5 h-1.5 rounded-full ${dash.zabbix_connection_id ? "bg-neon-green pulse-green" : "bg-muted-foreground/30"}`} />
                        <span>{dash.zabbix_connection_id ? "Conectado" : "Sem conexão"}</span>
                        <span className="mx-1">•</span>
                        <span>{new Date(dash.updated_at).toLocaleDateString("pt-BR")}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => navigate(viewUrl)} className="flex-1 gap-1 text-[10px] h-7">
                          <Eye className="w-3 h-3" /> Visualizar
                        </Button>
                        <Button variant="outline" size="sm" onClick={openNewTab} className="gap-1 text-[10px] h-7" title="Abrir em nova aba">
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => handleExport(dash.id, dash.name)} className="gap-1 text-[10px] h-7" title="Exportar JSON">
                          <Download className="w-3 h-3" />
                        </Button>
                        <RoleGate allowed={["admin", "editor"]}>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/builder/${dash.id}`)} className="flex-1 gap-1 text-[10px] h-7">
                            <Pencil className="w-3 h-3" /> Editar
                          </Button>
                        </RoleGate>
                        <RoleGate allowed={["admin"]}>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(dash.id)} className="h-7 w-7 text-muted-foreground hover:text-neon-red">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </RoleGate>
                      </div>
                    </motion.div>
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-52 bg-card/95 backdrop-blur-xl border-border/50">
                    <ContextMenuItem onClick={openNewTab} className="gap-2 text-xs cursor-pointer">
                      <ExternalLink className="w-3.5 h-3.5" /> Abrir em Nova Aba
                    </ContextMenuItem>
                    <ContextMenuItem onClick={openKiosk} className="gap-2 text-xs cursor-pointer">
                      <Eye className="w-3.5 h-3.5" /> Abrir em Modo Kiosk
                    </ContextMenuItem>
                    <ContextMenuItem onClick={() => handleExport(dash.id, dash.name)} className="gap-2 text-xs cursor-pointer">
                      <Download className="w-3.5 h-3.5" /> Exportar Config (JSON)
                    </ContextMenuItem>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
