import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KPIData {
  saldoAcumulado: number;
  varianciaPercent: number;
  runwayCaixa: number;
  assertividade: number;
  hasRealizado: boolean;
}

const fmt = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

export default function ExecutiveKPICards({ data }: { data: KPIData }) {
  const cards = [
    {
      label: "SALDO",
      value: fmt(data.saldoAcumulado),
      trend: data.saldoAcumulado >= 0 ? "up" : "down",
      status: data.saldoAcumulado >= 0 ? "positive" : "negative",
      sub: data.hasRealizado ? "realizado" : "previsto",
    },
    {
      label: "VARIÂNCIA",
      value: data.hasRealizado ? `${data.varianciaPercent >= 0 ? "+" : ""}${data.varianciaPercent.toFixed(1)}%` : "—",
      trend: !data.hasRealizado ? "neutral" : data.varianciaPercent >= 0 ? "up" : "down",
      status: !data.hasRealizado ? "neutral" : data.varianciaPercent >= 0 ? "positive" : "negative",
      sub: !data.hasRealizado ? "aguardando" : "vs previsto",
    },
    {
      label: "RUNWAY",
      value: data.hasRealizado ? `${data.runwayCaixa.toFixed(1)}` : "—",
      suffix: data.hasRealizado ? "mo" : "",
      trend: !data.hasRealizado ? "neutral" : data.runwayCaixa >= 3 ? "up" : "down",
      status: !data.hasRealizado ? "neutral" : data.runwayCaixa >= 3 ? "positive" : "negative",
      sub: !data.hasRealizado ? "indisponível" : data.runwayCaixa >= 6 ? "saudável" : data.runwayCaixa >= 3 ? "atenção" : "crítico",
    },
    {
      label: "ASSERTIVIDADE",
      value: data.hasRealizado ? `${data.assertividade.toFixed(0)}` : "—",
      suffix: data.hasRealizado ? "%" : "",
      trend: !data.hasRealizado ? "neutral" : data.assertividade >= 85 ? "up" : "down",
      status: !data.hasRealizado ? "neutral" : data.assertividade >= 85 ? "positive" : "negative",
      sub: !data.hasRealizado ? "sem dados" : data.assertividade >= 90 ? "excelente" : "revisar",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-border/5 rounded-2xl overflow-hidden">
      {cards.map((card, i) => {
        const TrendIcon = card.trend === "up" ? TrendingUp : card.trend === "down" ? TrendingDown : Minus;
        const statusColor = card.status === "positive"
          ? "text-emerald-400"
          : card.status === "negative"
            ? "text-red-400"
            : "text-muted-foreground/40";

        return (
          <motion.div
            key={card.label}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="bg-card/30 backdrop-blur-sm p-7 lg:p-8 relative group"
          >
            {/* Subtle top accent line */}
            <div className={`absolute top-0 left-6 right-6 h-px ${
              card.status === "positive" ? "bg-emerald-500/20" :
              card.status === "negative" ? "bg-red-500/20" : "bg-border/10"
            }`} />

            <p className="text-[9px] font-mono tracking-[0.3em] text-muted-foreground/40 mb-4">
              {card.label}
            </p>

            <div className="flex items-baseline gap-1">
              <p className={`text-3xl lg:text-4xl font-display font-bold tracking-tight leading-none ${statusColor}`}>
                {card.value}
              </p>
              {card.suffix && (
                <span className="text-sm font-mono text-muted-foreground/30">{card.suffix}</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 mt-4">
              <TrendIcon className={`w-3 h-3 ${statusColor}`} />
              <span className="text-[9px] font-mono text-muted-foreground/30 uppercase tracking-wider">
                {card.sub}
              </span>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
