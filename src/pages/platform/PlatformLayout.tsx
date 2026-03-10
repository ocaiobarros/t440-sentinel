import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { usePlatformAdmin } from "@/hooks/usePlatformAdmin";
import { Shield, ChevronLeft, Loader2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function PlatformLayout() {
  const { user, loading: authLoading } = useAuth();
  const { isPlatformAdmin, isLoading } = usePlatformAdmin();
  const navigate = useNavigate();
  const location = useLocation();

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
      </div>
    );
  }

  if (!user || !isPlatformAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto opacity-60" />
          <h1 className="text-2xl font-bold text-foreground font-[Orbitron]">Acesso Restrito</h1>
          <p className="text-muted-foreground">Apenas Platform Admins podem acessar esta área.</p>
          <Button variant="outline" onClick={() => navigate("/app/operations/home")}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  const isSubPage = location.pathname !== "/platform" && location.pathname.startsWith("/platform/");

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              if (isSubPage) {
                navigate("/platform");
              } else {
                navigate("/app/operations/home");
              }
            }}
          >
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-bold font-[Orbitron] tracking-wider text-foreground">PLATFORM HUB</h1>
              <p className="text-xs text-muted-foreground font-mono">FLOWPULSE — Administração Global</p>
            </div>
          </div>
          <Badge className="bg-primary/20 text-primary border-primary/30 text-xs font-mono">
            <Zap className="w-3 h-3 mr-1" /> PLATFORM ADMIN
          </Badge>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
