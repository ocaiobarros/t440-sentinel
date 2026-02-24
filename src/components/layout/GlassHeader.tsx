import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  User, LogOut, Palette, Monitor, Lock, HelpCircle,
  BookOpen, MessageCircle, Users, Info, Search, Command, X,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface GlassHeaderProps {
  isKiosk: boolean;
  onToggleKiosk: () => void;
}

export default function GlassHeader({ isKiosk, onToggleKiosk }: GlassHeaderProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const displayName = user?.user_metadata?.display_name
    || user?.email?.split("@")[0]
    || "Operador";
  const initials = displayName.slice(0, 2).toUpperCase();

  // Ctrl+K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      if (e.key === "Escape") setSearchOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut();
    navigate("/login");
  }, [signOut, navigate]);

  if (isKiosk) return null;

  return (
    <>
      <header className="h-11 flex items-center justify-between border-b border-border/20
        bg-background/60 backdrop-blur-md px-3 shrink-0 z-30 relative">
        {/* Left: sidebar trigger */}
        <div className="flex items-center gap-2">
          <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground" />
        </div>

        {/* Center: search bar */}
        <button
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg
            bg-muted/30 border border-border/30 text-xs text-muted-foreground
            hover:bg-muted/50 hover:border-border/50 transition-all max-w-[280px] w-full"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">Buscar módulos...</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
            bg-muted/50 border border-border/30 text-[10px] font-mono text-muted-foreground/70">
            <Command className="h-2.5 w-2.5" /> K
          </kbd>
        </button>

        {/* Right: help + user */}
        <div className="flex items-center gap-1.5">
          {/* Help dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded-lg flex items-center justify-center
                text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                <HelpCircle className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-52 bg-card border-border/50 backdrop-blur-xl z-50"
            >
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-display">
                Ajuda & Recursos
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <BookOpen className="h-3.5 w-3.5" /> Documentação
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <MessageCircle className="h-3.5 w-3.5" /> Suporte
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <Users className="h-3.5 w-3.5" /> Comunidade
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem disabled className="gap-2 text-[10px] text-muted-foreground/50">
                <Info className="h-3 w-3" /> FlowPulse v1.0-Alpha
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* User dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded-lg flex items-center justify-center
                bg-primary/10 text-primary text-[10px] font-bold font-mono
                hover:bg-primary/20 transition-colors ring-1 ring-primary/20">
                {initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              className="w-56 bg-card border-border/50 backdrop-blur-xl z-50"
            >
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <User className="h-3.5 w-3.5" /> Perfil
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <Lock className="h-3.5 w-3.5" /> Alterar Senha
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <Palette className="h-3.5 w-3.5" /> Trocar Tema
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleKiosk} className="gap-2 text-xs cursor-pointer">
                <Monitor className="h-3.5 w-3.5" /> Modo Kiosk
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* ── Search overlay (Ctrl+K) ── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-start justify-center pt-[15vh]"
            onClick={() => setSearchOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-card-elevated rounded-xl w-full max-w-lg p-1"
            >
              <div className="flex items-center gap-2 px-3 py-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  placeholder="Buscar módulos, dashboards, hosts..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50
                    outline-none border-none"
                />
                <button onClick={() => setSearchOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="border-t border-border/20 px-3 py-3">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-2">Acesso rápido</p>
                {[
                  { label: "Central de Operações", path: "/app/operations/home" },
                  { label: "FlowMap", path: "/app/operations/flowmap" },
                  { label: "Dashboards", path: "/app/monitoring/dashboards" },
                  { label: "Incidentes", path: "/app/operations/incidents" },
                  { label: "Inventário", path: "/app/engineering/inventory" },
                ].map((item) => (
                  <button
                    key={item.path}
                    onClick={() => { navigate(item.path); setSearchOpen(false); }}
                    className="w-full text-left px-2 py-1.5 rounded-md text-xs text-foreground/80
                      hover:bg-muted/40 transition-colors"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
