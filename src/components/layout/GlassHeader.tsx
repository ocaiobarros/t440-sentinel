import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  User, LogOut, Palette, Monitor, Lock, HelpCircle,
  BookOpen, MessageCircle, Users, Info, Search, Command, X,
  Sun, Moon,
} from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { useProfile } from "@/hooks/useProfile";
import NotificationBell from "./NotificationBell";
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
  const { theme, toggleTheme } = useTheme();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);

  const displayName = profile?.display_name
    || user?.user_metadata?.display_name
    || user?.email?.split("@")[0]
    || "Operador";
  const initials = displayName.slice(0, 2).toUpperCase();
  const avatarUrl = profile?.avatar_url;

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
        <div className="flex items-center gap-2">
          <SidebarTrigger className="h-7 w-7 text-muted-foreground hover:text-foreground" />
        </div>

        <button
          onClick={() => setSearchOpen(true)}
          className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg
            bg-muted/30 border border-border/30 text-xs text-muted-foreground
            hover:bg-muted/50 hover:border-border/50 transition-all max-w-[280px] w-full"
        >
          <Search className="h-3.5 w-3.5 shrink-0" />
          <span className="flex-1 text-left">{t("header.searchModules")}</span>
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded
            bg-muted/50 border border-border/30 text-[10px] font-mono text-muted-foreground/70">
            <Command className="h-2.5 w-2.5" /> K
          </kbd>
        </button>

        <div className="flex items-center gap-1.5">
          <NotificationBell />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded-lg flex items-center justify-center
                text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors">
                <HelpCircle className="h-4 w-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52 bg-card border-border/50 backdrop-blur-xl z-50">
              <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/60 font-display">
                {t("header.helpResources")}
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <BookOpen className="h-3.5 w-3.5" /> {t("header.documentation")}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <MessageCircle className="h-3.5 w-3.5" /> {t("header.support")}
              </DropdownMenuItem>
              <DropdownMenuItem className="gap-2 text-xs cursor-pointer">
                <Users className="h-3.5 w-3.5" /> {t("header.community")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem disabled className="gap-2 text-[10px] text-muted-foreground/50">
                <Info className="h-3 w-3" /> FlowPulse v1.0-Alpha
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="h-7 w-7 rounded-lg flex items-center justify-center
                bg-primary/10 text-primary text-[10px] font-bold font-mono overflow-hidden
                hover:bg-primary/20 transition-colors ring-1 ring-primary/20">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : initials}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-card border-border/50 backdrop-blur-xl z-50">
              <DropdownMenuLabel className="font-normal">
                <p className="text-sm font-medium text-foreground">{displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem onClick={() => navigate("/app/settings/profile")} className="gap-2 text-xs cursor-pointer">
                <User className="h-3.5 w-3.5" /> {t("sidebar.profile")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/app/settings/profile")} className="gap-2 text-xs cursor-pointer">
                <Lock className="h-3.5 w-3.5" /> {t("header.changePassword")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={toggleTheme} className="gap-2 text-xs cursor-pointer">
                {theme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
                {theme === "dark" ? t("header.lightTheme") : t("header.darkTheme")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onToggleKiosk} className="gap-2 text-xs cursor-pointer">
                <Monitor className="h-3.5 w-3.5" /> {t("header.kioskMode")}
              </DropdownMenuItem>
              <DropdownMenuSeparator className="bg-border/30" />
              <DropdownMenuItem onClick={handleSignOut} className="gap-2 text-xs cursor-pointer text-destructive focus:text-destructive">
                <LogOut className="h-3.5 w-3.5" /> {t("header.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

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
                  placeholder={t("header.searchPlaceholder")}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50
                    outline-none border-none"
                />
                <button onClick={() => setSearchOpen(false)} className="text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="border-t border-border/20 px-3 py-3">
                <p className="text-[10px] text-muted-foreground/50 uppercase tracking-wider mb-2">{t("header.quickAccess")}</p>
                {[
                  { label: t("header.operationsCenter"), path: "/app/operations/home" },
                  { label: t("sidebar.flowmap"), path: "/app/operations/flowmap" },
                  { label: t("sidebar.dashboards"), path: "/app/monitoring/dashboards" },
                  { label: t("sidebar.incidents"), path: "/app/operations/incidents" },
                  { label: t("sidebar.inventory"), path: "/app/engineering/inventory" },
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
