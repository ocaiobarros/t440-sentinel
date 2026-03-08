import { useState, useCallback, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  RefreshCw,
  Activity,
  Clock,
  ChevronDown,
  AlertTriangle,
  Wifi,
  WifiOff,
} from "lucide-react";

interface FunctionProbe {
  name: string;
  description: string;
  status: "idle" | "checking" | "online" | "error" | "timeout";
  latency?: number;
  error?: string;
  lastCheck?: string;
  httpStatus?: number;
}

const EDGE_FUNCTIONS: { name: string; description: string; method?: string; body?: Record<string, unknown> }[] = [
  { name: "system-status", description: "Status do Host / Hardware" },
  { name: "invite-user", description: "Criação & Convite de Usuários" },
  { name: "tenant-admin", description: "Gestão de Organizações" },
  { name: "delete-user", description: "Exclusão de Usuários" },
  { name: "zabbix-proxy", description: "Proxy para API Zabbix" },
  { name: "zabbix-poller", description: "Poller de Telemetria Zabbix" },
  { name: "zabbix-connections", description: "Gestão de Conexões Zabbix" },
  { name: "zabbix-webhook", description: "Webhook de Alertas Zabbix" },
  { name: "flowmap-status", description: "Status do FlowMap" },
  { name: "flowmap-route", description: "Roteamento de FlowMap" },
  { name: "rms-connections", description: "Conexões RMS" },
  { name: "rms-fueling", description: "Abastecimento RMS" },
  { name: "printer-status", description: "Status de Impressoras" },
  { name: "bgp-collector", description: "Coletor BGP" },
  { name: "telegram-bot", description: "Bot do Telegram" },
  { name: "alert-ingest", description: "Ingestão de Alertas" },
  { name: "alert-escalation-worker", description: "Worker de Escalonamento" },
  { name: "billing-cron", description: "Cron de Faturamento" },
  { name: "finance-import", description: "Importação Financeira" },
  { name: "cto-status-aggregator", description: "Agregador de Status CTO" },
  { name: "telemetry-wizard", description: "Wizard de Telemetria" },
  { name: "webhook-token-manage", description: "Gestão de Tokens Webhook" },
  { name: "seed-admin", description: "Seed de Admin Inicial" },
  { name: "flowpulse-reactor", description: "Reactor de Eventos" },
];

const AUTO_REFRESH_INTERVAL = 60_000; // 60s

export default function BackendHealthPanel() {
  const [functions, setFunctions] = useState<FunctionProbe[]>(
    EDGE_FUNCTIONS.map((f) => ({
      name: f.name,
      description: f.description,
      status: "idle",
    }))
  );
  const [running, setRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());

  const probeFunction = useCallback(
    async (fn: (typeof EDGE_FUNCTIONS)[0], index: number) => {
      setFunctions((prev) =>
        prev.map((f, i) => (i === index ? { ...f, status: "checking" as const, error: undefined, httpStatus: undefined } : f))
      );

      const start = Date.now();
      try {
        // Use supabase.functions.invoke() for proper CORS handling.
        // We send a lightweight POST — functions return errors but that proves they're deployed.
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new DOMException("Timeout", "AbortError")), 8000)
        );

        const invokePromise = supabase.functions.invoke(fn.name, {
          method: "POST",
          body: { _healthcheck: true },
        });

        const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
        const latency = Date.now() - start;

        // If we got ANY response (even an error like 401/403/400), the function is deployed & online.
        // Only FunctionsRelayError or network failures mean the function is down.
        const isNetworkError = error?.message?.includes("Failed to fetch") || 
                               error?.message?.includes("FunctionsRelayError") ||
                               error?.message?.includes("non-2xx");
        // If there's no error, or the error is a business logic error (not network), it's online
        const isOnline = !error || !isNetworkError;

        setFunctions((prev) =>
          prev.map((f, i) =>
            i === index
              ? {
                  ...f,
                  status: isOnline ? "online" : "error",
                  latency,
                  httpStatus: undefined,
                  error: isOnline ? undefined : (error?.message || "Erro desconhecido"),
                  lastCheck: new Date().toLocaleTimeString("pt-BR"),
                }
              : f
          )
        );
      } catch (err: any) {
        const latency = Date.now() - start;
        const isTimeout = err.name === "AbortError";
        setFunctions((prev) =>
          prev.map((f, i) =>
            i === index
              ? {
                  ...f,
                  status: isTimeout ? "timeout" : "error",
                  latency,
                  error: isTimeout ? "Timeout (8s)" : err.message || "Erro desconhecido",
                  lastCheck: new Date().toLocaleTimeString("pt-BR"),
                }
              : f
          )
        );
      }
    },
    []
  );

  const runAllProbes = useCallback(async () => {
    setRunning(true);
    // Run in batches of 5 to avoid flooding
    for (let i = 0; i < EDGE_FUNCTIONS.length; i += 5) {
      const batch = EDGE_FUNCTIONS.slice(i, i + 5);
      await Promise.all(batch.map((fn, j) => probeFunction(fn, i + j)));
    }
    setRunning(false);
  }, [probeFunction]);

  // Auto-refresh
  useEffect(() => {
    if (autoRefresh) {
      runAllProbes();
      intervalRef.current = setInterval(runAllProbes, AUTO_REFRESH_INTERVAL);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [autoRefresh, runAllProbes]);

  const toggleExpand = (name: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const onlineCount = functions.filter((f) => f.status === "online").length;
  const errorCount = functions.filter((f) => f.status === "error" || f.status === "timeout").length;
  const idleCount = functions.filter((f) => f.status === "idle").length;
  const avgLatency =
    functions.filter((f) => f.latency).reduce((sum, f) => sum + (f.latency ?? 0), 0) /
    (functions.filter((f) => f.latency).length || 1);

  const getStatusIcon = (status: FunctionProbe["status"]) => {
    switch (status) {
      case "idle":
        return <div className="w-3 h-3 rounded-full border border-muted-foreground/30" />;
      case "checking":
        return <Loader2 className="w-3 h-3 animate-spin text-primary" />;
      case "online":
        return <CheckCircle2 className="w-3 h-3 text-emerald-400" />;
      case "error":
        return <XCircle className="w-3 h-3 text-red-400" />;
      case "timeout":
        return <AlertTriangle className="w-3 h-3 text-amber-400" />;
    }
  };

  const getStatusColor = (status: FunctionProbe["status"]) => {
    switch (status) {
      case "online":
        return "text-emerald-400 border-emerald-500/30";
      case "error":
        return "text-red-400 border-red-500/30";
      case "timeout":
        return "text-amber-400 border-amber-500/30";
      case "checking":
        return "text-primary border-primary/30";
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusLabel = (status: FunctionProbe["status"]) => {
    switch (status) {
      case "idle":
        return "PENDENTE";
      case "checking":
        return "VERIFICANDO";
      case "online":
        return "ONLINE";
      case "error":
        return "ERRO";
      case "timeout":
        return "TIMEOUT";
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <h2 className="text-base font-bold font-[Orbitron] tracking-wide text-foreground">
              SAÚDE DAS FUNÇÕES BACKEND
            </h2>
            <p className="text-xs text-muted-foreground">
              Monitoramento em tempo real de {EDGE_FUNCTIONS.length} edge functions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Summary badges */}
          {idleCount < EDGE_FUNCTIONS.length && (
            <div className="flex gap-1.5">
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30 text-xs">
                {onlineCount} Online
              </Badge>
              {errorCount > 0 && (
                <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">
                  {errorCount} Erro
                </Badge>
              )}
            </div>
          )}
          {/* Auto refresh toggle */}
          <Button
            variant={autoRefresh ? "default" : "outline"}
            size="sm"
            className="gap-1.5 text-xs"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <RefreshCw className={`w-3 h-3 ${autoRefresh ? "animate-spin" : ""}`} />
            Auto
          </Button>
          <Button onClick={runAllProbes} disabled={running} size="sm" className="gap-1.5">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
            {running ? "Verificando..." : "Verificar Todas"}
          </Button>
        </div>
      </div>

      <Separator />

      {/* Stats bar */}
      {idleCount < EDGE_FUNCTIONS.length && (
        <div className="flex gap-6 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            {onlineCount}/{EDGE_FUNCTIONS.length} online
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Latência média: <span className="font-mono text-foreground">{Math.round(avgLatency)}ms</span>
          </span>
          {errorCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <WifiOff className="w-3 h-3" />
              {errorCount} com problemas
            </span>
          )}
        </div>
      )}

      {/* Function grid */}
      <ScrollArea className="max-h-[600px]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {functions.map((fn) => {
            const hasError = fn.status === "error" || fn.status === "timeout";
            const isExpanded = expandedErrors.has(fn.name);

            return (
              <Collapsible key={fn.name} open={isExpanded && hasError} onOpenChange={() => hasError && toggleExpand(fn.name)}>
                <Card
                  className={`border-border/50 transition-colors ${
                    fn.status === "error"
                      ? "border-red-500/30 bg-red-500/5"
                      : fn.status === "timeout"
                      ? "border-amber-500/30 bg-amber-500/5"
                      : fn.status === "online"
                      ? "border-emerald-500/20 bg-emerald-500/[0.02]"
                      : ""
                  }`}
                >
                  <CardContent className="p-3">
                    <CollapsibleTrigger asChild disabled={!hasError}>
                      <div className={`flex items-center justify-between ${hasError ? "cursor-pointer" : ""}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          {getStatusIcon(fn.status)}
                          <div className="min-w-0">
                            <span className="text-xs font-mono font-medium text-foreground block truncate">
                              {fn.name}
                            </span>
                            <span className="text-[10px] text-muted-foreground block truncate">
                              {fn.description}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {fn.latency !== undefined && (
                            <span className="text-[10px] font-mono text-muted-foreground">{fn.latency}ms</span>
                          )}
                          <Badge variant="outline" className={`text-[9px] px-1.5 ${getStatusColor(fn.status)}`}>
                            {getStatusLabel(fn.status)}
                          </Badge>
                          {hasError && (
                            <ChevronDown
                              className={`w-3 h-3 text-muted-foreground transition-transform ${
                                isExpanded ? "rotate-180" : ""
                              }`}
                            />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      {hasError && fn.error && (
                        <div className="mt-2 ml-5">
                          <pre className="text-[10px] font-mono text-red-400/80 p-2 bg-muted/30 rounded border border-border/30 whitespace-pre-wrap">
                            {fn.error}
                            {fn.httpStatus ? `\nHTTP Status: ${fn.httpStatus}` : ""}
                            {fn.lastCheck ? `\nÚltima verificação: ${fn.lastCheck}` : ""}
                          </pre>
                        </div>
                      )}
                    </CollapsibleContent>
                  </CardContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      </ScrollArea>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-[10px] text-muted-foreground pt-1">
        <span className="flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3 text-emerald-400" /> Função respondendo (OPTIONS 2xx/4xx)
        </span>
        <span className="flex items-center gap-1">
          <XCircle className="w-3 h-3 text-red-400" /> Erro (HTTP 5xx ou não implantada)
        </span>
        <span className="flex items-center gap-1">
          <AlertTriangle className="w-3 h-3 text-amber-400" /> Timeout (&gt;8s sem resposta)
        </span>
      </div>
    </section>
  );
}
