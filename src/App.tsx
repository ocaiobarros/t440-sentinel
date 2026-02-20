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
                <ProtectedRoute>
                  <DashboardBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/builder/:dashboardId"
              element={
                <ProtectedRoute>
                  <DashboardBuilder />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/connections"
              element={
                <ProtectedRoute>
                  <ZabbixConnections />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings/rms-connections"
              element={
                <ProtectedRoute>
                  <RMSConnections />
                </ProtectedRoute>
              }
            />
            <Route
              path="/legacy"
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
              path="/admin"
              element={
                <ProtectedRoute>
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
