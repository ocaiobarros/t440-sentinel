import { useState, useCallback, useEffect, useMemo } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Printer, ArrowLeft, Save, Settings2, Loader2, Search,
  AlertTriangle, FileText, Eye, EyeOff, ExternalLink, Calendar, Edit2, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import IdracSetupWizard, { loadIdracConfig, clearIdracConfig, type IdracConfig } from "@/components/dashboard/IdracSetupWizard";
import { useDashboardPersist } from "@/hooks/useDashboardPersist";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

/* ─── Types ───────────────────────── */

interface PrinterConfig extends IdracConfig {
  selectedHostIds: string[];
}

interface ZabbixHost {
  hostid: string;
  host: string;
  name: string;
}

interface ZabbixItem {
  itemid: string;
  key_: string;
  name: string;
  lastvalue: string;
  units: string;
}

interface PrinterData {
  host: ZabbixHost;
  items: ZabbixItem[];
  brand: "brother" | "hp" | "kyocera" | "generic";
  hasAlert: boolean;
  baseCounter: number;
  billingCounter: number;
}

/* ─── Storage ─────────────────────── */

const STORAGE_KEY = "flowpulse_printer_config";

function loadPrinterConfig(): PrinterConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PrinterConfig) : null;
  } catch { return null; }
}

function savePrinterConfig(config: PrinterConfig) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

/* ─── Zabbix helper ───────────────── */

async function zabbixProxy(connectionId: string, method: string, params: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("zabbix-proxy", {
    body: { connection_id: connectionId, method, params },
  });
  if (error) throw new Error(String(error));
  if (data?.error) throw new Error(data.error);
  return data?.result;
}

/* ─── Brand detection (based on real Zabbix template keys) ─── */

// Brother keys: printers.status.written, printers.status.color, number.of.printed.pages,
//   .1.3.6.1.2.1.43.11.1.1.9.1.2 (drum), .1.3.6.1.2.1.43.10.2.1.4.1.1 (counter),
//   ConsumableCurrentCapacity[*], CosumableCalculated[*]
// HP keys: black, cyan, magenta, yellow (calculated %), ink.black.now/max, ink.cyan.now/max, etc.
//   black.cartridge.type, model
// Kyocera keys: kyocera.counter.total, kyocera.toner.percent, kyocera.toner.current,
//   kyocera.alert.code, kyocera.statusStr1, kyocera.serial, kyocera.model

function detectBrand(items: ZabbixItem[]): PrinterData["brand"] {
  const keys = items.map((i) => i.key_.toLowerCase());
  const allKeys = keys.join("|");

  // Kyocera — unique prefix
  if (allKeys.includes("kyocera.")) return "kyocera";
  // HP — calculated color percentages or ink.*.now keys
  if (keys.some((k) => k === "black" || k === "cyan" || k === "magenta" || k === "yellow" || k.startsWith("ink."))) return "hp";
  // Brother — status.written / status.color / ConsumableCalculated / number.of.printed
  if (keys.some((k) => k.includes("printers.status") || k.includes("number.of.printed") || k.includes("consumable") || k.includes("cosumable"))) return "brother";
  // Fallback: check OID-style keys common to Brother templates
  if (keys.some((k) => k.startsWith(".1.3.6.1.2.1.43."))) return "brother";
  return "generic";
}

/* ─── Kyocera alert code valuemap ─── */
const KYOCERA_ALERT_MAP: Record<string, { label: string; severity: "ok" | "warn" | "critical" }> = {
  "0": { label: "Sem alerta", severity: "ok" },
  "503": { label: "OK", severity: "ok" },
  "4": { label: "Porta/tampa aberta", severity: "warn" },
  "5": { label: "Papel preso", severity: "critical" },
  "6": { label: "Papel preso", severity: "critical" },
  "11": { label: "Sem papel", severity: "critical" },
  "12": { label: "Trocar toner", severity: "warn" },
  "18": { label: "Trocar toner", severity: "warn" },
  "4096": { label: "Trocar toner", severity: "warn" },
  "-7": { label: "Necessita serviço", severity: "critical" },
};

/* ─── Brother status written valuemap ─── */
const BROTHER_STATUS_MAP: Record<string, { label: string; ok: boolean }> = {
  "10001": { label: "Ready", ok: true },
  "10023": { label: "Printing", ok: true },
  "10209": { label: "Toner Low (BK)", ok: false },
  "40000": { label: "Sleep", ok: true },
  "40010": { label: "No Toner (BK)", ok: false },
  "41213": { label: "No Paper", ok: false },
  "62121": { label: "Replace Toner", ok: false },
};

function hasAlertCondition(items: ZabbixItem[]): boolean {
  return items.some((i) => {
    const k = i.key_.toLowerCase();
    const v = i.lastvalue?.trim() || "";

    // Kyocera alert code
    if (k === "kyocera.alert.code") {
      const alert = KYOCERA_ALERT_MAP[v];
      return alert ? alert.severity !== "ok" : false;
    }
    // Kyocera toner percent
    if (k === "kyocera.toner.percent") {
      const n = parseFloat(v);
      return !isNaN(n) && n < 15;
    }
    // Brother status written (numeric code)
    if (k === "printers.status.written") {
      const mapped = BROTHER_STATUS_MAP[v];
      return mapped ? !mapped.ok : false;
    }
    // Brother status color (5 = red)
    if (k === "printers.status.color") return v === "5";
    // Brother consumable calculated < 10%
    if (k.startsWith("cosumablecalculated") || k.startsWith("consumablecalculated")) {
      const n = parseFloat(v);
      return !isNaN(n) && n < 10;
    }
    // HP calculated percentages
    if (k === "black" || k === "cyan" || k === "magenta" || k === "yellow") {
      const n = parseFloat(v);
      return !isNaN(n) && n < 10;
    }
    return false;
  });
}

/* ─── Toner bar component ─────────── */

function TonerBar({ label, value, color }: { label: string; value: number; color: string }) {
  const pct = Math.max(0, Math.min(100, value));
  const barColor = pct < 10 ? "bg-red-500 animate-pulse" : pct < 30 ? "bg-yellow-500" : color;

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[9px] font-mono">
        <span className="text-muted-foreground">{label}</span>
        <span className={pct < 10 ? "text-red-400 font-bold" : "text-foreground"}>{pct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 rounded-full bg-secondary/50 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/* ─── Printer Card ────────────────── */

function PrinterCard({ printer, onBaseCounterChange }: { printer: PrinterData; onBaseCounterChange?: (hostId: string, value: number) => void }) {
  const { host, items, brand, hasAlert, baseCounter, billingCounter } = printer;
  const [editingBase, setEditingBase] = useState(false);
  const [baseValue, setBaseValue] = useState(String(baseCounter));

  // Find item by exact key or partial match
  const findByKey = (exactKey: string) =>
    items.find((i) => i.key_.toLowerCase() === exactKey.toLowerCase());
  const findValue = (pattern: string) => {
    // Try exact match first
    const exact = findByKey(pattern);
    if (exact) return exact.lastvalue ?? null;
    // Partial match fallback
    const item = items.find((i) => i.key_.toLowerCase().includes(pattern.toLowerCase()));
    return item?.lastvalue ?? null;
  };
  const findNumValue = (pattern: string) => {
    const v = findValue(pattern);
    return v !== null ? parseFloat(v) : null;
  };

  // Extract IP from host technical name
  const ip = host.host.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || host.host;

  // Model detection
  const model = findValue("model") ?? findValue("hrDeviceDescr") ?? findValue("kyocera.model") ?? null;
  // Location
  const location = findValue("sysLocation") ?? findValue("kyocera.sysLocation") ?? null;

  // Alert message for banner
  const alertMessage = (() => {
    if (brand === "kyocera") {
      const code = findValue("kyocera.alert.code");
      if (code) {
        const mapped = KYOCERA_ALERT_MAP[code];
        if (mapped && mapped.severity !== "ok") return mapped.label;
      }
    }
    if (brand === "brother") {
      const sw = findValue("printers.status.written");
      if (sw) {
        const mapped = BROTHER_STATUS_MAP[sw];
        if (mapped && !mapped.ok) return mapped.label;
      }
    }
    return hasAlert ? "Atenção necessária" : null;
  })();

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`glass-card rounded-xl p-4 border transition-all ${
            hasAlert
              ? "border-red-500/50 shadow-[0_0_20px_rgba(239,68,68,0.15)] animate-pulse"
              : "border-border/30 hover:border-neon-cyan/30"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <Printer className={`w-4 h-4 shrink-0 ${hasAlert ? "text-red-400" : "text-neon-cyan"}`} />
              <div className="min-w-0">
                <h3 className="text-xs font-display font-bold text-foreground truncate">{host.name || host.host}</h3>
                <p className="text-[9px] font-mono text-muted-foreground">{ip}</p>
              </div>
            </div>
            <span className={`text-[8px] font-mono uppercase px-1.5 py-0.5 rounded ${
              brand === "brother" ? "bg-blue-500/10 text-blue-400" :
              brand === "hp" ? "bg-cyan-500/10 text-cyan-400" :
              brand === "kyocera" ? "bg-orange-500/10 text-orange-400" :
              "bg-muted text-muted-foreground"
            }`}>
              {brand}
            </span>
          </div>

          {/* Model & Location */}
          {(model || location) && (
            <div className="mb-2 space-y-0.5">
              {model && <p className="text-[8px] font-mono text-muted-foreground truncate">📠 {model}</p>}
              {location && <p className="text-[8px] font-mono text-muted-foreground truncate">📍 {location}</p>}
            </div>
          )}

          {/* Alert banner */}
          {alertMessage && (
            <div className="flex items-center gap-1.5 mb-3 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20">
              <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" />
              <span className="text-[9px] font-mono text-red-300">{alertMessage}</span>
            </div>
          )}

          {/* ── HP: CMYK calculated percentages ── */}
          {brand === "hp" && (
            <div className="space-y-2">
              <TonerBar label="Black" value={findNumValue("black") ?? 0} color="bg-neutral-400" />
              <TonerBar label="Cyan" value={findNumValue("cyan") ?? 0} color="bg-cyan-500" />
              <TonerBar label="Magenta" value={findNumValue("magenta") ?? 0} color="bg-pink-500" />
              <TonerBar label="Yellow" value={findNumValue("yellow") ?? 0} color="bg-yellow-500" />
              {/* Cartridge types */}
              {(() => {
                const cartType = findValue("black.cartridge.type");
                return cartType ? (
                  <p className="text-[8px] font-mono text-muted-foreground mt-1 truncate">Cartucho: {cartType}</p>
                ) : null;
              })()}
            </div>
          )}

          {/* ── Brother: Consumables + Status ── */}
          {brand === "brother" && (
            <div className="space-y-2.5">
              {/* Discovery-based consumables (CosumableCalculated[*]) */}
              {(() => {
                const consumables = items.filter((i) =>
                  i.key_.toLowerCase().startsWith("cosumablecalculated[") ||
                  i.key_.toLowerCase().startsWith("consumablecalculated[")
                );
                if (consumables.length > 0) {
                  return consumables.map((c) => {
                    const label = c.key_.match(/\[(.+)\]/)?.[1] || c.name;
                    const val = parseFloat(c.lastvalue) || 0;
                    // Toner returns 150/100/0 scheme; drum returns real %
                    const displayVal = val > 100 ? 100 : val;
                    return (
                      <TonerBar
                        key={c.itemid}
                        label={label}
                        value={displayVal}
                        color={label.toLowerCase().includes("drum") || label.toLowerCase().includes("belt") ? "bg-blue-500" : "bg-neutral-400"}
                      />
                    );
                  });
                }
                // Fallback: direct OID drum key
                const drum = findNumValue(".1.3.6.1.2.1.43.11.1.1.9.1.2");
                return drum !== null ? (
                  <TonerBar label="Vida Útil Cilindro" value={drum} color="bg-blue-500" />
                ) : null;
              })()}

              {/* Page counter */}
              {(() => {
                const pages = findValue("number.of.printed.pages") ?? findValue(".1.3.6.1.2.1.43.10.2.1.4.1.1");
                return pages ? (
                  <div className="flex justify-between text-[9px] font-mono">
                    <span className="text-muted-foreground">Páginas Impressas</span>
                    <span className="text-foreground font-bold">{parseInt(pages).toLocaleString("pt-BR")}</span>
                  </div>
                ) : null;
              })()}

              {/* Status written (mapped from numeric code) */}
              {(() => {
                const raw = findValue("printers.status.written");
                if (!raw) return null;
                const mapped = BROTHER_STATUS_MAP[raw];
                const label = mapped?.label || raw;
                const isOk = mapped?.ok ?? true;
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground font-mono">Status:</span>
                    <span className={`text-[10px] font-mono font-bold ${isOk ? "text-neon-green" : "text-red-400"}`}>
                      {label}
                    </span>
                  </div>
                );
              })()}

              {/* Status color */}
              {(() => {
                const raw = findValue("printers.status.color");
                if (!raw) return null;
                const colorMap: Record<string, { label: string; cls: string }> = {
                  "2": { label: "🟢 Normal", cls: "text-neon-green" },
                  "3": { label: "🟡 Aviso", cls: "text-yellow-400" },
                  "5": { label: "🔴 Crítico", cls: "text-red-400" },
                };
                const mapped = colorMap[raw] || { label: `Código ${raw}`, cls: "text-muted-foreground" };
                return (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground font-mono">LED:</span>
                    <span className={`text-[10px] font-mono font-bold ${mapped.cls}`}>{mapped.label}</span>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ── Kyocera: Counter + Toner + Alert ── */}
          {brand === "kyocera" && (
            <div className="space-y-2.5">
              {/* Total counter A4 */}
              {(() => {
                const total = findValue("kyocera.counter.total");
                return total !== null ? (
                  <div className="text-center py-1.5">
                    <p className="text-[9px] text-muted-foreground font-mono uppercase">Contador Total A4</p>
                    <p className="text-2xl font-display font-bold text-foreground mt-0.5">
                      {parseInt(total || "0").toLocaleString("pt-BR")}
                    </p>
                  </div>
                ) : null;
              })()}

              {/* Toner percent */}
              {(() => {
                const pct = findNumValue("kyocera.toner.percent");
                const tonerType = findValue("kyocera.toner.type");
                return pct !== null ? (
                  <div>
                    <TonerBar label={tonerType ? `Toner (${tonerType})` : "Toner"} value={pct} color="bg-orange-500" />
                  </div>
                ) : null;
              })()}

              {/* Alert code */}
              {(() => {
                const code = findValue("kyocera.alert.code");
                if (!code) return null;
                const mapped = KYOCERA_ALERT_MAP[code];
                if (!mapped || mapped.severity === "ok") return null;
                return (
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-[9px] font-mono ${
                    mapped.severity === "critical" ? "bg-red-500/10 text-red-400" : "bg-yellow-500/10 text-yellow-400"
                  }`}>
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {mapped.label}
                  </div>
                );
              })()}

              {/* Status string */}
              {(() => {
                const status = findValue("kyocera.statusStr1");
                return status ? (
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] text-muted-foreground font-mono">Visor:</span>
                    <span className="text-[10px] font-mono font-bold text-foreground">{status}</span>
                  </div>
                ) : null;
              })()}

              {/* Serial */}
              {(() => {
                const serial = findValue("kyocera.serial");
                return serial ? (
                  <p className="text-[8px] font-mono text-muted-foreground">S/N: {serial}</p>
                ) : null;
              })()}
            </div>
          )}

          {/* ── Generic fallback ── */}
          {brand === "generic" && (
            <div className="space-y-2">
              {items.filter((i) => i.lastvalue && i.lastvalue !== "0").slice(0, 6).map((item) => (
                <div key={item.itemid} className="flex justify-between text-[9px] font-mono">
                  <span className="text-muted-foreground truncate mr-2">{item.name}</span>
                  <span className="text-foreground shrink-0">{item.lastvalue}</span>
                </div>
              ))}
            </div>
          )}

          {/* Total pages footer (HP / generic) */}
          {(brand === "hp" || brand === "generic") && (() => {
            const pages = findValue("number.of.printed.pages") ?? findValue(".1.3.6.1.2.1.43.10.2.1.4.1.1");
            return pages ? (
              <div className="mt-3 pt-2 border-t border-border/20 flex justify-between text-[9px] font-mono">
                <span className="text-muted-foreground">Total Páginas</span>
                <span className="text-foreground font-bold">{parseInt(pages).toLocaleString("pt-BR")}</span>
              </div>
            ) : null;
          })()}

          {/* ── Billing Counter Footer ── */}
          <div className="mt-3 pt-2 border-t border-border/20 space-y-1">
            <div className="flex justify-between items-center text-[9px] font-mono">
              <span className="text-muted-foreground">Contador Base (Contrato)</span>
              {editingBase ? (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    min="0"
                    value={baseValue}
                    onChange={(e) => setBaseValue(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") { const v = Math.max(0, parseInt(baseValue) || 0); onBaseCounterChange?.(host.hostid, v); setEditingBase(false); } }}
                    className="h-5 w-20 text-[9px] px-1"
                  />
                  <button onClick={() => {
                    const v = Math.max(0, parseInt(baseValue) || 0);
                    onBaseCounterChange?.(host.hostid, v);
                    setEditingBase(false);
                  }} className="text-neon-green hover:text-neon-green/80"><Check className="w-3 h-3" /></button>
                  <button onClick={() => { setBaseValue(String(baseCounter)); setEditingBase(false); }} className="text-red-400 hover:text-red-300"><X className="w-3 h-3" /></button>
                </div>
              ) : (
                <button onClick={() => setEditingBase(true)} className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors">
                  <span>{baseCounter.toLocaleString("pt-BR")}</span>
                  <Edit2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
            <div className="flex justify-between text-[10px] font-mono">
              <span className="text-neon-cyan font-bold">Total Faturado</span>
              <span className="text-neon-cyan font-bold text-glow-cyan">{billingCounter.toLocaleString("pt-BR")}</span>
            </div>
          </div>
        </motion.div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52 bg-card/95 backdrop-blur-xl border-border/50">
        <ContextMenuItem onClick={() => window.open(`http://${ip}`, "_blank")} className="gap-2 text-xs cursor-pointer">
          <ExternalLink className="w-3.5 h-3.5" /> Abrir Web Interface
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

/* ─── Host Selector Step ──────────── */

function HostSelector({
  config,
  onConfirm,
  onBack,
}: {
  config: IdracConfig;
  onConfirm: (hostIds: string[]) => void;
  onBack: () => void;
}) {
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: hosts = [], isLoading } = useQuery({
    queryKey: ["printer-hosts", config.connectionId, config.hostgroupId],
    queryFn: async () => {
      const result = await zabbixProxy(config.connectionId, "host.get", {
        output: ["hostid", "host", "name"],
        groupids: config.hostgroupId,
        sortfield: "name",
      });
      return result as ZabbixHost[];
    },
  });

  const filtered = hosts.filter((h) =>
    (h.name || h.host).toLowerCase().includes(search.toLowerCase())
  );

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((h) => h.hostid)));
  };

  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative flex items-center justify-center p-4">
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-cyan/5 rounded-full blur-[120px] pointer-events-none" />
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-xl relative z-10">
        <div className="text-center mb-6">
          <h1 className="font-display text-xl font-bold">
            <span className="text-neon-cyan">Selecione as Impressoras</span>
          </h1>
          <p className="text-[10px] text-muted-foreground font-mono mt-1">
            Grupo: <span className="text-neon-blue">{config.hostgroupName}</span>
          </p>
        </div>

        <div className="glass-card rounded-xl p-5 border border-border/30">
          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar impressora..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={selectAll} className="text-[10px] h-8 shrink-0">
              {selected.size === filtered.length ? "Desmarcar" : "Todos"}
            </Button>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-neon-cyan animate-spin" />
            </div>
          ) : (
            <div className="space-y-1 max-h-[350px] overflow-y-auto pr-1">
              {filtered.map((h) => (
                <button
                  key={h.hostid}
                  onClick={() => toggle(h.hostid)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-lg text-left transition-all ${
                    selected.has(h.hostid)
                      ? "bg-neon-cyan/10 border border-neon-cyan/30"
                      : "hover:bg-muted/30 border border-transparent"
                  }`}
                >
                  <Checkbox checked={selected.has(h.hostid)} className="pointer-events-none" />
                  <div className="min-w-0">
                    <p className="text-xs font-display font-bold text-foreground truncate">{h.name || h.host}</p>
                    {h.name && h.host !== h.name && (
                      <p className="text-[9px] font-mono text-muted-foreground">{h.host}</p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-between mt-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-xs gap-1">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </Button>
          <Button
            size="sm"
            disabled={selected.size === 0}
            onClick={() => onConfirm(Array.from(selected))}
            className="text-xs gap-1 bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/30 hover:bg-neon-cyan/30"
          >
            Monitorar ({selected.size})
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

/* ─── PDF Export ───────────────────── */

async function exportPrinterCountersPdf(printers: PrinterData[]) {
  const { default: jsPDF } = await import("jspdf");
  const { default: html2canvas } = await import("html2canvas");

  const now = new Date().toLocaleString("pt-BR");

  const findValue = (items: ZabbixItem[], pattern: string) => {
    const item = items.find((i) => i.key_.toLowerCase().includes(pattern) || i.name.toLowerCase().includes(pattern));
    return item?.lastvalue ?? "—";
  };

  const container = document.createElement("div");
  container.style.cssText = "position:fixed;left:-9999px;top:0;width:800px;background:#fff;padding:40px;font-family:'Segoe UI',system-ui,sans-serif;color:#1a1a2e;";

  const totalPages = printers.reduce((sum, p) => sum + p.billingCounter, 0);

  const rows = printers.map((p) => {
    const ip = p.host.host.match(/\d+\.\d+\.\d+\.\d+/)?.[0] || p.host.host;
    const serial = findValue(p.items, "kyocera.serial") || findValue(p.items, ".1.3.6.1.2.1.43.5.1.1.17.1");
    const zabbixCounter = p.billingCounter - p.baseCounter;
    return `<tr>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-weight:500;">${p.host.name || p.host.host}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-family:monospace;">${ip}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-transform:uppercase;">${p.brand}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">${p.baseCounter.toLocaleString("pt-BR")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;">${zabbixCounter.toLocaleString("pt-BR")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;text-align:right;font-weight:700;color:#0891b2;">${p.billingCounter.toLocaleString("pt-BR")}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #f1f5f9;font-family:monospace;">${serial}</td>
    </tr>`;
  }).join("");

  container.innerHTML = `
    <div style="margin-bottom:24px;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:40px;height:40px;background:linear-gradient(135deg,#0B0E14,#0891b2);border-radius:8px;display:flex;align-items:center;justify-content:center;">
          <span style="color:#22d3ee;font-weight:900;font-size:18px;">FP</span>
        </div>
        <div>
          <h1 style="font-size:20px;font-weight:800;color:#0B0E14;margin:0;">FLOWPULSE INTELLIGENCE</h1>
          <p style="font-size:11px;color:#64748b;margin:2px 0 0;">Relatório de Leitura de Contadores</p>
        </div>
      </div>
      <div style="font-size:10px;color:#94a3b8;margin-top:6px;">Gerado em: ${now}</div>
      <div style="height:2px;background:linear-gradient(90deg,#0891b2,#06b6d4,transparent);margin-top:12px;border-radius:2px;"></div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:10px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Nome / Setor</th>
          <th style="text-align:left;padding:8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">IP</th>
          <th style="text-align:left;padding:8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Marca</th>
          <th style="text-align:right;padding:8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Contador Base</th>
          <th style="text-align:right;padding:8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Contador Zabbix</th>
          <th style="text-align:right;padding:8px;font-size:9px;text-transform:uppercase;color:#0891b2;border-bottom:1px solid #e2e8f0;font-weight:800;">Total Faturado</th>
          <th style="text-align:left;padding:8px;font-size:9px;text-transform:uppercase;color:#64748b;border-bottom:1px solid #e2e8f0;">Serial</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:16px;padding:12px;background:#f0f9ff;border-radius:8px;text-align:right;">
      <span style="font-size:10px;color:#64748b;">Total Faturado Consolidado:</span>
      <span style="font-size:18px;font-weight:800;color:#0891b2;margin-left:8px;">${totalPages.toLocaleString("pt-BR")} páginas</span>
    </div>
    <div style="margin-top:24px;text-align:center;font-size:9px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:12px;">
      FLOWPULSE INTELLIGENCE — Relatório de Contadores — ${now}
    </div>
  `;

  document.body.appendChild(container);
  try {
    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: "#ffffff", width: 800 });
    const imgData = canvas.toDataURL("image/png");
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    let heightLeft = imgHeight;
    let position = 0;

    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pdfHeight;

    while (heightLeft > 0) {
      position = -(imgHeight - heightLeft);
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;
    }

    pdf.save(`Contadores_Impressoras_${new Date().toISOString().slice(0, 10)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

/* ─── Main Page ───────────────────── */

export default function PrinterIntelligence() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isKiosk = searchParams.get("kiosk") === "true";
  const { save: saveDashboard, saving, dashboardId, loadedConfig, loading: dbLoading } = useDashboardPersist<PrinterConfig>({
    category: "printer",
    listPath: "/app/monitoring/printers",
  });

  const [config, setConfig] = useState<PrinterConfig | null>(() => dashboardId ? loadPrinterConfig() : null);
  const [showWizard, setShowWizard] = useState(() => !dashboardId ? true : !loadPrinterConfig());
  const [wizardBase, setWizardBase] = useState<IdracConfig | null>(null);
  const [hostFilter, setHostFilter] = useState("");
  const queryClient = useQueryClient();

  // Base counter mutation
  const baseCounterMutation = useMutation({
    mutationFn: async ({ hostId, value, hostName }: { hostId: string; value: number; hostName: string }) => {
      const { error } = await supabase
        .from("printer_configs")
        .upsert({
          tenant_id: (await supabase.auth.getUser()).data.user?.app_metadata?.tenant_id,
          zabbix_host_id: hostId,
          host_name: hostName,
          base_counter: value,
        }, { onConflict: "tenant_id,zabbix_host_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["printer-data"] });
    },
  });

  // handleBaseCounterChange defined after printerData query below

  // Load from DB
  useEffect(() => {
    if (loadedConfig && !config) {
      setConfig(loadedConfig);
      setShowWizard(false);
    }
  }, [loadedConfig]);

  // Wizard step 1 complete → go to host selector
  const handleWizardComplete = useCallback((base: IdracConfig) => {
    setWizardBase(base);
  }, []);

  // Host selection complete
  const handleHostsSelected = useCallback((hostIds: string[]) => {
    if (!wizardBase) return;
    const printerConfig: PrinterConfig = { ...wizardBase, selectedHostIds: hostIds };
    savePrinterConfig(printerConfig);
    setConfig(printerConfig);
    setWizardBase(null);
    setShowWizard(false);
  }, [wizardBase]);

  const handleReconfigure = () => {
    localStorage.removeItem(STORAGE_KEY);
    setConfig(null);
    setWizardBase(null);
    setShowWizard(true);
  };

  const handleSave = useCallback(() => {
    if (!config) return;
    saveDashboard(config.hostgroupName || "Impressoras", config);
  }, [config, saveDashboard]);

  // Fetch printer data
  const { data: printerData = [], isLoading: dataLoading } = useQuery<PrinterData[]>({
    queryKey: ["printer-data", config?.connectionId, config?.selectedHostIds],
    enabled: !!config && config.selectedHostIds.length > 0,
    refetchInterval: 30_000,
    staleTime: 25_000,
    queryFn: async () => {
      if (!config) return [];
      // Fetch hosts
      const hosts = await zabbixProxy(config.connectionId, "host.get", {
        output: ["hostid", "host", "name"],
        hostids: config.selectedHostIds,
      }) as ZabbixHost[];

      // Fetch base counters from DB
      const { data: baseCounters } = await supabase
        .from("printer_configs")
        .select("zabbix_host_id, base_counter")
        .in("zabbix_host_id", config.selectedHostIds);
      const baseMap = new Map((baseCounters ?? []).map((c: any) => [c.zabbix_host_id, c.base_counter as number]));

      // Fetch ALL items for selected hosts (application tag "Printer" or matching keys)
      const items = await zabbixProxy(config.connectionId, "item.get", {
        output: ["itemid", "key_", "name", "lastvalue", "units", "hostid"],
        hostids: config.selectedHostIds,
        tags: [{ tag: "Application", value: "Printer", operator: "0" }],
        limit: 1000,
      }) as (ZabbixItem & { hostid: string })[];

      // Fetch by specific key patterns from real templates
      const keyPatterns = [
        "ink.", "black", "cyan", "magenta", "yellow",
        "printers.status", "number.of.printed", "consumable", "cosumable",
        "kyocera.",
        "hrDeviceDescr", "sysLocation", "sysContact",
        "net.tcp.service",
        ".1.3.6.1.2.1.43.",
      ];
      const extraItems = await zabbixProxy(config.connectionId, "item.get", {
        output: ["itemid", "key_", "name", "lastvalue", "units", "hostid"],
        hostids: config.selectedHostIds,
        search: { key_: keyPatterns.join(",") },
        searchByAny: true,
        searchWildcardsEnabled: true,
        limit: 1000,
      }) as (ZabbixItem & { hostid: string })[];

      const taggedItems = await zabbixProxy(config.connectionId, "item.get", {
        output: ["itemid", "key_", "name", "lastvalue", "units", "hostid"],
        hostids: config.selectedHostIds,
        tags: [
          { tag: "Application", value: "Toner", operator: "0" },
          { tag: "Application", value: "Contador", operator: "0" },
          { tag: "Application", value: "Alertas", operator: "0" },
          { tag: "Application", value: "Equipamento", operator: "0" },
          { tag: "Application", value: "Consumables level %", operator: "0" },
          { tag: "Application", value: "Consumables level", operator: "0" },
          { tag: "Application", value: "Printer information", operator: "0" },
          { tag: "Application", value: "Servicos", operator: "0" },
        ],
        searchByAny: true,
        limit: 1000,
      }) as (ZabbixItem & { hostid: string })[];

      const allItems = [...items, ...extraItems, ...taggedItems];
      const unique = new Map<string, ZabbixItem & { hostid: string }>();
      allItems.forEach((i) => unique.set(i.itemid, i));

      return hosts.map((h) => {
        const hostItems = Array.from(unique.values()).filter((i) => i.hostid === h.hostid);
        const brand = detectBrand(hostItems);
        const baseCounter = baseMap.get(h.hostid) ?? 0;
        // Get raw page counter from Zabbix
        const counterKeys = ["kyocera.counter.total", "number.of.printed.pages", ".1.3.6.1.2.1.43.10.2.1.4.1.1"];
        let zabbixCounter = 0;
        for (const ck of counterKeys) {
          const item = hostItems.find((i) => i.key_.toLowerCase().includes(ck.toLowerCase()));
          if (item) { const v = parseInt(item.lastvalue); if (!isNaN(v)) { zabbixCounter = v; break; } }
        }
        return { host: h, items: hostItems, brand, hasAlert: hasAlertCondition(hostItems), baseCounter, billingCounter: baseCounter + zabbixCounter };
      });
    },
  });

  const handleBaseCounterChange = useCallback((hostId: string, value: number) => {
    const printer = printerData.find((p: PrinterData) => p.host.hostid === hostId);
    baseCounterMutation.mutate({ hostId, value, hostName: printer?.host.name || printer?.host.host || "" });
  }, [printerData, baseCounterMutation]);

  if (showWizard && !wizardBase) {
    return (
      <IdracSetupWizard
        onComplete={handleWizardComplete}
        existingConfig={config}
        title="Printer Intelligence"
        subtitle="Monitoramento inteligente de impressoras — Brother, HP, Kyocera"
        icon={Printer}
      />
    );
  }

  if (wizardBase && !config) {
    return (
      <HostSelector
        config={wizardBase}
        onConfirm={handleHostsSelected}
        onBack={() => setWizardBase(null)}
      />
    );
  }

  // Filter printers
  const filteredPrinters = printerData.filter((p) =>
    !hostFilter || (p.host.name || p.host.host).toLowerCase().includes(hostFilter.toLowerCase())
  );

  const alertCount = printerData.filter((p) => p.hasAlert).length;

  return (
    <div className={`min-h-screen bg-background grid-pattern scanlines relative ${isKiosk ? "p-4" : "p-4 md:p-6 lg:p-8"}`}>
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-neon-cyan/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-[1600px] mx-auto relative z-10">
        {/* Header */}
        {!isKiosk && (
          <motion.header initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Printer className="w-6 h-6 text-neon-cyan" />
                <div>
                  <h1 className="text-lg font-display font-bold text-foreground">
                    <span className="text-neon-cyan text-glow-cyan">PRINTER</span> INTELLIGENCE
                  </h1>
                  <p className="text-[10px] text-muted-foreground font-mono">
                    {config?.hostgroupName} • {printerData.length} impressoras • Refresh: 30s
                    {alertCount > 0 && <span className="text-red-400 ml-2">⚠ {alertCount} alerta(s)</span>}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center mt-3">
              <button onClick={() => navigate("/app/monitoring/printers")} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                <ArrowLeft className="w-3 h-3" /> Voltar
              </button>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate("/app/monitoring/printers/billing")}
                  className="text-[10px] h-7 gap-1"
                >
                  <Calendar className="w-3 h-3" /> Histórico
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => exportPrinterCountersPdf([...filteredPrinters])}
                  disabled={filteredPrinters.length === 0 || dataLoading}
                  className="text-[10px] h-7 gap-1"
                >
                  <FileText className="w-3 h-3" /> Relatório PDF
                </Button>
                <button onClick={handleSave} disabled={saving} className="flex items-center gap-1 text-[9px] font-mono text-neon-green/70 hover:text-neon-green transition-colors disabled:opacity-50">
                  <Save className="w-3 h-3" /> {saving ? "Salvando…" : "Salvar"}
                </button>
                <button onClick={handleReconfigure} className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors">
                  <Settings2 className="w-3 h-3" /> Reconfigurar
                </button>
              </div>
            </div>
          </motion.header>
        )}

        {/* Filter bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Filtrar impressoras..."
              value={hostFilter}
              onChange={(e) => setHostFilter(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <span className="text-[9px] font-mono text-muted-foreground">
            {filteredPrinters.length}/{printerData.length}
          </span>
        </div>

        {/* Loading state */}
        {dataLoading && printerData.length === 0 && (
          <div className="glass-card rounded-xl p-16 text-center">
            <Loader2 className="w-8 h-8 text-neon-cyan animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted-foreground font-mono">Carregando dados das impressoras...</p>
          </div>
        )}

        {/* Printer Grid */}
        {filteredPrinters.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 gap-3">
            {filteredPrinters.map((p) => (
              <PrinterCard key={p.host.hostid} printer={p} onBaseCounterChange={handleBaseCounterChange} />
            ))}
          </div>
        )}

        {!dataLoading && printerData.length === 0 && config && (
          <div className="glass-card rounded-xl p-12 text-center">
            <Printer className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">Nenhum dado de impressora disponível</p>
          </div>
        )}

        {/* Footer */}
        <div className="text-center py-4 mt-4">
          <p className="text-[10px] font-mono text-muted-foreground/50">
            FLOWPULSE | Printer Intelligence Pro • Datasource: Zabbix SNMP • Auto-refresh: 30s
          </p>
        </div>
      </div>
    </div>
  );
}
