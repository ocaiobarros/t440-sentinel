import { useState, useEffect } from "react";
import { Bell } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AlertItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  created_at: string;
}

export default function NotificationBell() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("alert_instances")
        .select("id, title, severity, status, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      if (data) setAlerts(data);
    })();
  }, [open]);

  const unread = alerts.filter(a => a.status === "open").length;

  const severityColor: Record<string, string> = {
    critical: "bg-[hsl(var(--neon-red))]",
    high: "bg-[hsl(var(--neon-amber))]",
    medium: "bg-[hsl(var(--neon-blue))]",
    low: "bg-muted-foreground",
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative h-7 w-7 rounded-lg flex items-center justify-center
          text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-destructive
              text-[8px] font-bold text-destructive-foreground flex items-center justify-center">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72 bg-card border-border/50 backdrop-blur-xl z-50 max-h-80 overflow-y-auto">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-display">
          Notificações Recentes
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border/30" />

        {alerts.length === 0 ? (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            Nenhum alerta recente
          </div>
        ) : (
          alerts.map(a => (
            <div key={a.id} className="px-3 py-2 hover:bg-muted/30 transition-colors cursor-default">
              <div className="flex items-start gap-2">
                <div className={`mt-1.5 h-2 w-2 rounded-full shrink-0 ${severityColor[a.severity] || "bg-muted-foreground"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-foreground/90 truncate">{a.title}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className={`text-[9px] font-mono uppercase ${a.status === "open" ? "text-[hsl(var(--neon-red))]" : a.status === "ack" ? "text-[hsl(var(--neon-amber))]" : "text-[hsl(var(--neon-green))]"}`}>
                      {a.status}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(a.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
