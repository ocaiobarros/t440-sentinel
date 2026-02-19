import { useState, useMemo } from "react";
import { useRMSFueling } from "@/hooks/useRMSFueling";
import { processFleetData, formatNumber, formatDecimal, formatCurrency, DriverStats, FleetSummary } from "@/lib/fleet-intelligence-utils";
import DriverDetailDrawer from "@/components/fleet/DriverDetailDrawer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ReferenceLine,
  Cell,
  Legend,
} from "recharts";
import {
  Fuel,
  Route,
  Gauge,
  TrendingUp,
  Search,
  AlertTriangle,
  Trophy,
  ShieldAlert,
  ChevronLeft,
  DollarSign,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

function getDefaultDates() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    startDate: start.toISOString().split("T")[0],
    endDate: now.toISOString().split("T")[0],
  };
}

/* ── KPI Card ── */
function KPICard({ label, value, sub, icon: Icon, color }: {
  label: string; value: string; sub?: string; icon: React.ElementType; color: string;
}) {
  return (
    <div
      className="glass-card rounded-xl p-5 relative overflow-hidden group transition-all duration-300"
      style={{ borderColor: `hsl(${color} / 0.3)` }}
    >
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
        style={{ background: `radial-gradient(circle at 50% 100%, hsl(${color} / 0.08), transparent 70%)` }}
      />
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground font-['Orbitron']">
            {label}
          </span>
          <Icon className="w-4 h-4" style={{ color: `hsl(${color})` }} />
        </div>
        <p className="text-2xl font-bold font-['JetBrains_Mono']" style={{ color: `hsl(${color})` }}>
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </div>
  );
}

/* ── Empty State ── */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{
          background: "linear-gradient(135deg, hsl(222 15% 14% / 0.8), hsl(222 15% 10% / 0.4))",
          border: "1px solid hsl(222 15% 20% / 0.4)",
        }}
      >
        <Fuel className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="font-['Orbitron'] text-lg text-foreground mb-2">Sem Dados de Abastecimento</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Nenhum registro encontrado para o período selecionado. Verifique se há uma conexão RMS ativa configurada.
      </p>
    </div>
  );
}

/* ── Main Page ── */
export default function FleetIntelligence() {
  const navigate = useNavigate();
  const defaults = getDefaultDates();
  const [startDate, setStartDate] = useState(defaults.startDate);
  const [endDate, setEndDate] = useState(defaults.endDate);
  const [searchQuery, setSearchQuery] = useState("");
  const [modelFilter, setModelFilter] = useState<string>("all");
  const [selectedDriver, setSelectedDriver] = useState<DriverStats | null>(null);

  const { data, isLoading, error } = useRMSFueling(startDate, endDate);

  const summary: FleetSummary | null = useMemo(() => {
    if (!data?.entries?.length) return null;
    return processFleetData(data.entries);
  }, [data]);

  const filteredDrivers = useMemo(() => {
    if (!summary) return [];
    let list = summary.ranked_drivers;
    if (modelFilter !== "all") {
      list = list.filter((d) => {
        const model = d.equipment_name?.split(/[\s-]+/).slice(0, 3).join(" ") || "";
        return model === modelFilter;
      });
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter((d) => d.driver_name.toLowerCase().includes(q));
    }
    return list;
  }, [summary, modelFilter, searchQuery]);

  const selectedModelAvg = useMemo(() => {
    if (!selectedDriver || !summary) return summary?.fleet_avg_km_l || 0;
    const model = selectedDriver.equipment_name?.split(/[\s-]+/).slice(0, 3).join(" ") || "";
    const cluster = summary.model_clusters.find((c) => c.model === model);
    return cluster?.avg_km_l || summary.fleet_avg_km_l;
  }, [selectedDriver, summary]);

  const top10 = filteredDrivers.slice(0, 10);

  // Scatter data
  const scatterData = useMemo(() => {
    if (!summary) return [];
    return summary.ranked_drivers.map((d) => ({
      x: d.total_km,
      y: d.total_liters,
      name: d.driver_name,
      avg: d.avg_km_l,
      badge: d.badge,
    }));
  }, [summary]);

  return (
    <div
      className="min-h-screen"
      style={{ background: "linear-gradient(180deg, hsl(228 30% 4%) 0%, hsl(230 35% 2%) 100%)" }}
    >
      {/* ── HEADER ── */}
      <header
        className="sticky top-0 z-50 border-b"
        style={{
          background: "hsl(228 30% 5% / 0.85)",
          backdropFilter: "blur(20px)",
          borderColor: "hsl(222 15% 14% / 0.5)",
        }}
      >
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate("/")}
              className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-muted-foreground" />
            </button>
            <div>
              <h1 className="font-['Orbitron'] text-xl font-bold tracking-wider text-glow-cyan" style={{ color: "hsl(186 100% 50%)" }}>
                FLEET INTELLIGENCE
              </h1>
              <p className="text-[10px] text-muted-foreground uppercase tracking-[0.2em] font-['JetBrains_Mono']">
                Diesel Performance Analytics
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase text-muted-foreground font-['JetBrains_Mono']">Início</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="glass-card rounded-lg px-3 py-1.5 text-xs font-['JetBrains_Mono'] text-foreground bg-transparent border-0 outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[10px] uppercase text-muted-foreground font-['JetBrains_Mono']">Fim</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="glass-card rounded-lg px-3 py-1.5 text-xs font-['JetBrains_Mono'] text-foreground bg-transparent border-0 outline-none"
              />
            </div>

            {summary && summary.model_clusters.length > 0 && (
              <Select value={modelFilter} onValueChange={setModelFilter}>
                <SelectTrigger className="w-[200px] glass-card border-0 text-xs font-['JetBrains_Mono'] h-8">
                  <SelectValue placeholder="Todos os Modelos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os Modelos</SelectItem>
                  {summary.model_clusters.map((m) => (
                    <SelectItem key={m.model} value={m.model}>
                      {m.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <div className="relative ml-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                placeholder="Buscar motorista..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 w-[200px] glass-card border-0 text-xs font-['JetBrains_Mono']"
              />
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-6 space-y-6">
        {/* ── Loading ── */}
        {isLoading && (
          <div className="grid grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="glass-card rounded-xl p-6 border-destructive/30">
            <p className="text-destructive text-sm">{(error as Error).message}</p>
          </div>
        )}

        {/* ── Empty ── */}
        {!isLoading && !error && !summary && <EmptyState />}

        {/* ── Data ── */}
        {summary && (
          <>
            {/* KPI Row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <KPICard
                label="Média Frota"
                value={`${formatDecimal(summary.fleet_avg_km_l)} km/l`}
                sub="Ponderada (SUM km / SUM L)"
                icon={Gauge}
                color="186 100% 50%"
              />
              <KPICard
                label="Diesel Consumido"
                value={`${formatNumber(summary.total_liters)} L`}
                sub={`${data?.count || 0} registros`}
                icon={Fuel}
                color="43 100% 50%"
              />
              <KPICard
                label="KM Rodado"
                value={formatNumber(summary.total_km)}
                sub="Odômetro calculado"
                icon={Route}
                color="142 100% 50%"
              />
              <KPICard
                label="Custo Total Diesel"
                value={formatCurrency(summary.total_cost)}
                sub="Baseado em Preço/L registrado"
                icon={DollarSign}
                color="280 80% 60%"
              />
              <KPICard
                label="Índice Eficiência"
                value={`${summary.efficiency_index}%`}
                sub="Acima da média do modelo"
                icon={TrendingUp}
                color="210 100% 56%"
              />
            </div>

            {/* Ranking Table */}
            <div className="glass-card rounded-xl overflow-hidden" style={{ borderColor: "hsl(186 100% 50% / 0.15)" }}>
              <div className="px-5 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid hsl(222 15% 14% / 0.5)" }}>
                <h2 className="font-['Orbitron'] text-sm tracking-wider" style={{ color: "hsl(186 100% 50%)" }}>
                  TOP 10 — RANKING DE EFICIÊNCIA
                </h2>
                <span className="text-[10px] text-muted-foreground font-['JetBrains_Mono']">
                  {filteredDrivers.length} motoristas qualificados
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "hsl(222 15% 8% / 0.6)" }}>
                      {["#", "Motorista", "Modelo", "Placa", "Horímetro", "KM", "Litros", "Preço/L", "Gasto (R$)", "KM/L", "Status"].map((h) => (
                        <th key={h} className="text-left px-4 py-2.5 text-[10px] uppercase tracking-wider text-muted-foreground font-['Orbitron'] font-normal">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {top10.map((d, i) => {
                      const isTop1 = i === 0;
                      const isBottom1 = i === top10.length - 1 && top10.length > 1;
                      const rowStyle: React.CSSProperties = isTop1
                        ? { background: "hsl(142 100% 50% / 0.04)", boxShadow: "inset 0 0 30px hsl(142 100% 50% / 0.03)" }
                        : isBottom1
                        ? { background: "hsl(0 90% 50% / 0.04)", boxShadow: "inset 0 0 30px hsl(0 90% 50% / 0.03)" }
                        : {};

                      return (
                        <tr
                          key={d.driver_name}
                          className="border-t border-border/20 hover:bg-secondary/30 cursor-pointer transition-colors"
                          style={rowStyle}
                          onClick={() => setSelectedDriver(d)}
                        >
                          <td className="px-4 py-3 font-['JetBrains_Mono'] font-bold" style={{ color: isTop1 ? "hsl(43 100% 50%)" : "hsl(218 12% 42%)" }}>
                            {isTop1 && <Trophy className="w-3.5 h-3.5 inline mr-1" style={{ color: "hsl(43 100% 50%)" }} />}
                            {isBottom1 && <ShieldAlert className="w-3.5 h-3.5 inline mr-1" style={{ color: "hsl(0 90% 50%)" }} />}
                            {i + 1}
                          </td>
                          <td className="px-4 py-3 font-medium">{d.driver_name}</td>
                          <td className="px-4 py-3 text-muted-foreground">{d.equipment_name || "—"}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono'] text-muted-foreground">{d.fleet_number || "—"}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono'] text-muted-foreground">{d.hourmeter ? formatNumber(d.hourmeter) : "—"}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono']">{formatNumber(d.total_km)}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono']">{formatNumber(d.total_liters)}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono'] text-muted-foreground">{d.avg_price_per_liter > 0 ? formatDecimal(d.avg_price_per_liter) : "—"}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono']" style={{ color: "hsl(280 80% 60%)" }}>{d.total_cost > 0 ? formatCurrency(d.total_cost) : "—"}</td>
                          <td className="px-4 py-3 font-['JetBrains_Mono'] font-bold" style={{ color: d.badge === "green" ? "hsl(142 100% 50%)" : "hsl(0 90% 50%)" }}>
                            {formatDecimal(d.avg_km_l)}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1.5 py-0"
                                style={{
                                  borderColor: d.badge === "green" ? "hsl(142 100% 50% / 0.4)" : "hsl(0 90% 50% / 0.4)",
                                  color: d.badge === "green" ? "hsl(142 100% 50%)" : "hsl(0 90% 50%)",
                                }}
                              >
                                {d.badge === "green" ? "▲ Acima" : "▼ Abaixo"}
                              </Badge>
                              {d.is_outlier && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <AlertTriangle className="w-3 h-3" style={{ color: "hsl(43 100% 50%)" }} />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="text-xs">Suspeita de erro/desvio (KM/L fora da faixa 1.0–3.5)</p>
                                  </TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                    {top10.length === 0 && (
                      <tr>
                        <td colSpan={11} className="text-center py-8 text-muted-foreground">
                          Nenhum motorista qualificado encontrado
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Scatter */}
              <div className="glass-card rounded-xl p-5" style={{ borderColor: "hsl(210 100% 56% / 0.15)" }}>
                <h3 className="font-['Orbitron'] text-xs tracking-wider mb-4" style={{ color: "hsl(210 100% 56%)" }}>
                  COMPORTAMENTO VS MÁQUINA
                </h3>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <ScatterChart margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 14%)" />
                      <XAxis
                        dataKey="x"
                        name="KM"
                        tick={{ fontSize: 10, fill: "hsl(218 12% 42%)" }}
                        label={{ value: "KM Rodado", position: "bottom", fontSize: 10, fill: "hsl(218 12% 42%)" }}
                      />
                      <YAxis
                        dataKey="y"
                        name="Litros"
                        tick={{ fontSize: 10, fill: "hsl(218 12% 42%)" }}
                        label={{ value: "Diesel (L)", angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(218 12% 42%)" }}
                      />
                      <RechartsTooltip
                        contentStyle={{
                          background: "hsl(225 25% 7%)",
                          border: "1px solid hsl(222 15% 18%)",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(value: number, name: string) => [formatNumber(value), name === "x" ? "KM" : "Litros"]}
                        labelFormatter={() => ""}
                        content={({ payload }) => {
                          if (!payload?.length) return null;
                          const d = payload[0]?.payload;
                          return (
                            <div className="glass-card rounded-lg p-2 text-xs space-y-1" style={{ background: "hsl(225 25% 7%)", border: "1px solid hsl(222 15% 18%)" }}>
                              <p className="font-medium">{d?.name}</p>
                              <p className="font-['JetBrains_Mono']">{formatNumber(d?.x)} km · {formatNumber(d?.y)} L</p>
                              <p className="font-['JetBrains_Mono']" style={{ color: d?.badge === "green" ? "hsl(142 100% 50%)" : "hsl(0 90% 50%)" }}>
                                {formatDecimal(d?.avg)} km/l
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Scatter data={scatterData} fill="hsl(186 100% 50%)">
                        {scatterData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={entry.badge === "green" ? "hsl(142, 100%, 50%)" : "hsl(0, 90%, 50%)"}
                            fillOpacity={0.7}
                          />
                        ))}
                      </Scatter>
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Model Bar Chart */}
              <div className="glass-card rounded-xl p-5" style={{ borderColor: "hsl(43 100% 50% / 0.15)" }}>
                <h3 className="font-['Orbitron'] text-xs tracking-wider mb-4" style={{ color: "hsl(43 100% 50%)" }}>
                  MÉDIA POR MODELO
                </h3>
                <div style={{ height: 300 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={summary.model_clusters} margin={{ top: 10, right: 10, bottom: 20, left: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(222 15% 14%)" />
                      <XAxis dataKey="model" tick={{ fontSize: 9, fill: "hsl(218 12% 42%)" }} angle={-15} textAnchor="end" />
                      <YAxis tick={{ fontSize: 10, fill: "hsl(218 12% 42%)" }} />
                      <RechartsTooltip
                        contentStyle={{
                          background: "hsl(225 25% 7%)",
                          border: "1px solid hsl(222 15% 18%)",
                          borderRadius: 8,
                          fontSize: 11,
                        }}
                        formatter={(value: number) => [`${formatDecimal(value)} km/l`, "Média"]}
                      />
                      <ReferenceLine
                        y={summary.fleet_avg_km_l}
                        stroke="hsl(0 90% 50%)"
                        strokeDasharray="5 5"
                        label={{ value: `Frota: ${formatDecimal(summary.fleet_avg_km_l)}`, position: "right", fontSize: 9, fill: "hsl(0 90% 50%)" }}
                      />
                      <Bar dataKey="avg_km_l" radius={[4, 4, 0, 0]}>
                        {summary.model_clusters.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={entry.avg_km_l >= summary.fleet_avg_km_l ? "hsl(186, 100%, 50%)" : "hsl(43, 100%, 50%)"}
                            fillOpacity={0.75}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Insufficient Data */}
            {summary.insufficient_drivers.length > 0 && (
              <div className="glass-card rounded-xl p-5" style={{ borderColor: "hsl(43 100% 50% / 0.12)" }}>
                <h3 className="font-['Orbitron'] text-xs tracking-wider mb-3 flex items-center gap-2" style={{ color: "hsl(43 100% 50%)" }}>
                  <AlertTriangle className="w-3.5 h-3.5" />
                  DADOS INSUFICIENTES ({summary.insufficient_drivers.length})
                </h3>
                <p className="text-[10px] text-muted-foreground mb-3">
                  Motoristas com menos de 300 km não entram no ranking.
                </p>
                <div className="flex flex-wrap gap-2">
                  {summary.insufficient_drivers.map((d) => (
                    <Badge
                      key={d.driver_name}
                      variant="outline"
                      className="text-[10px] cursor-pointer hover:bg-secondary/30"
                      style={{ borderColor: "hsl(43 100% 50% / 0.3)", color: "hsl(43 100% 50%)" }}
                      onClick={() => setSelectedDriver(d)}
                    >
                      {d.driver_name} · {formatNumber(d.total_km)} km
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <DriverDetailDrawer
        driver={selectedDriver}
        modelAvg={selectedModelAvg}
        open={!!selectedDriver}
        onClose={() => setSelectedDriver(null)}
      />
    </div>
  );
}
