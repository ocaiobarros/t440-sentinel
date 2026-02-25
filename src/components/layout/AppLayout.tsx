import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Maximize2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import GlassHeader from "./GlassHeader";

interface AppLayoutProps {
  children: React.ReactNode;
}

export default function AppLayout({ children }: AppLayoutProps) {
  const [searchParams] = useSearchParams();
  const kioskFromUrl = searchParams.get("kiosk") === "true";
  const [isKiosk, setIsKiosk] = useState(kioskFromUrl);

  useEffect(() => {
    if (kioskFromUrl) setIsKiosk(true);
  }, [kioskFromUrl]);

  const toggleKiosk = useCallback(() => setIsKiosk((k) => !k), []);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        {/* Sidebar — hidden in kiosk */}
        <AnimatePresence>
          {!isKiosk && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="shrink-0 overflow-hidden"
            >
              <AppSidebar />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex-1 flex flex-col min-w-0">
          {/* Glass header */}
          <GlassHeader isKiosk={isKiosk} onToggleKiosk={toggleKiosk} />

          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>

        {/* Kiosk exit FAB */}
        <AnimatePresence>
          {isKiosk && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={toggleKiosk}
              className="fixed bottom-4 right-4 z-50 h-10 w-10 rounded-full
                bg-card/80 backdrop-blur-lg border border-border/30
                flex items-center justify-center
                text-muted-foreground hover:text-foreground hover:border-primary/30
                shadow-lg transition-colors"
              title="Sair do Modo Kiosk"
            >
              <Maximize2 className="h-4 w-4" />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </SidebarProvider>
  );
}
