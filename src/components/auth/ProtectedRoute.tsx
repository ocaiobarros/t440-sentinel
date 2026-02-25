import { Navigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";
import { Loader2, ShieldAlert } from "lucide-react";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** If set, only these roles (+ super_admin) can access */
  roles?: AppRole[];
}

function ProtectedRoute({ children, roles }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const { hasRole, isLoading: roleLoading } = useUserRole();

  if (loading || (user && roleLoading)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !hasRole(...roles)) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4">
        <ShieldAlert className="w-12 h-12 text-destructive" />
        <h2 className="text-lg font-semibold text-foreground">Acesso Negado</h2>
        <p className="text-sm text-muted-foreground">Seu perfil não tem permissão para acessar esta página.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default ProtectedRoute;
