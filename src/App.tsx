import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Login from "./pages/Login";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import ZabbixConnections from "./pages/ZabbixConnections";
import RMSConnections from "./pages/RMSConnections";
import DashboardView from "./pages/DashboardView";
import DashboardBuilder from "./pages/DashboardBuilder";
import DashboardList from "./pages/DashboardList";
import NotFound from "./pages/NotFound";
import FleetIntelligence from "./pages/FleetIntelligence";
import AdminHub from "./pages/AdminHub";
import VirtualizationMonitor from "./pages/VirtualizationMonitor";
import VirtualMachinesMonitor from "./pages/VirtualMachinesMonitor";
import BgpFlowMonitor from "./pages/BgpFlowMonitor";
import FlowMapPage from "./pages/FlowMapPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <DashboardList />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/:dashboardId"
              element={
                <ProtectedRoute>
                  <DashboardView />
                </ProtectedRoute>
              }
            />
            <Route
              path="/builder"
              element={
                <ProtectedRoute roles={["admin", "editor"]}>
                  <DashboardBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/builder/:dashboardId"
              element={
                <ProtectedRoute roles={["admin", "editor"]}>
                  <DashboardBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/connections"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <ZabbixConnections />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/rms-connections"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <RMSConnections />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates/server-monitor"
              element={
                <ProtectedRoute>
                  <Index />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates/fleet-intelligence"
              element={
                <ProtectedRoute>
                  <FleetIntelligence />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates/virtualization-monitor"
              element={
                <ProtectedRoute>
                  <VirtualizationMonitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/templates/virtualmachines-monitor"
              element={
                <ProtectedRoute>
                  <VirtualMachinesMonitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/Flow/bgp-asn-flow-monitor"
              element={
                <ProtectedRoute>
                  <BgpFlowMonitor />
                </ProtectedRoute>
              }
            />
            <Route
              path="/flowmap/maps"
              element={
                <ProtectedRoute>
                  <FlowMapPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/flowmap/maps/:mapId"
              element={
                <ProtectedRoute>
                  <FlowMapPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminHub />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
