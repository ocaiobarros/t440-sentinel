import type { WidgetConfig } from "@/types/builder";
import { createDefaultWidget } from "@/types/builder";

export interface DashboardPreset {
  id: string;
  name: string;
  description: string;
  category: PresetCategory;
  icon: string;
  /** Accent color for the card */
  accent: string;
  /** Pre-configured widgets */
  widgets: WidgetConfig[];
  /** Dashboard-level settings overrides */
  settings?: Record<string, unknown>;
}

export type PresetCategory =
  | "network"
  | "energy"
  | "servers"
  | "wifi"
  | "datacenter"
  | "security"
  | "monitoring"
  | "backup"
  | "cameras"
  | "starlink"
  | "virtualization"
  | "database"
  | "logistics";

export const PRESET_CATEGORIES: { key: PresetCategory; label: string; icon: string; color: string }[] = [
  { key: "network", label: "Network", icon: "Network", color: "#3B82F6" },
  { key: "servers", label: "Servidores", icon: "Server", color: "#39FF14" },
  { key: "datacenter", label: "Data Center", icon: "HardDrive", color: "#F97316" },
  { key: "energy", label: "Energia", icon: "Zap", color: "#FFBF00" },
  { key: "wifi", label: "Wi-Fi / APs", icon: "Wifi", color: "#06B6D4" },
  { key: "security", label: "Segurança", icon: "Shield", color: "#8B5CF6" },
  { key: "starlink", label: "Starlink", icon: "Satellite", color: "#F1F5F9" },
  { key: "virtualization", label: "Virtualização", icon: "Boxes", color: "#0EA5E9" },
  { key: "database", label: "Banco de Dados", icon: "Database", color: "#6366F1" },
  { key: "logistics", label: "Logística", icon: "Truck", color: "#22C55E" },
  { key: "monitoring", label: "Monitoramento", icon: "Eye", color: "#EC4899" },
  { key: "backup", label: "Backup", icon: "DatabaseBackup", color: "#10B981" },
  { key: "cameras", label: "Câmeras", icon: "Camera", color: "#A855F7" },
];

/* ── Helper to create widgets with overrides ── */
function w(
  type: string,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra?: Partial<WidgetConfig>,
): WidgetConfig {
  const base = createDefaultWidget(type, x, y);
  return {
    ...base,
    title,
    w: width,
    h: height,
    ...extra,
    style: { ...base.style, ...extra?.style },
    extra: { ...base.extra, ...extra?.extra },
  };
}

/* ═══════════════════════════════════════════════
   PRESETS
   ═══════════════════════════════════════════════ */

const PRESET_NETWORK_CORE: DashboardPreset = {
  id: "network-core",
  name: "Switches Core",
  description: "Monitoramento centralizado de switches: latência, tráfego top-N e status de portas.",
  category: "network",
  icon: "Network",
  accent: "#3B82F6",
  widgets: [
    w("stat", "Equipamentos Offline", 0, 0, 3, 1, {
      style: { icon: "AlertTriangle", iconColor: "#FF4444", glow: "red" },
    }),
    w("stat", "Latência Média", 3, 0, 4, 1, {
      style: { icon: "Activity", iconColor: "#3B82F6", glow: "blue" },
      extra: { units: "ms" },
    }),
    w("stat", "Menor Uptime", 7, 0, 3, 1, {
      style: { icon: "Clock", iconColor: "#F97316", glow: "amber" },
    }),
    w("gauge", "CPU Core", 0, 1, 3, 2, {
      style: { glow: "green" },
      extra: { units: "%" },
    }),
    w("gauge", "MEM Core", 3, 1, 3, 2, {
      style: { glow: "amber" },
      extra: { units: "%" },
    }),
    w("table", "Top 10 Tráfego", 0, 3, 5, 3, {
      style: { icon: "BarChart3" },
    }),
    w("status", "Switch Core 1 - Status", 6, 1, 3, 1),
    w("status", "Switch Core 2 - Status", 9, 1, 3, 1),
    w("timeseries", "Tráfego Agregado", 6, 3, 6, 3),
  ],
};

const PRESET_SERVERS: DashboardPreset = {
  id: "servers-windows",
  name: "Servidores Windows",
  description: "Visão geral com CPU, MEM, disco, serviços e interfaces de rede.",
  category: "servers",
  icon: "Server",
  accent: "#39FF14",
  widgets: [
    w("stat", "Zabbix Agent", 0, 0, 3, 1, {
      style: { icon: "CheckCircle", iconColor: "#39FF14", glow: "green" },
    }),
    w("stat", "Processos", 0, 1, 3, 1, {
      style: { icon: "Cpu" },
    }),
    w("stat", "Uptime", 0, 2, 3, 1, {
      style: { icon: "Clock", iconColor: "#06B6D4" },
    }),
    w("gauge", "CPU", 3, 0, 3, 2, {
      style: { glow: "green" },
      extra: { units: "%" },
    }),
    w("gauge", "MEM", 6, 0, 3, 2, {
      style: { glow: "amber" },
      extra: { units: "%" },
    }),
    w("gauge", "Disco", 9, 0, 3, 2, {
      style: { glow: "blue" },
      extra: { units: "%" },
    }),
    w("timeseries", "CPU / MEM / Disco", 3, 2, 5, 2),
    w("timeseries", "Download / Upload", 8, 2, 4, 2),
    w("progress", "Memória Usada", 0, 4, 4, 1, {
      extra: { units: "B", max_value: 0 },
    }),
    w("progress", "Disco C:", 4, 4, 4, 1, {
      extra: { units: "B", max_value: 0 },
    }),
    w("table", "Serviços", 0, 5, 6, 3, {
      style: { icon: "List" },
    }),
    w("table", "Filas de Impressão", 6, 5, 6, 3, {
      style: { icon: "Printer" },
    }),
  ],
};

const PRESET_DATACENTER: DashboardPreset = {
  id: "datacenter",
  name: "Data Center",
  description: "Temperatura, umidade, porta do DC, nobreaks e acompanhamento de incidentes.",
  category: "datacenter",
  icon: "HardDrive",
  accent: "#F97316",
  widgets: [
    w("stat", "Porta Data Center", 0, 0, 2, 1, {
      style: { icon: "DoorOpen", glow: "green" },
    }),
    w("stat", "Temp. Piso", 2, 0, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#3B82F6" },
      extra: { units: "°C" },
    }),
    w("stat", "Temp. Ambiente", 4, 0, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#FFBF00", glow: "amber" },
      extra: { units: "°C" },
    }),
    w("stat", "Temp. Nobreak 1", 6, 0, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#39FF14" },
      extra: { units: "°C" },
    }),
    w("stat", "Temp. Nobreak 2", 8, 0, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#39FF14" },
      extra: { units: "°C" },
    }),
    w("stat", "Umidade DC", 10, 0, 2, 1, {
      style: { icon: "Droplets", iconColor: "#06B6D4", glow: "cyan" },
      extra: { units: "%" },
    }),
    w("stat", "Incidentes de Alerta", 0, 1, 3, 2, {
      style: { icon: "AlertTriangle", iconColor: "#FFBF00", glow: "amber" },
    }),
    w("stat", "Incidentes Graves", 0, 3, 3, 2, {
      style: { icon: "AlertOctagon", iconColor: "#FF4444", glow: "red" },
    }),
    w("table", "Incidentes Ativos", 3, 1, 9, 4, {
      style: { icon: "List" },
    }),
    w("timeseries", "Temperatura Histórica", 0, 5, 6, 2),
    w("timeseries", "Umidade Histórica", 6, 5, 6, 2),
  ],
};

const PRESET_ENERGY: DashboardPreset = {
  id: "energy-ups",
  name: "Energia & Nobreaks",
  description: "Tensão de entrada/saída, carga de bateria, temperatura e autonomia dos UPS.",
  category: "energy",
  icon: "Zap",
  accent: "#FFBF00",
  widgets: [
    w("stat", "Tensão Entrada", 0, 0, 3, 1, {
      style: { icon: "Zap", iconColor: "#FFBF00", glow: "amber" },
      extra: { units: "V" },
    }),
    w("stat", "Tensão Saída", 3, 0, 3, 1, {
      style: { icon: "Zap", iconColor: "#39FF14", glow: "green" },
      extra: { units: "V" },
    }),
    w("stat", "Frequência", 6, 0, 3, 1, {
      style: { icon: "Activity", iconColor: "#06B6D4" },
      extra: { units: "Hz" },
    }),
    w("stat", "Autonomia", 9, 0, 3, 1, {
      style: { icon: "Clock", iconColor: "#8B5CF6" },
      extra: { units: "min" },
    }),
    w("progress", "Carga da Bateria", 0, 1, 6, 1, {
      extra: { units: "%", color_map: { "0": "#FF4444", "30": "#FFBF00", "60": "#39FF14" } },
    }),
    w("progress", "Carga de Saída", 6, 1, 6, 1, {
      extra: { units: "%" },
    }),
    w("gauge", "Temp. Bateria", 0, 2, 4, 2, {
      style: { glow: "amber" },
      extra: { units: "°C" },
    }),
    w("timeseries", "Tensão Histórica", 4, 2, 8, 2),
    w("status", "UPS Status", 0, 4, 4, 1, {
      style: { icon: "Power", glow: "green" },
    }),
    w("status", "Bypass Ativo", 4, 4, 4, 1),
    w("stat", "Última Falha", 8, 4, 4, 1, {
      style: { icon: "AlertTriangle", iconColor: "#FF4444" },
    }),
  ],
};

const PRESET_WIFI: DashboardPreset = {
  id: "wifi-aps",
  name: "Visão Macro APs",
  description: "Access Points: clientes conectados, CPU, MEM, satisfação e throughput.",
  category: "wifi",
  icon: "Wifi",
  accent: "#06B6D4",
  widgets: [
    w("stat", "Total Access Points", 0, 0, 3, 1, {
      style: { icon: "Wifi", iconColor: "#06B6D4", glow: "cyan" },
    }),
    w("stat", "Clientes Conectados", 0, 1, 3, 1, {
      style: { icon: "Users", iconColor: "#39FF14" },
    }),
    w("stat", "Clientes 2.4 GHz", 0, 2, 3, 1, {
      style: { icon: "Wifi", iconColor: "#FFBF00" },
    }),
    w("stat", "Clientes 5 GHz", 0, 3, 3, 1, {
      style: { icon: "Wifi", iconColor: "#06B6D4" },
    }),
    w("stat", "Satisfação Média", 0, 4, 3, 1, {
      style: { icon: "ThumbsUp", iconColor: "#39FF14", glow: "green" },
      extra: { units: "%" },
    }),
    w("timeseries", "Throughput Total", 0, 5, 3, 2),
    w("table", "Status dos APs", 3, 0, 9, 4, {
      style: { icon: "Radio" },
    }),
    w("timeseries", "Clientes Conectados (Histórico)", 3, 4, 9, 3),
  ],
};

const PRESET_FIREWALL: DashboardPreset = {
  id: "security-firewall",
  name: "Firewall Checkpoint",
  description: "Throughput WAN, conexões ativas, drops, VPN tunnels e inteligência de ameaças.",
  category: "security",
  icon: "Shield",
  accent: "#8B5CF6",
  widgets: [
    w("stat", "Throughput WAN", 0, 0, 3, 1, {
      style: { icon: "ArrowUpDown", iconColor: "#39FF14", glow: "green" },
      extra: { units: "Gbps" },
    }),
    w("stat", "Conexões Ativas", 3, 0, 3, 1, {
      style: { icon: "Link", iconColor: "#3B82F6" },
    }),
    w("stat", "Firewall Drops", 6, 0, 3, 1, {
      style: { icon: "ShieldAlert", iconColor: "#F97316", glow: "amber" },
      extra: { units: "pps" },
    }),
    w("stat", "Estado da Licença", 9, 0, 3, 1, {
      style: { icon: "KeyRound", iconColor: "#39FF14", glow: "green" },
    }),
    w("progress", "CPU Gateway 1", 0, 1, 4, 1, { extra: { units: "%" } }),
    w("progress", "MEM Gateway 1", 4, 1, 4, 1, { extra: { units: "%" } }),
    w("progress", "Disco Gateway 1", 8, 1, 4, 1, { extra: { units: "%" } }),
    w("table", "VPN Tunnels", 0, 2, 6, 3, {
      style: { icon: "Lock" },
    }),
    w("table", "Top Ameaças", 6, 2, 6, 3, {
      style: { icon: "Skull" },
    }),
    w("timeseries", "Drops Histórico", 0, 5, 12, 2),
  ],
};

/* ── Câmeras / CFTV ── */
const PRESET_CAMERAS: DashboardPreset = {
  id: "cameras-cftv",
  name: "Câmeras / CFTV",
  description: "NVR status, canais livres/em uso, armazenamento de discos e lista de câmeras.",
  category: "cameras",
  icon: "Camera",
  accent: "#A855F7",
  widgets: [
    w("stat", "Status do Dispositivo", 0, 0, 2, 1, {
      style: { icon: "CheckCircle", iconColor: "#39FF14", glow: "green" },
    }),
    w("stat", "Disponibilidade", 2, 0, 2, 1, {
      style: { icon: "Clock", iconColor: "#06B6D4" },
    }),
    w("stat", "Tipo do Dispositivo", 4, 0, 2, 1, {
      style: { icon: "Cctv" },
    }),
    w("stat", "Versão do Sistema", 6, 0, 3, 1, {
      style: { icon: "Info" },
    }),
    w("gauge", "Câmeras Conectadas", 0, 1, 4, 2, {
      style: { glow: "green" },
    }),
    w("stat", "Canais Livres", 4, 1, 3, 1, {
      style: { icon: "Radio", iconColor: "#39FF14" },
    }),
    w("stat", "Em Uso", 7, 1, 3, 1, {
      style: { icon: "Video", iconColor: "#3B82F6" },
    }),
    w("progress", "Disco 1", 4, 2, 4, 1, { extra: { units: "%" } }),
    w("progress", "Disco 2", 8, 2, 4, 1, { extra: { units: "%" } }),
    w("table", "Lista de Câmeras", 0, 3, 6, 3, { style: { icon: "List" } }),
    w("timeseries", "FPS Histórico", 6, 3, 6, 3),
  ],
};

/* ── Monitoramento Web ── */
const PRESET_WEB_MONITORING: DashboardPreset = {
  id: "monitoring-web",
  name: "Monitoramento Web",
  description: "Status de grupos de serviços, indicadores operacional/crítico e topologia visual.",
  category: "monitoring",
  icon: "Globe",
  accent: "#EC4899",
  widgets: [
    w("status", "Grupo 01 - Status", 0, 0, 4, 1, {
      style: { icon: "CheckCircle", glow: "green" },
    }),
    w("status", "Grupo 02 - Status", 4, 0, 4, 1, {
      style: { icon: "AlertTriangle", glow: "red" },
    }),
    w("status", "Grupo 03 - Status", 8, 0, 4, 1, {
      style: { icon: "AlertTriangle", glow: "red" },
    }),
    w("table", "Grupo 01 - Serviços", 0, 1, 4, 3, { style: { icon: "List" } }),
    w("table", "Grupo 02 - Serviços", 4, 1, 4, 3, { style: { icon: "List" } }),
    w("table", "Grupo 03 - Serviços", 8, 1, 4, 3, { style: { icon: "List" } }),
    w("gauge", "% Online", 0, 4, 4, 2, { style: { glow: "green" }, extra: { units: "%" } }),
    w("table", "Grupo 04 - Serviços", 4, 4, 4, 3, { style: { icon: "List" } }),
  ],
};

/* ── Aplicações Web ── */
const PRESET_WEB_APPS: DashboardPreset = {
  id: "monitoring-webapps",
  name: "Aplicações Web",
  description: "Cenários web: hosts online/offline, status de resposta e latência por site.",
  category: "monitoring",
  icon: "AppWindow",
  accent: "#F472B6",
  widgets: [
    w("stat", "CloudX Online", 0, 0, 3, 1, {
      style: { icon: "CheckCircle", iconColor: "#39FF14", glow: "green" },
    }),
    w("stat", "CloudX Offline", 3, 0, 3, 1, {
      style: { icon: "XCircle", iconColor: "#FF4444", glow: "red" },
    }),
    w("stat", "ManageTech Online", 0, 1, 3, 1, {
      style: { icon: "CheckCircle", iconColor: "#39FF14" },
    }),
    w("stat", "ManageTech Offline", 3, 1, 3, 1, {
      style: { icon: "XCircle", iconColor: "#FF4444" },
    }),
    w("table", "Status dos Hosts", 6, 0, 6, 4, { style: { icon: "Globe" } }),
    w("table", "Erros Ativos", 0, 2, 6, 3, { style: { icon: "AlertTriangle" } }),
  ],
};

/* ── Backup / Veeam ── */
const PRESET_BACKUP: DashboardPreset = {
  id: "backup-veeam",
  name: "Veeam Backup",
  description: "Status de jobs, VMs com falha, espaço em disco e serviços de exportação.",
  category: "backup",
  icon: "DatabaseBackup",
  accent: "#10B981",
  widgets: [
    w("stat", "Zabbix Agent", 0, 0, 2, 1, {
      style: { icon: "CheckCircle", iconColor: "#39FF14" },
    }),
    w("stat", "Uptime", 0, 1, 2, 1, {
      style: { icon: "Clock", iconColor: "#06B6D4" },
    }),
    w("stat", "Total de Jobs", 0, 2, 2, 1, { style: { icon: "Layers" } }),
    w("gauge", "CPU", 2, 0, 2, 2, { style: { glow: "green" }, extra: { units: "%" } }),
    w("gauge", "MEM", 4, 0, 2, 2, { style: { glow: "amber" }, extra: { units: "%" } }),
    w("gauge", "Disco", 6, 0, 2, 2, { style: { glow: "blue" }, extra: { units: "%" } }),
    w("stat", "Espaço Usado", 8, 0, 2, 1, {
      style: { icon: "HardDrive" }, extra: { units: "B" },
    }),
    w("stat", "Espaço Total", 10, 0, 2, 1, {
      style: { icon: "HardDrive" }, extra: { units: "B" },
    }),
    w("stat", "Jobs Success", 0, 3, 3, 1, {
      style: { icon: "CheckCircle", iconColor: "#39FF14", glow: "green" },
    }),
    w("stat", "Jobs Problems", 3, 3, 3, 1, {
      style: { icon: "XCircle", iconColor: "#FF4444", glow: "red" },
    }),
    w("stat", "Serviços Running", 6, 3, 3, 1, {
      style: { icon: "Play", iconColor: "#39FF14" },
    }),
    w("stat", "Serviços Stopped", 9, 3, 3, 1, {
      style: { icon: "Square", iconColor: "#FF4444" },
    }),
    w("table", "VMs por Job", 0, 4, 6, 3, { style: { icon: "List" } }),
    w("table", "VMs com Falha", 6, 4, 6, 3, { style: { icon: "AlertTriangle" } }),
  ],
};

/* ── Nobreaks Detalhado ── */
const PRESET_NOBREAK: DashboardPreset = {
  id: "energy-nobreak",
  name: "Nobreak Detalhado",
  description: "Status do UPS, nível de bateria, tensão entrada/saída, RouterBoard e incidentes.",
  category: "energy",
  icon: "BatteryCharging",
  accent: "#22C55E",
  widgets: [
    w("status", "Status UPS", 0, 0, 3, 1, {
      style: { icon: "Power", glow: "green" },
    }),
    w("stat", "Temperatura", 0, 1, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C" },
    }),
    w("stat", "Modo", 2, 1, 2, 1, { style: { icon: "Workflow" } }),
    w("gauge", "Nível da Bateria", 3, 0, 3, 2, {
      style: { glow: "green" }, extra: { units: "%" },
    }),
    w("stat", "Tensão Entrada", 0, 2, 3, 1, {
      style: { icon: "ArrowRight", iconColor: "#FFBF00" }, extra: { units: "V" },
    }),
    w("stat", "Tensão Saída", 3, 2, 3, 1, {
      style: { icon: "ArrowRight", iconColor: "#39FF14" }, extra: { units: "V" },
    }),
    w("status", "Status RB", 6, 0, 3, 1, {
      style: { icon: "Router", glow: "green" },
    }),
    w("stat", "Tensão RB", 9, 0, 3, 1, {
      style: { icon: "Zap", iconColor: "#39FF14" }, extra: { units: "V" },
    }),
    w("timeseries", "Tráfego Uplink", 6, 1, 6, 2),
    w("table", "Incidentes Ativos", 0, 3, 12, 3, { style: { icon: "AlertTriangle" } }),
  ],
};

/* ── Links / ISP ── */
const PRESET_LINKS: DashboardPreset = {
  id: "network-links",
  name: "Análise de Links",
  description: "Status de operadoras, latência, perda de pacotes, estabilidade e consumo de interfaces.",
  category: "network",
  icon: "Link",
  accent: "#0EA5E9",
  widgets: [
    w("stat", "Operadora 1 - Latência", 0, 0, 3, 1, {
      style: { icon: "Activity", iconColor: "#39FF14", glow: "green" }, extra: { units: "ms" },
    }),
    w("stat", "Operadora 1 - Perda", 3, 0, 3, 1, {
      style: { icon: "TrendingDown", iconColor: "#FFBF00" }, extra: { units: "%" },
    }),
    w("stat", "Operadora 2 - Latência", 0, 1, 3, 1, {
      style: { icon: "Activity", iconColor: "#3B82F6" }, extra: { units: "ms" },
    }),
    w("stat", "Operadora 2 - Perda", 3, 1, 3, 1, {
      style: { icon: "TrendingDown", iconColor: "#FFBF00" }, extra: { units: "%" },
    }),
    w("table", "Comparativo de Performance", 6, 0, 6, 3, { style: { icon: "Table2" } }),
    w("progress", "Estabilidade Op. 1", 0, 2, 6, 1, { extra: { units: "%" } }),
    w("progress", "Estabilidade Op. 2", 0, 3, 6, 1, { extra: { units: "%" } }),
    w("timeseries", "Download", 0, 4, 6, 2),
    w("timeseries", "Upload", 6, 4, 6, 2),
    w("stat", "Média Download", 0, 6, 3, 1, {
      style: { icon: "ArrowDown", iconColor: "#06B6D4" }, extra: { units: "Gb/s" },
    }),
    w("stat", "Média Upload", 3, 6, 3, 1, {
      style: { icon: "ArrowUp", iconColor: "#39FF14" }, extra: { units: "Gb/s" },
    }),
  ],
};

/* ── Servidores Macro ── */
const PRESET_SERVERS_MACRO: DashboardPreset = {
  id: "servers-macro",
  name: "Visão Macro Servidores",
  description: "Grid de servidores com gauges de CPU/MEM/Disco, serviços críticos e top consumo.",
  category: "servers",
  icon: "MonitorCog",
  accent: "#14B8A6",
  widgets: [
    w("stat", "Servidores Monitorados", 0, 0, 4, 1, {
      style: { icon: "Server", iconColor: "#39FF14", glow: "green" },
    }),
    w("gauge", "Status Geral", 4, 0, 4, 2, { style: { glow: "green" } }),
    w("status", "Zabbix Agent", 8, 0, 4, 1, {
      style: { icon: "Radio", glow: "green" },
    }),
    w("gauge", "Srv 1 - CPU", 0, 2, 2, 2, { extra: { units: "%" } }),
    w("gauge", "Srv 1 - MEM", 2, 2, 2, 2, { extra: { units: "%" } }),
    w("gauge", "Srv 1 - Disco", 4, 2, 2, 2, { extra: { units: "%" } }),
    w("gauge", "Srv 2 - CPU", 6, 2, 2, 2, { extra: { units: "%" } }),
    w("gauge", "Srv 2 - MEM", 8, 2, 2, 2, { extra: { units: "%" } }),
    w("gauge", "Srv 2 - Disco", 10, 2, 2, 2, { extra: { units: "%" } }),
    w("table", "Serviços Críticos", 0, 4, 6, 3, { style: { icon: "AlertTriangle" } }),
    w("table", "Top 5 Consumo CPU", 6, 4, 3, 3, { style: { icon: "Cpu" } }),
    w("table", "Top 5 Consumo RAM", 9, 4, 3, 3, { style: { icon: "MemoryStick" } }),
  ],
};

/* ── IX / Peering ── */
const PRESET_IX_PEERING: DashboardPreset = {
  id: "network-ix",
  name: "IX / Peering",
  description: "Tráfego agregado de peering (IX.br, Cloudflare, CDN) com timeseries e incidentes.",
  category: "network",
  icon: "Globe",
  accent: "#6366F1",
  widgets: [
    w("stat", "Agregado Download", 0, 0, 3, 1, {
      style: { icon: "ArrowDown", iconColor: "#3B82F6" }, extra: { units: "Gb/s" },
    }),
    w("stat", "Agregado Upload", 3, 0, 3, 1, {
      style: { icon: "ArrowUp", iconColor: "#39FF14" }, extra: { units: "Gb/s" },
    }),
    w("timeseries", "Agregado Geral", 6, 0, 6, 2),
    w("stat", "IX BR (SP) - DL", 0, 1, 3, 1, { extra: { units: "Gb/s" } }),
    w("stat", "IX BR (SP) - UL", 3, 1, 3, 1, { extra: { units: "MB/s" } }),
    w("stat", "Cloudflare - DL", 0, 2, 3, 1, { extra: { units: "MB/s" } }),
    w("stat", "Cloudflare - UL", 3, 2, 3, 1, { extra: { units: "MB/s" } }),
    w("timeseries", "IX BR (SP)", 0, 3, 3, 2),
    w("timeseries", "IX BR (RJ)", 3, 3, 3, 2),
    w("timeseries", "Cloudflare", 6, 3, 3, 2),
    w("timeseries", "CDN / Wix", 9, 3, 3, 2),
    w("table", "Incidentes", 0, 5, 12, 2, { style: { icon: "AlertTriangle" } }),
  ],
};

/* ── Starlink Fleet ── */
const PRESET_STARLINK: DashboardPreset = {
  id: "starlink-fleet",
  name: "Starlink Fleet",
  description: "Status da antena, download/upload, latência, obstrução, diagnóstico de hardware e GPS.",
  category: "starlink",
  icon: "Satellite",
  accent: "#F1F5F9",
  widgets: [
    w("label", "⚡ STATUS DO SISTEMA", 0, 0, 6, 1, { style: { glow: "green" } }),
    w("stat", "Hardware", 0, 1, 2, 1, { style: { icon: "Cpu", iconColor: "#39FF14" } }),
    w("stat", "Geração", 2, 1, 2, 1, { style: { icon: "Hash" } }),
    w("stat", "País", 4, 1, 2, 1, { style: { icon: "Globe" } }),
    w("stat", "ETH Speed", 6, 1, 2, 1, { style: { icon: "Network", iconColor: "#06B6D4" }, extra: { units: "Mbps" } }),
    w("stat", "Boot Count", 8, 1, 2, 1, { style: { icon: "RotateCcw" } }),
    w("status", "Disponibilidade", 10, 1, 2, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("label", "📡 REDE & SERVIÇOS", 6, 0, 6, 1, { style: { glow: "cyan" } }),
    w("stat", "Download", 0, 2, 3, 1, { style: { icon: "ArrowDown", iconColor: "#06B6D4", glow: "cyan" }, extra: { units: "Mbps" } }),
    w("stat", "Upload", 3, 2, 3, 1, { style: { icon: "ArrowUp", iconColor: "#39FF14", glow: "green" }, extra: { units: "Mbps" } }),
    w("stat", "Latência", 6, 2, 3, 1, { style: { icon: "Clock", iconColor: "#FFBF00" }, extra: { units: "ms" } }),
    w("stat", "Uptime", 9, 2, 3, 1, { style: { icon: "Timer" } }),
    w("label", "🔧 DIAGNÓSTICO & HARDWARE", 0, 3, 6, 1),
    w("status", "CADY - Clock", 0, 4, 3, 1, { style: { icon: "Clock", glow: "green" } }),
    w("status", "SCP - CPU", 3, 4, 3, 1, { style: { icon: "Cpu", glow: "green" } }),
    w("status", "XPHY - PHY", 0, 5, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("status", "ETH - Link", 3, 5, 3, 1, { style: { icon: "Network", glow: "green" } }),
    w("status", "GPS", 0, 6, 3, 1, { style: { icon: "MapPin", glow: "green" } }),
    w("status", "SNR - Sinal", 3, 6, 3, 1, { style: { icon: "Signal", glow: "green" } }),
    w("stat", "Azimuth", 6, 4, 3, 1, { style: { icon: "Compass" }, extra: { units: "°" } }),
    w("stat", "Elevation", 9, 4, 3, 1, { style: { icon: "ArrowUp" }, extra: { units: "°" } }),
    w("stat", "Tilt Angle", 6, 5, 3, 1, { style: { icon: "RotateCcw" }, extra: { units: "°" } }),
    w("stat", "Obst. Valid", 9, 5, 3, 1, { style: { icon: "Eye" }, extra: { units: "s" } }),
    w("stat", "Patches", 6, 6, 3, 1, { style: { icon: "Layers" } }),
    w("status", "Attitude", 9, 6, 3, 1, { style: { icon: "Target", glow: "green" } }),
  ],
  settings: { cols: 12, rowHeight: 70 },
};

/* ── VMware / Virtualização ── */
const PRESET_VMWARE: DashboardPreset = {
  id: "virtualization-vmware",
  name: "VMware ESXi",
  description: "Cards de VMs com CPU, MEM, Power Usage, versão, vendor e status do hypervisor.",
  category: "virtualization",
  icon: "Boxes",
  accent: "#0EA5E9",
  widgets: [
    w("label", "VM 01", 0, 0, 4, 1, { style: { glow: "blue" } }),
    w("gauge", "VM01 - CPU", 0, 1, 2, 2, { style: { glow: "blue" }, extra: { units: "%" } }),
    w("gauge", "VM01 - MEM", 2, 1, 2, 2, { style: { glow: "cyan" }, extra: { units: "%" } }),
    w("status", "VM01 - Ping", 0, 3, 2, 1, { style: { icon: "Activity", glow: "green" } }),
    w("status", "VM01 - Overall", 2, 3, 2, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "VM01 - Power Max", 0, 4, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "W" } }),
    w("stat", "VM01 - Uptime", 2, 4, 2, 1, { style: { icon: "Clock" } }),
    w("label", "VM 02", 4, 0, 4, 1, { style: { glow: "blue" } }),
    w("gauge", "VM02 - CPU", 4, 1, 2, 2, { style: { glow: "blue" }, extra: { units: "%" } }),
    w("gauge", "VM02 - MEM", 6, 1, 2, 2, { style: { glow: "cyan" }, extra: { units: "%" } }),
    w("status", "VM02 - Ping", 4, 3, 2, 1, { style: { icon: "Activity", glow: "green" } }),
    w("status", "VM02 - Overall", 6, 3, 2, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "VM02 - Power Max", 4, 4, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "W" } }),
    w("stat", "VM02 - Uptime", 6, 4, 2, 1, { style: { icon: "Clock" } }),
    w("label", "VM 03", 8, 0, 4, 1, { style: { glow: "blue" } }),
    w("gauge", "VM03 - CPU", 8, 1, 2, 2, { style: { glow: "blue" }, extra: { units: "%" } }),
    w("gauge", "VM03 - MEM", 10, 1, 2, 2, { style: { glow: "cyan" }, extra: { units: "%" } }),
    w("status", "VM03 - Ping", 8, 3, 2, 1, { style: { icon: "Activity", glow: "green" } }),
    w("status", "VM03 - Overall", 10, 3, 2, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "VM03 - Power Max", 8, 4, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "W" } }),
    w("stat", "VM03 - Uptime", 10, 4, 2, 1, { style: { icon: "Clock" } }),
  ],
  settings: { cols: 12, rowHeight: 70 },
};

/* ── MySQL / Banco de Dados ── */
const PRESET_MYSQL: DashboardPreset = {
  id: "database-mysql",
  name: "MySQL",
  description: "Threads, InnoDB buffer, queries/s, connections, buffer pool e tráfego de rede.",
  category: "database",
  icon: "Database",
  accent: "#6366F1",
  widgets: [
    w("label", "AVAILABILITY", 0, 0, 12, 1, { style: { glow: "green" } }),
    w("status", "Status", 0, 1, 2, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "Uptime", 2, 1, 3, 1, { style: { icon: "Clock", iconColor: "#06B6D4" } }),
    w("stat", "Threads Running", 5, 1, 2, 1, { style: { icon: "Cpu" } }),
    w("gauge", "Threads Connected", 7, 1, 2, 2, { style: { glow: "blue" } }),
    w("gauge", "Threads Cached", 9, 1, 2, 2, { style: { glow: "cyan" } }),
    w("gauge", "Threads Created/s", 11, 1, 1, 2, { style: { glow: "blue" } }),
    w("label", "INNODB BUFFER / SIZE", 0, 3, 12, 1, { style: { glow: "blue" } }),
    w("stat", "InnoDB Buffer Reads", 0, 4, 2, 1, { style: { icon: "Database" } }),
    w("stat", "InnoDB Buffer Written", 2, 4, 2, 1, { style: { icon: "Database" } }),
    w("stat", "InnoDB Log Writes", 4, 4, 2, 1, { style: { icon: "FileText" } }),
    w("stat", "InnoDB Row Lock", 6, 4, 2, 1, { style: { icon: "Lock" } }),
    w("gauge", "Buffer Pool Efficiency", 0, 5, 3, 2, { style: { glow: "amber" }, extra: { units: "%" } }),
    w("gauge", "Buffer Pool Utilization", 3, 5, 3, 2, { style: { glow: "red" }, extra: { units: "%" } }),
    w("label", "GENERAL INFORMATION", 6, 5, 6, 1),
    w("stat", "Queries/s", 6, 6, 3, 1, { style: { icon: "Zap", iconColor: "#39FF14" } }),
    w("stat", "Slow Queries/s", 9, 6, 3, 1, { style: { icon: "AlertTriangle", iconColor: "#FF4444" } }),
    w("stat", "Max Connections", 0, 7, 3, 1, { style: { icon: "Users" } }),
    w("stat", "Open Tables", 3, 7, 3, 1, { style: { icon: "Table2" } }),
    w("timeseries", "Tráfego MySQL", 6, 7, 6, 2),
  ],
  settings: { cols: 12, rowHeight: 60 },
};

/* ── Fortigate / Firewall ── */
const PRESET_FORTIGATE: DashboardPreset = {
  id: "security-fortigate",
  name: "Fortigate",
  description: "Disponibilidade, uptime, packet loss, latência, VPN, sessões ativas, disco e HA.",
  category: "security",
  icon: "ShieldCheck",
  accent: "#22C55E",
  widgets: [
    w("label", "HARDWARE INFORMATION", 0, 0, 12, 1, { style: { glow: "green" } }),
    w("status", "Availability", 0, 1, 3, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "Uptime", 3, 1, 3, 1, { style: { icon: "Clock", iconColor: "#06B6D4" } }),
    w("stat", "Packet Loss", 6, 1, 3, 1, { style: { icon: "TrendingDown", iconColor: "#FFBF00" }, extra: { units: "%" } }),
    w("stat", "Latency", 9, 1, 3, 1, { style: { icon: "Activity", iconColor: "#39FF14" }, extra: { units: "ms" } }),
    w("gauge", "CPU Usage", 0, 2, 3, 2, { style: { glow: "green" }, extra: { units: "%" } }),
    w("gauge", "Memory Use", 3, 2, 3, 2, { style: { glow: "amber" }, extra: { units: "%" } }),
    w("table", "Device Info", 6, 2, 6, 2, { style: { icon: "Info" } }),
    w("label", "VPN AND SESSIONS", 0, 4, 12, 1, { style: { glow: "green" } }),
    w("status", "SSL VPN", 0, 5, 3, 1, { style: { icon: "Lock", glow: "red" } }),
    w("stat", "VPN Users Active", 3, 5, 2, 1, { style: { icon: "Users" } }),
    w("stat", "IPSEC Tunnels", 5, 5, 2, 1, { style: { icon: "Lock", iconColor: "#06B6D4" } }),
    w("stat", "SPU", 7, 5, 2, 1, { style: { icon: "Cpu" }, extra: { units: "%" } }),
    w("stat", "Active Sessions", 0, 6, 3, 2, { style: { icon: "Users", iconColor: "#39FF14", glow: "green", valueFontSize: 36 } }),
    w("timeseries", "Active Sessions Over Time", 3, 6, 9, 2),
    w("label", "DISCO AND HA", 0, 8, 12, 1),
    w("stat", "HA Mode", 0, 9, 3, 1, { style: { icon: "Boxes" } }),
    w("stat", "HA Load-Balancing", 3, 9, 3, 1, { style: { icon: "Scale" } }),
    w("stat", "HA Config Sync", 6, 9, 3, 1, { style: { icon: "RefreshCcw", iconColor: "#39FF14" } }),
    w("stat", "HA Cluster Priority", 9, 9, 3, 1, { style: { icon: "Hash" } }),
    w("progress", "Disk Usage", 0, 10, 6, 1, { extra: { units: "B", max_value: 0 } }),
    w("timeseries", "Disk Usage Over Time", 6, 10, 6, 2),
  ],
  settings: { cols: 12, rowHeight: 60 },
};

/* ── Retificadoras / Energia ── */
const PRESET_RETIFICADORAS: DashboardPreset = {
  id: "energy-retificadoras",
  name: "Retificadoras",
  description: "Status, corrente de saída, voltagens AC, temperatura, bateria, consumo e potência.",
  category: "energy",
  icon: "BatteryCharging",
  accent: "#22C55E",
  widgets: [
    w("label", "RETIFICADORA 1", 0, 0, 6, 1, { style: { glow: "green" } }),
    w("status", "Ret 1 - Status", 0, 1, 2, 2, { style: { icon: "Power", glow: "green" } }),
    w("stat", "Ret 1 - Corrente", 0, 3, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "A" } }),
    w("stat", "Ret 1 - AC V1", 2, 1, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 1 - AC V2", 2, 2, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 1 - AC V3", 2, 3, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 1 - Temp", 4, 1, 2, 1, { style: { icon: "Thermometer", iconColor: "#39FF14" }, extra: { units: "°C" } }),
    w("progress", "Ret 1 - Consumo", 4, 2, 2, 1, { extra: { units: "%" } }),
    w("stat", "Ret 1 - Potência", 4, 3, 2, 1, { style: { icon: "Zap" }, extra: { units: "VA" } }),
    w("label", "RETIFICADORA 2", 6, 0, 6, 1, { style: { glow: "green" } }),
    w("status", "Ret 2 - Status", 6, 1, 2, 2, { style: { icon: "Power", glow: "green" } }),
    w("stat", "Ret 2 - Corrente", 6, 3, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "A" } }),
    w("stat", "Ret 2 - AC V1", 8, 1, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 2 - AC V2", 8, 2, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 2 - AC V3", 8, 3, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 2 - Temp", 10, 1, 2, 1, { style: { icon: "Thermometer", iconColor: "#FF4444" }, extra: { units: "°C" } }),
    w("progress", "Ret 2 - Consumo", 10, 2, 2, 1, { extra: { units: "%" } }),
    w("stat", "Ret 2 - Potência", 10, 3, 2, 1, { style: { icon: "Zap" }, extra: { units: "VA" } }),
    w("label", "RETIFICADORA 3", 0, 4, 6, 1, { style: { glow: "green" } }),
    w("status", "Ret 3 - Status", 0, 5, 2, 2, { style: { icon: "Power", glow: "green" } }),
    w("stat", "Ret 3 - Corrente", 0, 7, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "A" } }),
    w("stat", "Ret 3 - AC V1", 2, 5, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 3 - AC V2", 2, 6, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 3 - AC V3", 2, 7, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 3 - Temp", 4, 5, 2, 1, { style: { icon: "Thermometer" }, extra: { units: "°C" } }),
    w("progress", "Ret 3 - Consumo", 4, 6, 2, 1, { extra: { units: "%" } }),
    w("stat", "Ret 3 - Potência", 4, 7, 2, 1, { style: { icon: "Zap" }, extra: { units: "VA" } }),
    w("label", "RETIFICADORA 4", 6, 4, 6, 1, { style: { glow: "green" } }),
    w("status", "Ret 4 - Status", 6, 5, 2, 2, { style: { icon: "Power", glow: "green" } }),
    w("stat", "Ret 4 - Corrente", 6, 7, 2, 1, { style: { icon: "Zap", iconColor: "#FFBF00" }, extra: { units: "A" } }),
    w("stat", "Ret 4 - AC V1", 8, 5, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 4 - AC V2", 8, 6, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 4 - AC V3", 8, 7, 2, 1, { style: { icon: "Zap" }, extra: { units: "V" } }),
    w("stat", "Ret 4 - Temp", 10, 5, 2, 1, { style: { icon: "Thermometer" }, extra: { units: "°C" } }),
    w("progress", "Ret 4 - Consumo", 10, 6, 2, 1, { extra: { units: "%" } }),
    w("stat", "Ret 4 - Potência", 10, 7, 2, 1, { style: { icon: "Zap" }, extra: { units: "VA" } }),
  ],
  settings: { cols: 12, rowHeight: 60 },
};

/* ── Logística / Frota ── */
const PRESET_LOGISTICS: DashboardPreset = {
  id: "logistics-fleet",
  name: "Logística / Frota",
  description: "Status de entregas, custos, km rodados, combustível e total de frota.",
  category: "logistics",
  icon: "Truck",
  accent: "#22C55E",
  widgets: [
    w("stat", "Dentro do Prazo", 0, 0, 3, 1, { style: { icon: "CheckCircle", iconColor: "#39FF14", glow: "green" } }),
    w("stat", "Fora do Prazo", 3, 0, 3, 1, { style: { icon: "Clock", iconColor: "#FFBF00", glow: "amber" } }),
    w("stat", "Não Entregue", 6, 0, 3, 1, { style: { icon: "XCircle", iconColor: "#FF4444", glow: "red" } }),
    w("stat", "Custo Médio / Entrega", 0, 1, 4, 1, { style: { icon: "DollarSign", iconColor: "#39FF14" }, extra: { units: "R$" } }),
    w("stat", "Custo Diário", 4, 1, 4, 1, { style: { icon: "DollarSign" }, extra: { units: "R$" } }),
    w("stat", "Custo Mensal", 8, 1, 4, 1, { style: { icon: "DollarSign", iconColor: "#FFBF00" }, extra: { units: "R$" } }),
    w("stat", "KM Médio / Entrega", 0, 2, 4, 1, { style: { icon: "MapPin" }, extra: { units: "km" } }),
    w("stat", "KM Diário", 4, 2, 4, 1, { style: { icon: "MapPin" }, extra: { units: "km" } }),
    w("stat", "KM Mensal", 8, 2, 4, 1, { style: { icon: "MapPin" }, extra: { units: "km" } }),
    w("timeseries", "Consumo Combustível", 0, 3, 6, 3),
    w("stat", "Total Frota", 6, 3, 3, 1, { style: { icon: "Truck", iconColor: "#39FF14", glow: "green" } }),
    w("stat", "Em Rota", 6, 4, 3, 1, { style: { icon: "Navigation", iconColor: "#06B6D4" } }),
    w("stat", "Manutenção", 9, 4, 3, 1, { style: { icon: "Wrench", iconColor: "#FFBF00" } }),
    w("stat", "Indisponíveis", 9, 5, 3, 1, { style: { icon: "XCircle", iconColor: "#FF4444" } }),
    w("gauge", "% Entregas no Prazo", 9, 3, 3, 2, { style: { glow: "green" }, extra: { units: "%" } }),
  ],
  settings: { cols: 12, rowHeight: 70 },
};

/* ── Microsoft 365 Security ── */
const PRESET_M365_SECURITY: DashboardPreset = {
  id: "security-m365",
  name: "Microsoft 365 Security",
  description: "Atividades suspeitas: phishing, malware, URLs maliciosas, força bruta e status de risco.",
  category: "security",
  icon: "ShieldAlert",
  accent: "#F97316",
  widgets: [
    w("stat", "Atividades Totais", 0, 0, 4, 2, { style: { icon: "Shield", iconColor: "#F97316", glow: "amber", valueFontSize: 36 } }),
    w("stat", "Phishing", 4, 0, 4, 1, { style: { icon: "Mail", iconColor: "#3B82F6" } }),
    w("stat", "Malware", 8, 0, 4, 1, { style: { icon: "Bug", iconColor: "#FF4444" } }),
    w("stat", "URLs Maliciosas", 4, 1, 4, 1, { style: { icon: "Link", iconColor: "#FFBF00" } }),
    w("stat", "Scripts Maliciosos", 8, 1, 4, 1, { style: { icon: "Code", iconColor: "#8B5CF6" } }),
    w("stat", "Força Bruta", 0, 2, 4, 1, { style: { icon: "Key", iconColor: "#EC4899" } }),
    w("label", "STATUS GERAL DE RISCO", 4, 2, 8, 1, { style: { glow: "red" } }),
    w("stat", "Login Suspeito", 0, 3, 4, 1, { style: { icon: "UserX", iconColor: "#FF4444", glow: "red" } }),
    w("stat", "Usuários Comprometidos", 4, 3, 4, 1, { style: { icon: "Users", iconColor: "#FF4444" } }),
    w("stat", "Sessões Não Confiáveis", 8, 3, 4, 1, { style: { icon: "Monitor", iconColor: "#FFBF00" } }),
    w("stat", "Senhas Resetadas", 0, 4, 4, 1, { style: { icon: "Key", iconColor: "#8B5CF6" } }),
    w("stat", "Transferências Incomuns", 4, 4, 4, 1, { style: { icon: "ArrowUpDown", iconColor: "#06B6D4" } }),
    w("stat", "Compartilhamento Excessivo", 8, 4, 4, 1, { style: { icon: "Share2", iconColor: "#F97316" } }),
    w("table", "Detalhes Login", 0, 5, 6, 3, { style: { icon: "FileText" } }),
    w("table", "Status Serviços M365", 6, 5, 6, 3, { style: { icon: "Cloud" } }),
  ],
  settings: { cols: 12, rowHeight: 60 },
};

/* ── POP Protect ── */
const PRESET_POP_PROTECT: DashboardPreset = {
  id: "monitoring-pop-protect",
  name: "POP Protect",
  description: "Disponibilidade, tensões, temperaturas, status de sensores da rede elétrica e sirene.",
  category: "monitoring",
  icon: "ShieldCheck",
  accent: "#39FF14",
  widgets: [
    w("label", "DISPONIBILIDADE DO EQUIPAMENTO", 0, 0, 12, 1, { style: { glow: "green" } }),
    w("table", "Lista POPs", 0, 1, 4, 4, { style: { icon: "List" } }),
    w("status", "Disponibilidade", 4, 1, 4, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "Entrada AC", 4, 2, 2, 1, { style: { icon: "Zap", iconColor: "#39FF14" }, extra: { units: "V" } }),
    w("stat", "Tensão Bateria", 6, 2, 2, 1, { style: { icon: "BatteryCharging", iconColor: "#39FF14" }, extra: { units: "V" } }),
    w("stat", "Temp Externa", 4, 3, 2, 1, { style: { icon: "Thermometer", iconColor: "#06B6D4" }, extra: { units: "°C" } }),
    w("stat", "Temp Interna", 6, 3, 2, 1, { style: { icon: "Thermometer", iconColor: "#FFBF00" }, extra: { units: "°C" } }),
    w("timeseries", "Histórico Tensão Bat.", 8, 1, 4, 2),
    w("timeseries", "Histórico Entrada AC", 8, 3, 4, 2),
    w("label", "STATUS", 0, 5, 12, 1),
    w("status", "Rede Elétrica", 0, 6, 3, 1, { style: { icon: "Zap", glow: "green" } }),
    w("status", "Sensor 1", 0, 7, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("status", "Sensor 2", 0, 8, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("status", "Sensor 3", 0, 9, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("gauge", "Sensores Habilitados", 3, 6, 3, 3, { style: { glow: "green" } }),
    w("status", "Sirene", 6, 6, 3, 1, { style: { icon: "Bell", glow: "green" } }),
    w("status", "Sirene Sensor 1", 6, 7, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("status", "Sirene Sensor 2", 6, 8, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("status", "Sirene Sensor 3", 6, 9, 3, 1, { style: { icon: "Radio", glow: "green" } }),
    w("gauge", "Sirenes Habilitados", 9, 6, 3, 3, { style: { glow: "green" } }),
  ],
  settings: { cols: 12, rowHeight: 60 },
};

/* ── Linux Server ── */
const PRESET_LINUX: DashboardPreset = {
  id: "servers-linux",
  name: "Servidor Linux",
  description: "CPU, MEM, disco, processos, load average, tráfego de rede e filesystem.",
  category: "servers",
  icon: "Terminal",
  accent: "#39FF14",
  widgets: [
    w("stat", "Processos Running", 0, 0, 3, 1, { style: { icon: "Cpu", iconColor: "#39FF14" } }),
    w("stat", "Logged Users", 0, 1, 3, 1, { style: { icon: "Users" } }),
    w("stat", "Total Processos", 0, 2, 3, 1, { style: { icon: "Layers" } }),
    w("status", "Disponibilidade", 0, 3, 3, 1, { style: { icon: "CheckCircle", glow: "green" } }),
    w("stat", "Uptime", 0, 4, 3, 1, { style: { icon: "Clock", iconColor: "#06B6D4" } }),
    w("gauge", "CPU Utilization", 3, 0, 3, 2, { style: { glow: "green" }, extra: { units: "%" } }),
    w("gauge", "Memory Utilization", 6, 0, 3, 2, { style: { glow: "amber" }, extra: { units: "%" } }),
    w("gauge", "Disk Utilization", 9, 0, 3, 2, { style: { glow: "blue" }, extra: { units: "%" } }),
    w("timeseries", "CPU Histórico", 3, 2, 5, 2),
    w("timeseries", "Memory Histórico", 8, 2, 4, 2),
    w("label", "TRÁFEGO / DISCO", 0, 5, 6, 1),
    w("stat", "Disk Write Rate", 0, 6, 3, 1, { style: { icon: "HardDrive" }, extra: { units: "w/s" } }),
    w("stat", "Disk Read Rate", 3, 6, 3, 1, { style: { icon: "HardDrive" }, extra: { units: "r/s" } }),
    w("timeseries", "Tráfego de Rede", 0, 7, 6, 3),
    w("label", "LOAD AVERAGE", 6, 5, 6, 1),
    w("stat", "Load 1m", 6, 6, 2, 1, { style: { icon: "Activity" } }),
    w("stat", "Load 5m", 8, 6, 2, 1, { style: { icon: "Activity" } }),
    w("stat", "Load 15m", 10, 6, 2, 1, { style: { icon: "Activity" } }),
    w("timeseries", "Load Average", 6, 7, 6, 2),
    w("progress", "Space Utilization", 6, 9, 6, 1, { extra: { units: "%" } }),
  ],
  settings: { cols: 12, rowHeight: 60 },
};

/* ═══════════════════════════════════════════════
   iDRAC T440 — Template Nativo Funcional
   Mapeamento completo: PSU, Térmico, Fans,
   Storage RAID, Rede e Inventário
   ═══════════════════════════════════════════════ */
const PRESET_IDRAC_T440: DashboardPreset = {
  id: "servers-idrac-t440",
  name: "iDRAC — Dell T440",
  description: "Gêmeo digital completo: PSU, temperatura CPU/Inlet, ventilação, RAID, NICs e inventário BIOS/Service Tag.",
  category: "servers",
  icon: "Server",
  accent: "#39FF14",
  widgets: [
    /* ── HEADER ── */
    w("label", "⚡ BLOCO DE ENERGIA (PSU)", 0, 0, 6, 1, { style: { glow: "amber" } }),
    w("label", "🌡️ GESTÃO TÉRMICA", 6, 0, 6, 1, { style: { glow: "red" } }),

    /* ── PSU Section ── */
    w("stat", "PSU1 — Tensão", 0, 1, 3, 1, {
      style: { icon: "Zap", iconColor: "#FFBF00", glow: "amber" },
      extra: { units: "V", zabbix_key: "ipmi.sensor[PSU1 Voltage]" },
    }),
    w("stat", "PSU1 — Potência", 3, 1, 3, 1, {
      style: { icon: "Zap", iconColor: "#39FF14", glow: "green" },
      extra: { units: "W", zabbix_key: "ipmi.sensor[PS1 Current 1]" },
    }),
    w("stat", "PSU2 — Tensão", 0, 2, 3, 1, {
      style: { icon: "Zap", iconColor: "#FFBF00" },
      extra: { units: "V", zabbix_key: "ipmi.sensor[PSU2 Voltage]" },
    }),
    w("stat", "PSU2 — Potência", 3, 2, 3, 1, {
      style: { icon: "Zap", iconColor: "#39FF14" },
      extra: { units: "W", zabbix_key: "ipmi.sensor[PS2 Current 1]" },
    }),
    w("status", "PSU1 — Status", 0, 3, 3, 1, {
      style: { icon: "Power", glow: "green" },
      extra: {
        zabbix_key: "ipmi.discrete-sensor[PSU1 Status]",
        color_map: { "0x01": { color: "#39FF14", label: "OK" }, "0x02": { color: "#FF4444", label: "FALHA" } },
      },
    }),
    w("status", "PSU2 — Status", 3, 3, 3, 1, {
      style: { icon: "Power", glow: "green" },
      extra: {
        zabbix_key: "ipmi.discrete-sensor[PSU2 Status]",
        color_map: { "0x01": { color: "#39FF14", label: "OK" }, "0x02": { color: "#FF4444", label: "FALHA" } },
      },
    }),

    /* ── THERMAL Section ── */
    w("gauge", "CPU1 Temp", 6, 1, 2, 2, {
      style: { glow: "amber" },
      extra: { units: "°C", min: 0, max: 100, zabbix_key: "ipmi.sensor[Temp,CPU1 Temp]" },
    }),
    w("gauge", "CPU2 Temp", 8, 1, 2, 2, {
      style: { glow: "amber" },
      extra: { units: "°C", min: 0, max: 100, zabbix_key: "ipmi.sensor[Temp,CPU2 Temp]" },
    }),
    w("gauge", "Inlet Temp", 10, 1, 2, 2, {
      style: { glow: "cyan" },
      extra: { units: "°C", min: 0, max: 50, zabbix_key: "ipmi.sensor[Temp,Inlet Temp]" },
    }),
    w("timeseries", "Histórico Térmico", 6, 3, 6, 2, {
      extra: {
        units: "°C",
        multi_keys: [
          { key: "ipmi.sensor[Temp,CPU1 Temp]", alias: "CPU1" },
          { key: "ipmi.sensor[Temp,CPU2 Temp]", alias: "CPU2" },
          { key: "ipmi.sensor[Temp,Inlet Temp]", alias: "Inlet" },
        ],
        time_range: "1h",
      },
    }),

    /* ── FANS Section ── */
    w("label", "🌀 VENTILAÇÃO", 0, 4, 6, 1, { style: { glow: "cyan" } }),
    w("progress", "Fan1 — RPM", 0, 5, 3, 1, {
      extra: { units: "RPM", max_value: 18000, zabbix_key: "ipmi.sensor[Fan,Fan1 RPM]" },
    }),
    w("progress", "Fan2 — RPM", 3, 5, 3, 1, {
      extra: { units: "RPM", max_value: 18000, zabbix_key: "ipmi.sensor[Fan,Fan2 RPM]" },
    }),
    w("progress", "Fan3 — RPM", 0, 6, 3, 1, {
      extra: { units: "RPM", max_value: 18000, zabbix_key: "ipmi.sensor[Fan,Fan3 RPM]" },
    }),
    w("progress", "Fan4 — RPM", 3, 6, 3, 1, {
      extra: { units: "RPM", max_value: 18000, zabbix_key: "ipmi.sensor[Fan,Fan4 RPM]" },
    }),
    w("progress", "Fan5 — RPM", 0, 7, 3, 1, {
      extra: { units: "RPM", max_value: 18000, zabbix_key: "ipmi.sensor[Fan,Fan5 RPM]" },
    }),
    w("progress", "Fan6 — RPM", 3, 7, 3, 1, {
      extra: { units: "RPM", max_value: 18000, zabbix_key: "ipmi.sensor[Fan,Fan6 RPM]" },
    }),

    /* ── STORAGE Section ── */
    w("label", "💾 MATRIZ DE ARMAZENAMENTO", 6, 5, 6, 1, { style: { glow: "blue" } }),
    w("table", "Integridade dos Discos", 6, 6, 6, 3, {
      style: { icon: "HardDrive" },
      extra: {
        zabbix_discovery: "dell.server.disk.discovery",
        columns: [
          { header: "Disco", field: "{#DISK_NAME}" },
          { header: "Status", field: "dell.server.disk.status[{#DISK_NAME}]" },
          { header: "Tamanho", field: "dell.server.disk.size[{#DISK_NAME}]" },
          { header: "Modelo", field: "dell.server.disk.model[{#DISK_NAME}]" },
        ],
        color_map: {
          "OK": { color: "#39FF14", label: "OK" },
          "Critical": { color: "#FF4444", label: "CRÍTICO" },
          "Warning": { color: "#FFBF00", label: "ALERTA" },
          "Non-Critical": { color: "#FFBF00", label: "ALERTA" },
        },
      },
    }),

    /* ── NETWORK Section ── */
    w("label", "🌐 INTERFACES DE REDE", 0, 8, 12, 1, { style: { glow: "blue" } }),
    w("status", "NIC1 — Broadcom", 0, 9, 3, 1, {
      style: { icon: "Network", glow: "green" },
      extra: {
        zabbix_key: "dell.server.nic.status[NIC.Slot.1-1]",
        color_map: {
          "Up": { color: "#39FF14", label: "UP" },
          "Down": { color: "#FF4444", label: "DOWN" },
          "1": { color: "#39FF14", label: "UP" },
          "0": { color: "#FF4444", label: "DOWN" },
        },
      },
    }),
    w("status", "NIC2 — Broadcom", 3, 9, 3, 1, {
      style: { icon: "Network", glow: "green" },
      extra: {
        zabbix_key: "dell.server.nic.status[NIC.Slot.1-2]",
        color_map: {
          "Up": { color: "#39FF14", label: "UP" },
          "Down": { color: "#FF4444", label: "DOWN" },
          "1": { color: "#39FF14", label: "UP" },
          "0": { color: "#FF4444", label: "DOWN" },
        },
      },
    }),
    w("status", "NIC3 — Intel X710", 6, 9, 3, 1, {
      style: { icon: "Network", glow: "green" },
      extra: {
        zabbix_key: "dell.server.nic.status[NIC.Slot.2-1]",
        color_map: {
          "Up": { color: "#39FF14", label: "UP" },
          "Down": { color: "#FF4444", label: "DOWN" },
          "1": { color: "#39FF14", label: "UP" },
          "0": { color: "#FF4444", label: "DOWN" },
        },
      },
    }),
    w("status", "NIC4 — Intel X710", 9, 9, 3, 1, {
      style: { icon: "Network", glow: "green" },
      extra: {
        zabbix_key: "dell.server.nic.status[NIC.Slot.2-2]",
        color_map: {
          "Up": { color: "#39FF14", label: "UP" },
          "Down": { color: "#FF4444", label: "DOWN" },
          "1": { color: "#39FF14", label: "UP" },
          "0": { color: "#FF4444", label: "DOWN" },
        },
      },
    }),
    w("timeseries", "Tráfego NIC — Broadcom", 0, 10, 6, 2, {
      extra: {
        units: "bps",
        multi_keys: [
          { key: "net.if.in[{#IFNAME}]", alias: "IN" },
          { key: "net.if.out[{#IFNAME}]", alias: "OUT" },
        ],
        time_range: "1h",
      },
    }),
    w("timeseries", "Tráfego NIC — Intel X710", 6, 10, 6, 2, {
      extra: {
        units: "bps",
        multi_keys: [
          { key: "net.if.in[{#IFNAME}]", alias: "IN" },
          { key: "net.if.out[{#IFNAME}]", alias: "OUT" },
        ],
        time_range: "1h",
      },
    }),

    /* ── INVENTORY / FOOTER ── */
    w("label", "📋 INVENTÁRIO DO SERVIDOR", 0, 12, 12, 1),
    w("stat", "Modelo", 0, 13, 3, 1, {
      style: { icon: "Server", iconColor: "#A0A0A0" },
      extra: { zabbix_key: "system.hw.model", static: true },
    }),
    w("stat", "Service Tag", 3, 13, 3, 1, {
      style: { icon: "Tag", iconColor: "#A0A0A0" },
      extra: { zabbix_key: "system.hw.serialnumber", static: true },
    }),
    w("stat", "BIOS Version", 6, 13, 3, 1, {
      style: { icon: "Cpu", iconColor: "#A0A0A0" },
      extra: { zabbix_key: "system.sw.os[bios]", static: true },
    }),
    w("stat", "iDRAC Firmware", 9, 13, 3, 1, {
      style: { icon: "Monitor", iconColor: "#A0A0A0" },
      extra: { zabbix_key: "dell.server.idrac.firmware", static: true },
    }),
  ],
  settings: { cols: 12, rowHeight: 60, category: "servers" },
};

/* ── OLT Huawei GPON ── */
const PRESET_OLT_HUAWEI: DashboardPreset = {
  id: "network-olt-huawei",
  name: "OLT Huawei GPON",
  description: "Monitoramento de OLT Huawei: PONs (Tx Power, Laser, Temperatura), Fans, Slots e diagnóstico óptico.",
  category: "network",
  icon: "Radio",
  accent: "#E11D48",
  widgets: [
    // Row 0 — Status geral
    w("status", "Status OLT", 0, 0, 3, 1, {
      style: { icon: "Radio", glow: "green" },
      extra: { zabbix_key: "icmpping" },
    }),
    w("stat", "Uptime", 3, 0, 3, 1, {
      style: { icon: "Clock", iconColor: "#06B6D4" },
      extra: { zabbix_key: "system.uptime" },
    }),
    w("stat", "Hostname", 6, 0, 3, 1, {
      style: { icon: "Tag", iconColor: "#A0A0A0" },
      extra: { zabbix_key: "system.hostname", static: true },
    }),
    w("stat", "SysDescription", 9, 0, 3, 1, {
      style: { icon: "Info", iconColor: "#A0A0A0" },
      extra: { zabbix_key: "system.descr", static: true },
    }),

    // Row 1-2 — PON Tx Power & Laser (discovery-based, user binds after)
    w("gauge", "PON 1: Tx Power", 0, 1, 3, 2, {
      style: { glow: "cyan" },
      extra: { units: "dBm", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Tx Power" },
    }),
    w("gauge", "PON 2: Tx Power", 3, 1, 3, 2, {
      style: { glow: "cyan" },
      extra: { units: "dBm", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Tx Power" },
    }),
    w("gauge", "PON 3: Tx Power", 6, 1, 3, 2, {
      style: { glow: "cyan" },
      extra: { units: "dBm", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Tx Power" },
    }),
    w("gauge", "PON 4: Tx Power", 9, 1, 3, 2, {
      style: { glow: "cyan" },
      extra: { units: "dBm", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Tx Power" },
    }),

    // Row 3 — PON Temperatura
    w("stat", "PON 1: Temperatura", 0, 3, 3, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Temperatura" },
    }),
    w("stat", "PON 2: Temperatura", 3, 3, 3, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Temperatura" },
    }),
    w("stat", "PON 3: Temperatura", 6, 3, 3, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Temperatura" },
    }),
    w("stat", "PON 4: Temperatura", 9, 3, 3, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Temperatura" },
    }),

    // Row 4 — PON Voltagem & Bias
    w("stat", "PON 1: Voltagem", 0, 4, 3, 1, {
      style: { icon: "Zap", iconColor: "#FFBF00" },
      extra: { units: "V", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Voltagem" },
    }),
    w("stat", "PON 1: Bias", 3, 4, 3, 1, {
      style: { icon: "Activity", iconColor: "#8B5CF6" },
      extra: { units: "mA", zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Bias" },
    }),
    w("stat", "PON 1: Laser", 6, 4, 3, 1, {
      style: { icon: "Lightbulb", iconColor: "#06B6D4" },
      extra: { zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Laser" },
    }),
    w("stat", "PON 1: Tipo Gbic", 9, 4, 3, 1, {
      style: { icon: "Unplug", iconColor: "#A0A0A0" },
      extra: { zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Tipo" },
    }),

    // Row 5-6 — Timeseries PON
    w("timeseries", "Tx Power Histórico", 0, 5, 6, 2, {
      extra: { zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Tx Power" },
    }),
    w("timeseries", "Temperatura PON Histórico", 6, 5, 6, 2, {
      extra: { zabbix_discovery: "descoberta.pons.aux.bee", zabbix_tag: "PON Temperatura" },
    }),

    // Row 7 — Fans
    w("stat", "Fan 1: Status", 0, 7, 2, 1, {
      style: { icon: "Fan", iconColor: "#39FF14", glow: "green" },
      extra: { zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Status" },
    }),
    w("stat", "Fan 1: Temperatura", 2, 7, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Temperatura" },
    }),
    w("gauge", "Fan 1: Rotação", 4, 7, 2, 2, {
      style: { glow: "green" },
      extra: { units: "%", zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Rotacao" },
    }),
    w("stat", "Fan 2: Status", 6, 7, 2, 1, {
      style: { icon: "Fan", iconColor: "#39FF14", glow: "green" },
      extra: { zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Status" },
    }),
    w("stat", "Fan 2: Temperatura", 8, 7, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Temperatura" },
    }),
    w("gauge", "Fan 2: Rotação", 10, 7, 2, 2, {
      style: { glow: "green" },
      extra: { units: "%", zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Rotacao" },
    }),

    // Row 8 — Fan continuation
    w("stat", "Fan 3: Status", 0, 8, 2, 1, {
      style: { icon: "Fan", iconColor: "#39FF14" },
      extra: { zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Status" },
    }),
    w("stat", "Fan 3: Temperatura", 2, 8, 2, 1, {
      style: { icon: "Thermometer", iconColor: "#FF4444" },
      extra: { units: "°C", zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Temperatura" },
    }),

    // Row 9-10 — Slots
    w("stat", "Slot 0: Temperatura", 0, 9, 3, 1, {
      style: { icon: "Cpu", iconColor: "#F97316", glow: "amber" },
      extra: { units: "°C", zabbix_discovery: "descoberta.slots.aux.bee", zabbix_tag: "Temperatura Slots" },
    }),
    w("stat", "Slot 1: Temperatura", 3, 9, 3, 1, {
      style: { icon: "Cpu", iconColor: "#F97316" },
      extra: { units: "°C", zabbix_discovery: "descoberta.slots.aux.bee", zabbix_tag: "Temperatura Slots" },
    }),
    w("stat", "Slot 2: Temperatura", 6, 9, 3, 1, {
      style: { icon: "Cpu", iconColor: "#F97316" },
      extra: { units: "°C", zabbix_discovery: "descoberta.slots.aux.bee", zabbix_tag: "Temperatura Slots" },
    }),
    w("stat", "Slot 3: Temperatura", 9, 9, 3, 1, {
      style: { icon: "Cpu", iconColor: "#F97316" },
      extra: { units: "°C", zabbix_discovery: "descoberta.slots.aux.bee", zabbix_tag: "Temperatura Slots" },
    }),
    w("timeseries", "Temperatura Slots Histórico", 0, 10, 6, 2, {
      extra: { zabbix_discovery: "descoberta.slots.aux.bee", zabbix_tag: "Temperatura Slots" },
    }),
    w("timeseries", "Fan Rotação Histórico", 6, 10, 6, 2, {
      extra: { zabbix_discovery: "descoberta.fans.aux", zabbix_tag: "Fan Rotacao" },
    }),

    // Row 12 — Tabela resumo
    w("table", "Itens PON Detalhados", 0, 12, 12, 3, {
      style: { icon: "Radio" },
      extra: { zabbix_discovery: "descoberta.pons.aux.bee" },
    }),
  ],
  settings: { cols: 12, rowHeight: 60, category: "network" },
};

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  PRESET_IDRAC_T440,
  PRESET_OLT_HUAWEI,
  PRESET_NETWORK_CORE,
  PRESET_SERVERS,
  PRESET_LINUX,
  PRESET_SERVERS_MACRO,
  PRESET_DATACENTER,
  PRESET_ENERGY,
  PRESET_NOBREAK,
  PRESET_RETIFICADORAS,
  PRESET_WIFI,
  PRESET_FIREWALL,
  PRESET_FORTIGATE,
  PRESET_M365_SECURITY,
  PRESET_STARLINK,
  PRESET_VMWARE,
  PRESET_MYSQL,
  PRESET_LOGISTICS,
  PRESET_POP_PROTECT,
  PRESET_CAMERAS,
  PRESET_WEB_MONITORING,
  PRESET_WEB_APPS,
  PRESET_BACKUP,
  PRESET_LINKS,
  PRESET_IX_PEERING,
];
