import { Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { TenantFilterProvider } from "@/hooks/useTenantFilter";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import AppLayout from "@/components/layout/AppLayout";
import ErrorBoundary from "@/components/ErrorBoundary";
import ChunkLoadRecovery from "@/components/ChunkLoadRecovery";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import { Loader2 } from "lucide-react";
import { lazyRetry } from "@/lib/lazyRetry";

/* ── Lazy-loaded pages with automatic chunk retry ── */
const DashboardView = lazyRetry(() => import("./pages/DashboardView"));
const DashboardBuilder = lazyRetry(() => import("./pages/DashboardBuilder"));
const ZabbixConnections = lazyRetry(() => import("./pages/ZabbixConnections"));
const RMSConnections = lazyRetry(() => import("./pages/RMSConnections"));
const Index = lazyRetry(() => import("./pages/Index"));
const FleetIntelligence = lazyRetry(() => import("./pages/FleetIntelligence"));
const AdminLayout = lazyRetry(() => import("./pages/admin/AdminContext"));
const AdminLanding = lazyRetry(() => import("./pages/admin/AdminLanding"));
const AdminAccessLanding = lazyRetry(() => import("./pages/admin/AdminAccessLanding"));
const AdminUsersPage = lazyRetry(() => import("./pages/admin/AdminUsersPage"));
const AdminTeamsPage = lazyRetry(() => import("./pages/admin/AdminTeamsPage"));
const AdminOrgsPage = lazyRetry(() => import("./pages/admin/AdminOrgsPage"));
const AdminConnectionsPage = lazyRetry(() => import("./pages/admin/AdminConnectionsPage"));
const AdminTelemetryPage = lazyRetry(() => import("./pages/admin/AdminTelemetryPage"));
const AdminOpsPage = lazyRetry(() => import("./pages/admin/AdminOpsPage"));
const AdminDiagPage = lazyRetry(() => import("./pages/admin/AdminDiagPage"));
const VirtualizationMonitor = lazyRetry(() => import("./pages/VirtualizationMonitor"));
const VirtualMachinesMonitor = lazyRetry(() => import("./pages/VirtualMachinesMonitor"));
const BgpFlowMonitor = lazyRetry(() => import("./pages/BgpFlowMonitor"));
const FlowMapPage = lazyRetry(() => import("./pages/FlowMapPage"));
const OperationsHome = lazyRetry(() => import("./pages/OperationsHome"));
const InventoryPage = lazyRetry(() => import("./pages/InventoryPage"));
const CapacityPage = lazyRetry(() => import("./pages/CapacityPage"));
const TimelinePage = lazyRetry(() => import("./pages/TimelinePage"));

const SLAGovernance = lazyRetry(() => import("./pages/SLAGovernance"));
const ViabilityPage = lazyRetry(() => import("./pages/ViabilityPage"));
const SystemUpdates = lazyRetry(() => import("./pages/SystemUpdates"));
const SystemStatus = lazyRetry(() => import("./pages/SystemStatus"));
const TelegramSettings = lazyRetry(() => import("./pages/TelegramSettings"));
const IncidentsPage = lazyRetry(() => import("./pages/IncidentsPage"));
const ServerMonitorList = lazyRetry(() => import("./pages/monitoring/ServerMonitorList"));
const VirtualizationList = lazyRetry(() => import("./pages/monitoring/VirtualizationList"));
const VirtualMachinesList = lazyRetry(() => import("./pages/monitoring/VirtualMachinesList"));
const BgpFlowList = lazyRetry(() => import("./pages/monitoring/BgpFlowList"));
const FleetIntelligenceList = lazyRetry(() => import("./pages/monitoring/FleetIntelligenceList"));
const DashboardsList = lazyRetry(() => import("./pages/monitoring/DashboardsList"));
const PrinterList = lazyRetry(() => import("./pages/monitoring/PrinterList"));
const PrinterIntelligence = lazyRetry(() => import("./pages/PrinterIntelligence"));
const FlowDisponibilityList = lazyRetry(() => import("./pages/monitoring/FlowDisponibilityList"));
const FlowDisponibility = lazyRetry(() => import("./pages/FlowDisponibility"));
const FlowDisponibilityView = lazyRetry(() => import("./pages/FlowDisponibilityView"));
const BillingHistory = lazyRetry(() => import("./pages/BillingHistory"));
const FlowFinance = lazyRetry(() => import("./pages/FlowFinance"));
const UserSettings = lazyRetry(() => import("./pages/UserSettings"));
const DocsPage = lazyRetry(() => import("./pages/DocsPage"));

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
          <TenantFilterProvider>
          <ChunkLoadRecovery />
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
                      <ErrorBoundary>
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
                          <Route path="monitoring/flowdisp" element={<FlowDisponibilityList />} />
                          <Route path="monitoring/flowdisp/new" element={<FlowDisponibility />} />
                          <Route path="monitoring/flowdisp/:dashboardId/edit" element={<FlowDisponibility />} />
                          <Route path="monitoring/flowdisp/:dashboardId" element={<FlowDisponibilityView />} />

                          {/* Finance */}
                          <Route path="finance" element={<FlowFinance />} />

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
                          <Route path="settings/admin" element={
                            <ProtectedRoute roles={["admin"]}><AdminLayout /></ProtectedRoute>
                          }>
                            <Route index element={<AdminLanding />} />
                            <Route path="access" element={<AdminAccessLanding />} />
                            <Route path="users" element={<AdminUsersPage />} />
                            <Route path="teams" element={<AdminTeamsPage />} />
                            <Route path="orgs" element={<AdminOrgsPage />} />
                            <Route path="connections" element={<AdminConnectionsPage />} />
                            <Route path="telemetry" element={<AdminTelemetryPage />} />
                            <Route path="ops" element={<AdminOpsPage />} />
                            <Route path="diagnostics" element={<AdminDiagPage />} />
                          </Route>
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
                      </ErrorBoundary>
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
                <ProtectedRoute roles={["admin", "editor"]}><Suspense fallback={<LazyFallback />}><ErrorBoundary fallbackTitle="Erro no Builder"><DashboardBuilder /></ErrorBoundary></Suspense></ProtectedRoute>
              } />
              <Route path="/builder/:dashboardId" element={
                <ProtectedRoute roles={["admin", "editor"]}><Suspense fallback={<LazyFallback />}><ErrorBoundary fallbackTitle="Erro no Builder"><DashboardBuilder /></ErrorBoundary></Suspense></ProtectedRoute>
              } />

              {/* ── Legacy redirects ── */}
              <Route path="/flowmap/maps" element={<Navigate to="/app/operations/flowmap" replace />} />
              <Route path="/flowmap/maps/:mapId" element={<LegacyFlowmapRedirect />} />
              <Route path="/settings/connections" element={<Navigate to="/app/settings/connections" replace />} />
              <Route path="/settings/rms-connections" element={<Navigate to="/app/settings/rms-connections" replace />} />
              <Route path="/admin" element={<Navigate to="/app/settings/admin" replace />} />
              <Route path="/app/settings/users" element={<Navigate to="/app/settings/admin" replace />} />

              {/* ── Legacy template redirects ── */}
              <Route path="/templates/server-monitor" element={<Navigate to="/app/monitoring/server" replace />} />
              <Route path="/templates/fleet-intelligence" element={<Navigate to="/app/monitoring/fleet" replace />} />
              <Route path="/templates/virtualization-monitor" element={<Navigate to="/app/monitoring/virtualization" replace />} />
              <Route path="/templates/virtualmachines-monitor" element={<Navigate to="/app/monitoring/virtual-machines" replace />} />
              <Route path="/Flow/bgp-asn-flow-monitor" element={<Navigate to="/app/monitoring/bgp" replace />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </TenantFilterProvider>
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
