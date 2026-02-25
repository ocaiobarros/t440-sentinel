import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Plus, Eye, Pencil, Trash2, Settings, Zap, LayoutDashboard, Server, ExternalLink } from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useToast } from "@/hooks/use-toast";
import RoleGate from "@/components/auth/RoleGate";

export default function DashboardList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboards")
        .select("id, name, description, is_default, updated_at, zabbix_connection_id")
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
      queryClient.invalidateQueries({ queryKey: ["dashboards"] });
      toast({ title: t("dashboards.deleted") });
    },
  });

  const localeDateStr = i18n.language === "en" ? "en-US" : i18n.language === "es" ? "es" : "pt-BR";

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative p-4 md:p-6 lg:p-8">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-green/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-0 w-[400px] h-[400px] bg-neon-blue/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-[1200px] mx-auto relative z-10">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div>
            <h1 className="text-2xl font-display font-bold text-foreground flex items-center gap-3">
              <Zap className="w-6 h-6 text-neon-green" />
              <span className="text-glow-green text-neon-green">{t("dashboards.title")}</span>
            </h1>
            <p className="text-xs text-muted-foreground mt-1">{t("dashboards.subtitle")}</p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/templates/server-monitor")}
              className="gap-1.5 text-xs"
            >
              <Server className="w-3.5 h-3.5" />
              {t("dashboards.templates")}
            </Button>
            <RoleGate allowed={["admin"]}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate("/app/settings/connections")}
                className="gap-1.5 text-xs"
              >
                <Settings className="w-3.5 h-3.5" />
                {t("dashboards.connections")}
              </Button>
            </RoleGate>
            <RoleGate allowed={["admin", "editor"]}>
              <Button
                size="sm"
                onClick={() => navigate("/builder")}
                className="gap-1.5 text-xs bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
              >
                <Plus className="w-3.5 h-3.5" />
                {t("dashboards.newDashboard")}
              </Button>
            </RoleGate>
          </div>
        </motion.header>

        {/* Dashboard Grid */}
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
            <h2 className="text-lg font-display font-bold text-foreground mb-2">{t("dashboards.createFirst")}</h2>
            <p className="text-sm text-muted-foreground mb-6">
              {t("dashboards.createFirstDesc")}
            </p>
            <Button
              onClick={() => navigate("/builder")}
              className="gap-2 bg-neon-green/20 text-neon-green border border-neon-green/30 hover:bg-neon-green/30"
            >
              <Plus className="w-4 h-4" />
              {t("dashboards.createDashboard")}
            </Button>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dashboards.map((dash, i) => {
              const viewUrl = `/dashboard/${dash.id}`;
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
                        {dash.is_default && (
                          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-neon-green/10 text-neon-green border border-neon-green/20 font-display uppercase">
                            {t("dashboards.default")}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground mb-4">
                        <span className={`w-1.5 h-1.5 rounded-full ${dash.zabbix_connection_id ? "bg-neon-green pulse-green" : "bg-muted-foreground/30"}`} />
                        <span>{dash.zabbix_connection_id ? t("dashboards.connected") : t("dashboards.noConnection")}</span>
                        <span className="mx-1">•</span>
                        <span>{new Date(dash.updated_at).toLocaleDateString(localeDateStr)}</span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button variant="outline" size="sm" onClick={() => navigate(viewUrl)} className="flex-1 gap-1 text-[10px] h-7">
                          <Eye className="w-3 h-3" /> {t("dashboards.view")}
                        </Button>
                        <Button variant="outline" size="sm" onClick={openNewTab} className="gap-1 text-[10px] h-7" title="Abrir em nova aba">
                          <ExternalLink className="w-3 h-3" />
                        </Button>
                        <RoleGate allowed={["admin", "editor"]}>
                          <Button variant="outline" size="sm" onClick={() => navigate(`/builder/${dash.id}`)} className="flex-1 gap-1 text-[10px] h-7">
                            <Pencil className="w-3 h-3" /> {t("dashboards.edit")}
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
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </div>
        )}

        <div className="text-center py-8">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            {t("dashboards.possibilities")}
          </p>
        </div>
      </div>
    </div>
  );
}
