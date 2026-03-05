import { motion } from "framer-motion";
import { TrendingUp, Activity, Gauge, Target } from "lucide-react";

interface KPIData {
  saldoAcumulado: number;
  varianciaPercent: number;
  runwayCaixa: number; // months
  assertividade: number; // percent
  hasRealizado: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ExecutiveKPICards({ data }: { data: KPIData }) {
  const cards = [
    {
      label: "Saldo Acumulado",
      value: fmt(data.saldoAcumulado),
      icon: TrendingUp,
      accent: data.saldoAcumulado >= 0 ? "emerald" as const : "amber" as const,
      subtitle: data.saldoAcumulado >= 0 ? "Positivo" : "Negativo",
    },
    {
      label: "Variância",
      value: data.hasRealizado ? `${data.varianciaPercent >= 0 ? "+" : ""}${data.varianciaPercent.toFixed(1)}%` : "—",
      icon: Activity,
      accent: !data.hasRealizado ? "neutral" as const : data.varianciaPercent >= 0 ? "emerald" as const : "amber" as const,
      subtitle: !data.hasRealizado ? "Aguardando Realizado" : data.varianciaPercent >= 0 ? "Acima do previsto" : "Abaixo do previsto",
    },
    {
      label: "Runway de Caixa",
      value: data.hasRealizado ? `${data.runwayCaixa.toFixed(1)} meses` : "—",
      icon: Gauge,
      accent: !data.hasRealizado ? "neutral" as const : data.runwayCaixa >= 3 ? "emerald" as const : "amber" as const,
      subtitle: !data.hasRealizado ? "Projeção indisponível" : data.runwayCaixa >= 6 ? "Saudável" : data.runwayCaixa >= 3 ? "Atenção" : "Crítico",
    },
    {
      label: "Índice de Assertividade",
      value: data.hasRealizado ? `${data.assertividade.toFixed(0)}%` : "—",
      icon: Target,
      accent: !data.hasRealizado ? "neutral" as const : data.assertividade >= 85 ? "emerald" as const : "amber" as const,
      subtitle: !data.hasRealizado ? "Sem dados realizados" : data.assertividade >= 90 ? "Excelente" : data.assertividade >= 75 ? "Bom" : "Revisar",
    },
  ];

  const accentStyles = {
    emerald: {
      gradient: "from-emerald-500/10 via-emerald-500/5 to-transparent",
      border: "border-emerald-500/20",
      text: "text-emerald-400",
      glow: "shadow-emerald-500/5",
      indicator: "bg-emerald-500",
    },
    amber: {
      gradient: "from-amber-500/10 via-amber-500/5 to-transparent",
      border: "border-amber-500/20",
      text: "text-amber-400",
      glow: "shadow-amber-500/5",
      indicator: "bg-amber-500",
    },
    neutral: {
      gradient: "from-muted/30 via-muted/10 to-transparent",
      border: "border-border/30",
      text: "text-muted-foreground",
      glow: "",
      indicator: "bg-muted-foreground",
    },
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card, i) => {
        const style = accentStyles[card.accent];
        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: i * 0.08, duration: 0.4, ease: "easeOut" }}
            className={`relative overflow-hidden rounded-2xl border ${style.border} bg-card/80 backdrop-blur-xl p-5 shadow-lg ${style.glow} group hover:scale-[1.02] transition-transform duration-300`}
          >
            {/* Gradient overlay */}
            <div className={`absolute inset-0 bg-gradient-to-br ${style.gradient} pointer-events-none`} />
            
            {/* Status indicator */}
            <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${style.indicator} animate-pulse`} />

            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className={`p-2 rounded-lg bg-background/50 ${style.text}`}>
                  <card.icon className="w-4 h-4" />
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {card.label}
                </span>
              </div>
              
              <p className={`text-2xl font-display font-bold tracking-tight ${style.text} mb-1`}>
                {card.value}
              </p>
              
              <p className="text-[10px] font-mono text-muted-foreground/70">
                {card.subtitle}
              </p>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
