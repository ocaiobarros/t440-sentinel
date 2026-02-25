import { type ReactNode } from "react";
import { Activity } from "lucide-react";
import { useTranslation } from "react-i18next";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
}

export default function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen bg-background grid-pattern scanlines relative flex items-center justify-center p-4">
      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[500px] h-[250px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Activity className="w-7 h-7 text-primary" />
            <span className="font-display text-2xl font-bold tracking-wider text-primary text-glow-green">
              FLOWPULSE
            </span>
          </div>
          <h1 className="text-xl font-semibold text-foreground">{title}</h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
          )}
        </div>

        {/* Card */}
        <div className="glass-card-elevated rounded-xl p-8">
          {children}
        </div>

        <p className="text-center text-[10px] font-mono text-muted-foreground/40 mt-6">
          FLOWPULSE INTELLIGENCE • {t("auth.platformSubtitle")}
        </p>
      </div>
    </div>
  );
}
