import type { ReactNode } from "react";
import { useUserRole, type AppRole } from "@/hooks/useUserRole";

interface RoleGateProps {
  /** Roles allowed to see this content */
  allowed: AppRole[];
  /** Content shown when user lacks the role (defaults to nothing) */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Conditionally renders children based on user role.
 * Super admins always pass.
 */
export default function RoleGate({ allowed, fallback = null, children }: RoleGateProps) {
  const { hasRole, isLoading } = useUserRole();

  if (isLoading) return null;
  if (!hasRole(...allowed)) return <>{fallback}</>;
  return <>{children}</>;
}
