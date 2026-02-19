import { FuelingEntry } from "@/hooks/useRMSFueling";

export interface DriverStats {
  driver_name: string;
  fleet_number: string | null;
  equipment_name: string | null;
  total_km: number;
  total_liters: number;
  avg_km_l: number;
  entries_count: number;
  is_outlier: boolean;
  insufficient_data: boolean;
  daily_entries: { date: string; km: number; liters: number; avg: number }[];
  badge: "green" | "red" | "neutral";
  total_cost: number;
  avg_price_per_liter: number;
  hourmeter: number | null;
}

export interface ModelCluster {
  model: string;
  total_km: number;
  total_liters: number;
  avg_km_l: number;
  driver_count: number;
}

export interface FleetSummary {
  fleet_avg_km_l: number;
  total_liters: number;
  total_km: number;
  total_cost: number;
  efficiency_index: number;
  ranked_drivers: DriverStats[];
  insufficient_drivers: DriverStats[];
  model_clusters: ModelCluster[];
}

const MIN_KM = 300;
const OUTLIER_HIGH = 3.5;
const OUTLIER_LOW = 1.0;

function extractModel(equipmentName: string | null): string {
  if (!equipmentName) return "Desconhecido";
  // Try to extract model pattern like "Volvo FH 540", "DAF XF 530", etc.
  const cleaned = equipmentName.trim();
  // Use first 3 meaningful words as model grouping
  const parts = cleaned.split(/[\s-]+/).filter(Boolean).slice(0, 3);
  return parts.join(" ") || "Desconhecido";
}

export function processFleetData(entries: FuelingEntry[]): FleetSummary {
  // Only process entries with odometer readings
  const odometerEntries = entries.filter(
    (e) => e.reading_type === "odometer" && e.reading != null && e.liters > 0
  );

  // Group by fleet_number (equipment)
  const byEquipment = new Map<string, FuelingEntry[]>();
  for (const e of odometerEntries) {
    const key = e.fleet_number || e.id;
    if (!byEquipment.has(key)) byEquipment.set(key, []);
    byEquipment.get(key)!.push(e);
  }

  // Calculate consumption segments per equipment
  interface Segment {
    driver_name: string;
    fleet_number: string | null;
    equipment_name: string | null;
    km: number;
    liters: number;
    date: string;
    cost: number;
    hourmeter: number | null;
  }

  const segments: Segment[] = [];

  for (const [, eqEntries] of byEquipment) {
    const sorted = [...eqEntries].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const curr = sorted[i];
      const km = curr.reading! - prev.reading!;
      if (km > 0 && km < 10000) {
        const cost = curr.liters * (curr.price_per_liter || 0);
        segments.push({
          driver_name: curr.driver_name || "Sem Motorista",
          fleet_number: curr.fleet_number,
          equipment_name: curr.equipment_name,
          km,
          liters: curr.liters,
          date: curr.date,
          cost,
          hourmeter: curr.hourmeter,
        });
      }
    }
  }

  // Also handle hourmeter entries as a fallback (use liters directly, km=0)
  const hourEntries = entries.filter(
    (e) => e.reading_type === "hourmeter" && e.reading != null && e.liters > 0
  );
  
  // For hourmeter, we can't calculate km/l, so group separately
  // but still include in total liters

  // Aggregate by driver
  const byDriver = new Map<string, {
    fleet_number: string | null;
    equipment_name: string | null;
    total_km: number;
    total_liters: number;
    total_cost: number;
    total_price_entries: number;
    total_price_sum: number;
    hourmeter: number | null;
    daily: { date: string; km: number; liters: number }[];
  }>();

  for (const seg of segments) {
    const key = seg.driver_name;
    if (!byDriver.has(key)) {
      byDriver.set(key, {
        fleet_number: seg.fleet_number,
        equipment_name: seg.equipment_name,
        total_km: 0,
        total_liters: 0,
        total_cost: 0,
        total_price_entries: 0,
        total_price_sum: 0,
        hourmeter: seg.hourmeter,
        daily: [],
      });
    }
    const d = byDriver.get(key)!;
    d.total_km += seg.km;
    d.total_liters += seg.liters;
    d.total_cost += seg.cost;
    if (seg.cost > 0) {
      d.total_price_entries++;
      d.total_price_sum += seg.cost / seg.liters;
    }
    d.fleet_number = seg.fleet_number;
    d.equipment_name = seg.equipment_name;
    if (seg.hourmeter) d.hourmeter = seg.hourmeter;
    d.daily.push({ date: seg.date, km: seg.km, liters: seg.liters });
  }

  // Build model clusters
  const byModel = new Map<string, { total_km: number; total_liters: number; drivers: Set<string> }>();
  for (const seg of segments) {
    const model = extractModel(seg.equipment_name);
    if (!byModel.has(model)) byModel.set(model, { total_km: 0, total_liters: 0, drivers: new Set() });
    const m = byModel.get(model)!;
    m.total_km += seg.km;
    m.total_liters += seg.liters;
    m.drivers.add(seg.driver_name || "Sem Motorista");
  }

  const modelClusters: ModelCluster[] = [];
  const modelAvgMap = new Map<string, number>();
  for (const [model, data] of byModel) {
    const avg = data.total_liters > 0 ? data.total_km / data.total_liters : 0;
    modelClusters.push({
      model,
      total_km: data.total_km,
      total_liters: data.total_liters,
      avg_km_l: avg,
      driver_count: data.drivers.size,
    });
    modelAvgMap.set(model, avg);
  }

  // Build driver stats
  const allDrivers: DriverStats[] = [];
  let totalAboveModelAvg = 0;
  let totalRecords = 0;

  for (const [name, data] of byDriver) {
    const avg = data.total_liters > 0 ? data.total_km / data.total_liters : 0;
    const isOutlier = avg > OUTLIER_HIGH || avg < OUTLIER_LOW;
    const insufficient = data.total_km < MIN_KM;
    const model = extractModel(data.equipment_name);
    const modelAvg = modelAvgMap.get(model) || 0;
    const badge: "green" | "red" | "neutral" = avg >= modelAvg ? "green" : "red";

    if (!insufficient && avg >= modelAvg) totalAboveModelAvg++;
    if (!insufficient) totalRecords++;

    const dailyEntries = data.daily.map((d) => ({
      ...d,
      avg: d.liters > 0 ? d.km / d.liters : 0,
    }));

    allDrivers.push({
      driver_name: name,
      fleet_number: data.fleet_number,
      equipment_name: data.equipment_name,
      total_km: Math.round(data.total_km),
      total_liters: Math.round(data.total_liters),
      avg_km_l: Number(avg.toFixed(2)),
      entries_count: data.daily.length,
      is_outlier: isOutlier,
      insufficient_data: insufficient,
      daily_entries: dailyEntries,
      badge,
      total_cost: Math.round(data.total_cost * 100) / 100,
      avg_price_per_liter: data.total_price_entries > 0 ? data.total_price_sum / data.total_price_entries : 0,
      hourmeter: data.hourmeter,
    });
  }

  // Split into ranked vs insufficient
  const ranked = allDrivers
    .filter((d) => !d.insufficient_data)
    .sort((a, b) => b.avg_km_l - a.avg_km_l);

  const insufficient = allDrivers.filter((d) => d.insufficient_data);

  // Global totals
  const globalKm = segments.reduce((s, seg) => s + seg.km, 0);
  const globalLiters = entries.reduce((s, e) => s + (e.liters || 0), 0);
  const globalCost = entries.reduce((s, e) => s + (e.liters || 0) * (e.price_per_liter || 0), 0);
  const fleetAvg = globalLiters > 0 ? globalKm / globalLiters : 0;
  const efficiencyIndex = totalRecords > 0 ? (totalAboveModelAvg / totalRecords) * 100 : 0;

  return {
    fleet_avg_km_l: Number(fleetAvg.toFixed(2)),
    total_liters: Math.round(globalLiters),
    total_km: Math.round(globalKm),
    total_cost: Math.round(globalCost * 100) / 100,
    efficiency_index: Number(efficiencyIndex.toFixed(1)),
    ranked_drivers: ranked,
    insufficient_drivers: insufficient,
    model_clusters: modelClusters.sort((a, b) => b.avg_km_l - a.avg_km_l),
  };
}

export function formatNumber(n: number): string {
  return n.toLocaleString("pt-BR");
}

export function formatDecimal(n: number, digits = 2): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatCurrency(n: number): string {
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
