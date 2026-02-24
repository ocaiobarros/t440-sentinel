import { useLocation } from "react-router-dom";
import {
  Map, AlertTriangle, Wrench, Search, BarChart3,
  FileText, Clock, Settings, Users, Building2, Zap, ChevronRight,
  Server, Box, MonitorCheck, Fuel, Globe, LayoutDashboard,
  RefreshCw, Send, UserCog,
} from "lucide-react";
import { NavLink } from "@/components/NavLink";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import RoleGate from "@/components/auth/RoleGate";

const operationsItems = [
  { title: "FlowMap", url: "/app/operations/flowmap", icon: Map },
  { title: "Incidentes", url: "/app/operations/incidents", icon: AlertTriangle },
];

const engineeringItems = [
  { title: "Inventário", url: "/app/engineering/inventory", icon: Wrench },
  { title: "Viabilidade", url: "/app/engineering/viability", icon: Search },
  { title: "Capacidade", url: "/app/engineering/capacity", icon: BarChart3 },
];



const monitoringItems = [
  { title: "Dashboards", url: "/app/monitoring/dashboards", icon: LayoutDashboard },
  { title: "Server Monitor", url: "/app/monitoring/server", icon: Server },
  { title: "Virtualização", url: "/app/monitoring/virtualization", icon: Box },
  { title: "Máquinas Virtuais", url: "/app/monitoring/virtual-machines", icon: MonitorCheck },
  { title: "BGP Flow", url: "/app/monitoring/bgp", icon: Globe },
  { title: "Fleet Intelligence", url: "/app/monitoring/fleet", icon: Fuel },
];

const governanceItems = [
  { title: "SLA", url: "/app/governance/sla", icon: FileText },
  { title: "Time-Machine", url: "/app/governance/timeline", icon: Clock },
];

const settingsItems = [
  { title: "Perfil", url: "/app/settings/profile", icon: UserCog },
  { title: "Conectores Zabbix", url: "/app/settings/connections", icon: Settings },
  { title: "Conectores RMS", url: "/app/settings/rms-connections", icon: Zap },
  { title: "Telegram", url: "/app/settings/telegram", icon: Send },
  { title: "Usuários", url: "/app/settings/users", icon: Users },
  { title: "Tenants", url: "/app/settings/tenants", icon: Building2 },
];

const systemItems = [
  { title: "Status do Host", url: "/app/system/status", icon: Server },
  { title: "Atualizações", url: "/app/system/updates", icon: RefreshCw },
];

interface NavGroupProps {
  label: string;
  items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[];
  collapsed: boolean;
}

function NavGroup({ label, items, collapsed }: NavGroupProps) {
  const location = useLocation();
  const isGroupActive = items.some((i) => location.pathname.startsWith(i.url));

  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[9px] font-display uppercase tracking-[0.2em] text-muted-foreground/60 px-3">
        {!collapsed && label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild>
                <NavLink
                  to={item.url}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
                  activeClassName="bg-sidebar-accent text-primary font-medium"
                >
                  <item.icon className="w-3.5 h-3.5 shrink-0" />
                  {!collapsed && <span>{item.title}</span>}
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border sidebar-deep-space">
      <SidebarHeader className="p-3 border-b border-sidebar-border">
        <NavLink to="/app/operations/home" className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-primary shrink-0" />
          {!collapsed && (
            <span className="font-display text-sm font-bold tracking-wider text-primary">
              FLOWPULSE
            </span>
          )}
        </NavLink>
      </SidebarHeader>

      <SidebarContent className="py-2">
        <NavGroup label="Operações" items={operationsItems} collapsed={collapsed} />
        <NavGroup label="Monitoramento" items={monitoringItems} collapsed={collapsed} />
        <NavGroup label="Engenharia" items={engineeringItems} collapsed={collapsed} />
        <NavGroup label="Governança" items={governanceItems} collapsed={collapsed} />
        <RoleGate allowed={["admin"]}>
          <NavGroup label="Configurações" items={settingsItems} collapsed={collapsed} />
          <NavGroup label="Sistema" items={systemItems} collapsed={collapsed} />
        </RoleGate>
      </SidebarContent>
    </Sidebar>
  );
}
