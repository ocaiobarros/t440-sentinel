import { lazy, Suspense } from "react";
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
import { Loader2 } from "lucide-react";

/* ── Lazy-loaded pages for code splitting ── */
const DashboardView = lazy(() => import("./pages/DashboardView"));
const DashboardBuilder = lazy(() => import("./pages/DashboardBuilder"));
const ZabbixConnections = lazy(() => import("./pages/ZabbixConnections"));
const RMSConnections = lazy(() => import("./pages/RMSConnections"));
const Index = lazy(() => import("./pages/Index"));
const FleetIntelligence = lazy(() => import("./pages/FleetIntelligence"));
const AdminHub = lazy(() => import("./pages/AdminHub"));
const VirtualizationMonitor = lazy(() => import("./pages/VirtualizationMonitor"));
const VirtualMachinesMonitor = lazy(() => import("./pages/VirtualMachinesMonitor"));
const BgpFlowMonitor = lazy(() => import("./pages/BgpFlowMonitor"));
const FlowMapPage = lazy(() => import("./pages/FlowMapPage"));
const OperationsHome = lazy(() => import("./pages/OperationsHome"));
const InventoryPage = lazy(() => import("./pages/InventoryPage"));
const CapacityPage = lazy(() => import("./pages/CapacityPage"));
const TimelinePage = lazy(() => import("./pages/TimelinePage"));
const TenantsPage = lazy(() => import("./pages/TenantsPage"));
const SLAGovernance = lazy(() => import("./pages/SLAGovernance"));
const ViabilityPage = lazy(() => import("./pages/ViabilityPage"));
const SystemUpdates = lazy(() => import("./pages/SystemUpdates"));
const SystemStatus = lazy(() => import("./pages/SystemStatus"));
const TelegramSettings = lazy(() => import("./pages/TelegramSettings"));
const IncidentsPage = lazy(() => import("./pages/IncidentsPage"));
const ServerMonitorList = lazy(() => import("./pages/monitoring/ServerMonitorList"));
const VirtualizationList = lazy(() => import("./pages/monitoring/VirtualizationList"));
const VirtualMachinesList = lazy(() => import("./pages/monitoring/VirtualMachinesList"));
const BgpFlowList = lazy(() => import("./pages/monitoring/BgpFlowList"));
const FleetIntelligenceList = lazy(() => import("./pages/monitoring/FleetIntelligenceList"));
const DashboardsList = lazy(() => import("./pages/monitoring/DashboardsList"));
const PrinterList = lazy(() => import("./pages/monitoring/PrinterList"));
const PrinterIntelligence = lazy(() => import("./pages/PrinterIntelligence"));
const BillingHistory = lazy(() => import("./pages/BillingHistory"));
const UserSettings = lazy(() => import("./pages/UserSettings"));
const DocsPage = lazy(() => import("./pages/DocsPage"));

const queryClient = new QueryClient();

function LazyFallback() {
  return (
    <div className="min-h-[200px] flex items-center justify-center">
      <Loader2 className="w-6 h-6 text-primary animate-spin" />
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Suspense fallback={<LazyFallback />}>
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
                      <Suspense fallback={<LazyFallback />}>
                        <Routes>
                          {/* Operations */}
                          <Route path="operations/home" element={<OperationsHome />} />
                          <Route path="operations/flowmap" element={<FlowMapPage />} />
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
                          <Route path="monitoring/printers" element={<PrinterList />} />
                          <Route path="monitoring/printers/new" element={<PrinterIntelligence />} />
                          <Route path="monitoring/printers/:dashboardId" element={<PrinterIntelligence />} />
                          <Route path="monitoring/printers/billing" element={<BillingHistory />} />

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
                      </Suspense>
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
          </Suspense>
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
