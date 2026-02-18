import { useState, useMemo } from "react";
import { Icon } from "@iconify/react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search } from "lucide-react";

/** Infrastructure-focused icon set for network/telecom dashboards */
const INFRA_ICONS = [
  // Network devices
  { id: "mdi:router-wireless", label: "Roteador Wireless", tags: ["router", "wireless", "wifi", "roteador"] },
  { id: "mdi:router-network", label: "Roteador de Borda", tags: ["router", "border", "borda", "roteador", "edge"] },
  { id: "mdi:switch", label: "Switch", tags: ["switch", "core", "lan"] },
  { id: "mdi:lan", label: "LAN", tags: ["lan", "rede", "network"] },
  { id: "mdi:ethernet", label: "Ethernet", tags: ["ethernet", "porta", "port"] },
  { id: "mdi:access-point", label: "Access Point", tags: ["ap", "access", "point", "wifi"] },
  { id: "mdi:firewall", label: "Firewall", tags: ["firewall", "security", "seguranca"] },
  { id: "mdi:vpn", label: "VPN", tags: ["vpn", "tunnel", "tunel"] },
  { id: "mdi:ip-network", label: "IP Network", tags: ["ip", "network", "rede"] },
  { id: "mdi:network-outline", label: "Network", tags: ["network", "rede", "topology"] },
  
  // Fiber/Telecom
  { id: "mdi:fiber-manual-record", label: "OLT", tags: ["olt", "fibra", "fiber", "gpon", "pon"] },
  { id: "mdi:circle-small", label: "ONU", tags: ["onu", "ont", "fibra", "fiber", "gpon"] },
  { id: "mdi:sine-wave", label: "DWDM", tags: ["dwdm", "wdm", "multiplex", "wave", "onda"] },
  { id: "mdi:transit-connection-variant", label: "Fibra Óptica", tags: ["fiber", "fibra", "optica", "cable"] },
  { id: "mdi:signal-variant", label: "Sinal RF", tags: ["signal", "rf", "radio", "antena", "antenna"] },
  
  // Vendors
  { id: "simple-icons:cisco", label: "Cisco", tags: ["cisco", "switch", "router"] },
  { id: "simple-icons:huawei", label: "Huawei", tags: ["huawei", "switch", "olt", "onu"] },
  { id: "simple-icons:mikrotik", label: "MikroTik", tags: ["mikrotik", "routeros", "rb", "ccr"] },
  { id: "simple-icons:dell", label: "Dell", tags: ["dell", "server", "servidor", "idrac", "poweredge"] },
  { id: "simple-icons:hp", label: "HP / HPE", tags: ["hp", "hpe", "proliant", "ilo", "server"] },
  { id: "simple-icons:ubiquiti", label: "Ubiquiti", tags: ["ubiquiti", "unifi", "edgemax", "uisp"] },
  { id: "simple-icons:vmware", label: "VMware", tags: ["vmware", "esxi", "vcenter", "virtual"] },
  { id: "mdi:server-network-outline", label: "Datacom", tags: ["datacom", "switch", "dm", "dgs", "dms", "olt", "telecom"] },
  
  // Servers
  { id: "mdi:server", label: "Servidor", tags: ["server", "servidor", "host", "bare", "metal"] },
  { id: "mdi:server-network", label: "Server Network", tags: ["server", "rack", "network"] },
  { id: "mdi:server-security", label: "Server Security", tags: ["server", "lock", "security"] },
  { id: "mdi:database", label: "Database", tags: ["database", "db", "banco", "dados", "sql"] },
  { id: "mdi:nas", label: "NAS / Storage", tags: ["nas", "storage", "disco", "disk", "san"] },
  { id: "mdi:harddisk", label: "Disco", tags: ["disk", "disco", "hdd", "ssd", "storage"] },
  
  // Status/Monitoring
  { id: "mdi:monitor-dashboard", label: "Dashboard", tags: ["dashboard", "monitor", "tela"] },
  { id: "mdi:speedometer", label: "Velocímetro", tags: ["speed", "gauge", "velocidade", "taxa"] },
  { id: "mdi:thermometer", label: "Temperatura", tags: ["temp", "temperatura", "thermometer", "calor"] },
  { id: "mdi:fan", label: "Ventoinha", tags: ["fan", "ventoinha", "cooler", "cooling"] },
  { id: "mdi:lightning-bolt", label: "Energia", tags: ["power", "energia", "ups", "pdu", "watt"] },
  { id: "mdi:memory", label: "Memória", tags: ["memory", "ram", "memoria"] },
  { id: "mdi:chip", label: "CPU", tags: ["cpu", "chip", "processador", "processor"] },
  { id: "mdi:cloud", label: "Cloud", tags: ["cloud", "nuvem", "aws", "azure", "gcp"] },
  { id: "mdi:antenna", label: "Antena", tags: ["antenna", "antena", "torre", "tower", "radio"] },
  { id: "mdi:satellite-variant", label: "Satélite", tags: ["satellite", "satelite", "vsat"] },
  { id: "mdi:cellphone-wireless", label: "Celular", tags: ["mobile", "celular", "4g", "5g", "lte"] },
  { id: "mdi:phone-voip", label: "VoIP", tags: ["voip", "phone", "telefone", "sip"] },
  { id: "mdi:security", label: "Segurança", tags: ["security", "seguranca", "lock", "cadeado"] },
  { id: "mdi:alert-circle", label: "Alerta", tags: ["alert", "alerta", "warning", "aviso"] },
  { id: "mdi:check-circle", label: "OK", tags: ["ok", "check", "online", "up"] },
  { id: "mdi:close-circle", label: "Erro", tags: ["error", "erro", "fail", "down", "offline"] },
  { id: "mdi:eye", label: "Monitoramento", tags: ["monitor", "watch", "observar", "monitoramento"] },
  { id: "mdi:cctv", label: "Câmera", tags: ["camera", "cctv", "dvr", "nvr", "video"] },
  { id: "mdi:printer", label: "Impressora", tags: ["printer", "impressora", "print"] },
  { id: "mdi:desk-lamp", label: "UPS", tags: ["ups", "nobreak", "battery", "bateria"] },
];

interface InfraIconBrowserProps {
  selectedIcon?: string;
  onSelect: (iconId: string) => void;
}

export default function InfraIconBrowser({ selectedIcon, onSelect }: InfraIconBrowserProps) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    if (!search.trim()) return INFRA_ICONS;
    const q = search.toLowerCase();
    return INFRA_ICONS.filter(
      (icon) =>
        icon.label.toLowerCase().includes(q) ||
        icon.tags.some((t) => t.includes(q))
    );
  }, [search]);

  return (
    <div className="space-y-2">
      <Label className="text-[10px] text-muted-foreground">Ícones de Infraestrutura</Label>
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="cisco, huawei, olt, switch..."
          className="h-7 text-xs pl-7"
        />
      </div>
      <ScrollArea className="h-[180px]">
        <div className="grid grid-cols-5 gap-1 p-0.5">
          {filtered.map((icon) => (
            <button
              key={icon.id}
              onClick={() => onSelect(icon.id)}
              className={`p-1.5 rounded flex flex-col items-center gap-0.5 transition-all ${
                selectedIcon === icon.id
                  ? "bg-neon-green/20 border border-neon-green/50"
                  : "hover:bg-accent/50 border border-transparent"
              }`}
              title={icon.label}
            >
              <Icon icon={icon.id} className="w-5 h-5" />
              <span className="text-[7px] text-muted-foreground truncate w-full text-center leading-tight">
                {icon.label}
              </span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-5 text-[9px] text-muted-foreground text-center py-4">
              Nenhum ícone encontrado
            </p>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
