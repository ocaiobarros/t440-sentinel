import { useLocation } from "react-router-dom";
import {
  Home, Map, AlertTriangle, Wrench, Search, BarChart3,
  FileText, Clock, Settings, Users, Building2, Zap, ChevronRight,
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
  { title: "Home", url: "/app/operations/home", icon: Home },
  { title: "FlowMap", url: "/app/operations/flowmap", icon: Map },
  { title: "Incidentes", url: "/app/operations/incidents", icon: AlertTriangle },
];

const engineeringItems = [
  { title: "Inventário", url: "/app/engineering/inventory", icon: Wrench },
  { title: "Viabilidade", url: "/app/engineering/viability", icon: Search },
  { title: "Capacidade", url: "/app/engineering/capacity", icon: BarChart3 },
];

const governanceItems = [
  { title: "SLA", url: "/app/governance/sla", icon: FileText },
  { title: "Time-Machine", url: "/app/governance/timeline", icon: Clock },
];

const settingsItems = [
  { title: "Conectores", url: "/app/settings/connections", icon: Settings },
  { title: "Usuários", url: "/app/settings/users", icon: Users },
  { title: "Tenants", url: "/app/settings/tenants", icon: Building2 },
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
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
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
        <NavGroup label="Engenharia" items={engineeringItems} collapsed={collapsed} />
        <NavGroup label="Governança" items={governanceItems} collapsed={collapsed} />
        <RoleGate allowed={["admin"]}>
          <NavGroup label="Configurações" items={settingsItems} collapsed={collapsed} />
        </RoleGate>
      </SidebarContent>
    </Sidebar>
  );
}
