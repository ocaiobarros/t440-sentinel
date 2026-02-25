import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";

// Lazy-ish imports (kept synchronous for simplicity)
import DashboardList from "./pages/DashboardList";
import DashboardView from "./pages/DashboardView";
import DashboardBuilder from "./pages/DashboardBuilder";
import ZabbixConnections from "./pages/ZabbixConnections";
import RMSConnections from "./pages/RMSConnections";
import Index from "./pages/Index";
import FleetIntelligence from "./pages/FleetIntelligence";
import AdminHub from "./pages/AdminHub";
import VirtualizationMonitor from "./pages/VirtualizationMonitor";
import VirtualMachinesMonitor from "./pages/VirtualMachinesMonitor";
import BgpFlowMonitor from "./pages/BgpFlowMonitor";
import FlowMapPage from "./pages/FlowMapPage";
import StubPage from "./pages/stubs/StubPage";
import OperationsHome from "./pages/OperationsHome";
import InventoryPage from "./pages/InventoryPage";
import CapacityPage from "./pages/CapacityPage";
import TimelinePage from "./pages/TimelinePage";
import TenantsPage from "./pages/TenantsPage";
import SLAGovernance from "./pages/SLAGovernance";
import ViabilityPage from "./pages/ViabilityPage";
import SystemUpdates from "./pages/SystemUpdates";
import SystemStatus from "./pages/SystemStatus";
import TelegramSettings from "./pages/TelegramSettings";
import IncidentsPage from "./pages/IncidentsPage";
import ServerMonitorList from "./pages/monitoring/ServerMonitorList";
import VirtualizationList from "./pages/monitoring/VirtualizationList";
import VirtualMachinesList from "./pages/monitoring/VirtualMachinesList";
import BgpFlowList from "./pages/monitoring/BgpFlowList";
import FleetIntelligenceList from "./pages/monitoring/FleetIntelligenceList";
import DashboardsList from "./pages/monitoring/DashboardsList";
import UserSettings from "./pages/UserSettings";
import DocsPage from "./pages/DocsPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* ── Auth (no layout) ── */}
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* ── Root redirect ── */}
            <Route path="/" element={<Navigate to="/app/operations/home" replace />} />

            {/* ── Enterprise layout ── */}
            <Route
              path="/app/*"
              element={
                <ProtectedRoute>
                  <AppLayout>
                    <Routes>
                      {/* Operations */}
                      <Route path="operations/home" element={<OperationsHome />} />
                      <Route path="operations/flowmap" element={<FlowMapPage />} />
                      {/* flowmap/:mapId renders outside layout — see below */}
                      <Route path="operations/incidents" element={<IncidentsPage />} />

                      {/* Engineering */}
                      <Route path="engineering/inventory" element={<InventoryPage />} />
                      <Route path="engineering/viability" element={<ViabilityPage />} />
                      <Route path="engineering/capacity" element={<CapacityPage />} />

                      {/* Monitoring */}
                      <Route path="monitoring/dashboards" element={<DashboardsList />} />
                      <Route path="monitoring/server" element={<ServerMonitorList />} />
                      <Route path="monitoring/server/new" element={<Index />} />
                      <Route path="monitoring/server/:dashboardId" element={<Index />} />
                      <Route path="monitoring/virtualization" element={<VirtualizationList />} />
                      <Route path="monitoring/virtualization/new" element={<VirtualizationMonitor />} />
                      <Route path="monitoring/virtualization/:dashboardId" element={<VirtualizationMonitor />} />
                      <Route path="monitoring/virtual-machines" element={<VirtualMachinesList />} />
                      <Route path="monitoring/virtual-machines/new" element={<VirtualMachinesMonitor />} />
                      <Route path="monitoring/virtual-machines/:dashboardId" element={<VirtualMachinesMonitor />} />
                      <Route path="monitoring/bgp" element={<BgpFlowList />} />
                      <Route path="monitoring/bgp/new" element={<BgpFlowMonitor />} />
                      <Route path="monitoring/bgp/:dashboardId" element={<BgpFlowMonitor />} />
                      <Route path="monitoring/fleet" element={<FleetIntelligenceList />} />
                      <Route path="monitoring/fleet/new" element={<FleetIntelligence />} />
                      <Route path="monitoring/fleet/:dashboardId" element={<FleetIntelligence />} />

                      {/* Governance */}
                      <Route path="governance/sla" element={<SLAGovernance />} />
                      <Route path="governance/timeline" element={<TimelinePage />} />

                      {/* Docs */}
                      <Route path="docs" element={<DocsPage />} />

                      {/* Settings */}
                      <Route path="settings/connections" element={
                        <ProtectedRoute roles={["admin"]}><ZabbixConnections /></ProtectedRoute>
                      } />
                      <Route path="settings/rms-connections" element={
                        <ProtectedRoute roles={["admin"]}><RMSConnections /></ProtectedRoute>
                      } />
                      <Route path="settings/users" element={
                        <ProtectedRoute roles={["admin"]}><AdminHub /></ProtectedRoute>
                      } />
                      <Route path="settings/tenants" element={
                        <ProtectedRoute roles={["admin"]}><TenantsPage /></ProtectedRoute>
                      } />
                      <Route path="settings/profile" element={<UserSettings />} />
                      <Route path="settings/telegram" element={
                        <ProtectedRoute roles={["admin"]}><TelegramSettings /></ProtectedRoute>
                      } />

                      {/* System */}
                      <Route path="system/updates" element={
                        <ProtectedRoute roles={["admin"]}><SystemUpdates /></ProtectedRoute>
                      } />
                      <Route path="system/status" element={
                        <ProtectedRoute roles={["admin"]}><SystemStatus /></ProtectedRoute>
                      } />

                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </AppLayout>
                </ProtectedRoute>
              }
            />

            {/* ── Full-screen routes (outside sidebar) ── */}
            <Route path="/app/operations/flowmap/:mapId" element={
              <ProtectedRoute><FlowMapPage /></ProtectedRoute>
            } />
            <Route path="/dashboard/:dashboardId" element={
              <ProtectedRoute><DashboardView /></ProtectedRoute>
            } />
            <Route path="/builder" element={
              <ProtectedRoute roles={["admin", "editor"]}><DashboardBuilder /></ProtectedRoute>
            } />
            <Route path="/builder/:dashboardId" element={
              <ProtectedRoute roles={["admin", "editor"]}><DashboardBuilder /></ProtectedRoute>
            } />

            {/* ── Legacy redirects ── */}
            <Route path="/flowmap/maps" element={<Navigate to="/app/operations/flowmap" replace />} />
            <Route path="/flowmap/maps/:mapId" element={<LegacyFlowmapRedirect />} />
            <Route path="/settings/connections" element={<Navigate to="/app/settings/connections" replace />} />
            <Route path="/settings/rms-connections" element={<Navigate to="/app/settings/rms-connections" replace />} />
            <Route path="/admin" element={<Navigate to="/app/settings/users" replace />} />

            {/* ── Legacy template redirects ── */}
            <Route path="/templates/server-monitor" element={<Navigate to="/app/monitoring/server" replace />} />
            <Route path="/templates/fleet-intelligence" element={<Navigate to="/app/monitoring/fleet" replace />} />
            <Route path="/templates/virtualization-monitor" element={<Navigate to="/app/monitoring/virtualization" replace />} />
            <Route path="/templates/virtualmachines-monitor" element={<Navigate to="/app/monitoring/virtual-machines" replace />} />
            <Route path="/Flow/bgp-asn-flow-monitor" element={<Navigate to="/app/monitoring/bgp" replace />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

/** Redirect /flowmap/maps/:mapId → /app/operations/flowmap/:mapId */
function LegacyFlowmapRedirect() {
  const path = window.location.pathname;
  const mapId = path.split("/").pop();
  return <Navigate to={`/app/operations/flowmap/${mapId}`} replace />;
}

export default App;
