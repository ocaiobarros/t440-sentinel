import { useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Map, AlertTriangle, Wrench, Search, BarChart3,
  FileText, Clock, Settings, Users, Building2, Zap, ChevronRight,
  Server, Box, MonitorCheck, Fuel, Globe, LayoutDashboard,
  RefreshCw, Send, UserCog, BookOpen, HelpCircle, Home, ExternalLink, Eye,
  Printer,
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
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import RoleGate from "@/components/auth/RoleGate";
import SupportModal from "@/components/layout/SupportModal";

function useSidebarItems() {
  const { t } = useTranslation();

  const operationsItems = [
    { title: t("sidebar.home"), url: "/app/operations/home", icon: Home },
    { title: t("sidebar.flowmap"), url: "/app/operations/flowmap", icon: Map },
    { title: t("sidebar.incidents"), url: "/app/operations/incidents", icon: AlertTriangle },
  ];

  const monitoringItems = [
    { title: t("sidebar.dashboards"), url: "/app/monitoring/dashboards", icon: LayoutDashboard },
    { title: t("sidebar.serverMonitor"), url: "/app/monitoring/server", icon: Server },
    { title: t("sidebar.virtualization"), url: "/app/monitoring/virtualization", icon: Box },
    { title: t("sidebar.virtualMachines"), url: "/app/monitoring/virtual-machines", icon: MonitorCheck },
    { title: t("sidebar.bgpFlow"), url: "/app/monitoring/bgp", icon: Globe },
    { title: t("sidebar.fleetIntelligence"), url: "/app/monitoring/fleet", icon: Fuel },
    { title: t("sidebar.printers"), url: "/app/monitoring/printers", icon: Printer },
  ];

  const engineeringItems = [
    { title: t("sidebar.inventory"), url: "/app/engineering/inventory", icon: Wrench },
    { title: t("sidebar.viability"), url: "/app/engineering/viability", icon: Search },
    { title: t("sidebar.capacity"), url: "/app/engineering/capacity", icon: BarChart3 },
  ];

  const governanceItems = [
    { title: t("sidebar.sla"), url: "/app/governance/sla", icon: FileText },
    { title: t("sidebar.timeMachine"), url: "/app/governance/timeline", icon: Clock },
  ];

  const settingsItems = [
    { title: t("sidebar.profile"), url: "/app/settings/profile", icon: UserCog },
    { title: t("sidebar.zabbixConnectors"), url: "/app/settings/connections", icon: Settings },
    { title: t("sidebar.rmsConnectors"), url: "/app/settings/rms-connections", icon: Zap },
    { title: t("sidebar.telegram"), url: "/app/settings/telegram", icon: Send },
    { title: t("sidebar.users"), url: "/app/settings/users", icon: Users },
    { title: t("sidebar.tenants"), url: "/app/settings/tenants", icon: Building2 },
  ];

  const systemItems = [
    { title: t("sidebar.hostStatus"), url: "/app/system/status", icon: Server },
    { title: t("sidebar.updates"), url: "/app/system/updates", icon: RefreshCw },
  ];

  return { operationsItems, engineeringItems, monitoringItems, governanceItems, settingsItems, systemItems };
}

interface NavGroupProps {
  label: string;
  items: { title: string; url: string; icon: React.ComponentType<{ className?: string }> }[];
  collapsed: boolean;
}

function NavGroup({ label, items, collapsed }: NavGroupProps) {
  return (
    <SidebarGroup>
      <SidebarGroupLabel className="text-[9px] font-display uppercase tracking-[0.2em] text-muted-foreground/60 px-3">
        {!collapsed && label}
      </SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <ContextMenu>
                <ContextMenuTrigger asChild>
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
                </ContextMenuTrigger>
                <ContextMenuContent className="w-52 bg-card/95 backdrop-blur-xl border-border/50">
                  <ContextMenuItem
                    onClick={() => window.open(item.url, "_blank")}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir em Nova Aba
                  </ContextMenuItem>
                  <ContextMenuItem
                    onClick={() => window.open(`${item.url}?kiosk=true`, "_blank")}
                    className="gap-2 text-xs cursor-pointer"
                  >
                    <Eye className="w-3.5 h-3.5" /> Abrir em Modo Kiosk
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

export function AppSidebar() {
  const { state } = useSidebar();
  const { t } = useTranslation();
  const collapsed = state === "collapsed";
  const { operationsItems, monitoringItems, engineeringItems, governanceItems, settingsItems, systemItems } = useSidebarItems();
  const [supportOpen, setSupportOpen] = useState(false);

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
        <NavGroup label={t("sidebar.operations")} items={operationsItems} collapsed={collapsed} />
        <NavGroup label={t("sidebar.monitoring")} items={monitoringItems} collapsed={collapsed} />
        <NavGroup label={t("sidebar.engineering")} items={engineeringItems} collapsed={collapsed} />
        <NavGroup label={t("sidebar.governance")} items={governanceItems} collapsed={collapsed} />

        {/* Support button */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild>
                  <button
                    onClick={() => setSupportOpen(true)}
                    className="flex items-center gap-2.5 px-3 py-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors w-full"
                  >
                    <HelpCircle className="w-3.5 h-3.5 shrink-0" />
                    {!collapsed && <span>{t("sidebar.support")}</span>}
                  </button>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <RoleGate allowed={["admin"]}>
          <NavGroup label={t("sidebar.settings")} items={settingsItems} collapsed={collapsed} />
          <NavGroup label={t("sidebar.system")} items={systemItems} collapsed={collapsed} />
        </RoleGate>
      </SidebarContent>

      <SupportModal open={supportOpen} onOpenChange={setSupportOpen} />
    </Sidebar>
  );
}
