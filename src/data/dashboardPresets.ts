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
  | "cameras";

export const PRESET_CATEGORIES: { key: PresetCategory; label: string; icon: string; color: string }[] = [
  { key: "network", label: "Network", icon: "Network", color: "#3B82F6" },
  { key: "servers", label: "Servidores", icon: "Server", color: "#39FF14" },
  { key: "datacenter", label: "Data Center", icon: "HardDrive", color: "#F97316" },
  { key: "energy", label: "Energia", icon: "Zap", color: "#FFBF00" },
  { key: "wifi", label: "Wi-Fi / APs", icon: "Wifi", color: "#06B6D4" },
  { key: "security", label: "Segurança", icon: "Shield", color: "#8B5CF6" },
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

export const DASHBOARD_PRESETS: DashboardPreset[] = [
  PRESET_NETWORK_CORE,
  PRESET_SERVERS,
  PRESET_SERVERS_MACRO,
  PRESET_DATACENTER,
  PRESET_ENERGY,
  PRESET_NOBREAK,
  PRESET_WIFI,
  PRESET_FIREWALL,
  PRESET_CAMERAS,
  PRESET_WEB_MONITORING,
  PRESET_WEB_APPS,
  PRESET_BACKUP,
  PRESET_LINKS,
  PRESET_IX_PEERING,
];
