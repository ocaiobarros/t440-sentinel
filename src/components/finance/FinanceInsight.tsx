import { Lightbulb, TrendingUp, AlertTriangle } from "lucide-react";

interface InsightProps {
  transactions: any[];
  saldoPrevisto: number;
  saldoRealizado: number;
  hasRealizado: boolean;
  monthLabel: string;
}

export default function FinanceInsight({ transactions, saldoPrevisto, saldoRealizado, hasRealizado, monthLabel }: InsightProps) {
  const insights: { text: string; type: "info" | "positive" | "warning" }[] = [];

  if (!hasRealizado) {
    insights.push({
      text: `${monthLabel} em curso — projeção baseada no previsto.`,
      type: "warning",
    });
  } else {
    const variancia = saldoPrevisto !== 0 ? ((saldoRealizado - saldoPrevisto) / Math.abs(saldoPrevisto)) * 100 : 0;
    if (variancia >= 0) {
      insights.push({
        text: `Realizado superou o previsto em ${variancia.toFixed(1)}%. Saldo: ${fmtShort(saldoRealizado)}.`,
        type: "positive",
      });
    } else {
      insights.push({
        text: `Realizado ficou ${Math.abs(variancia).toFixed(1)}% abaixo. Saldo: ${fmtShort(saldoRealizado)} vs ${fmtShort(saldoPrevisto)}.`,
        type: "warning",
      });
    }

    // Top category
    const catMap = new Map<string, number>();
    for (const t of transactions.filter((t: any) => t.scenario === "REALIZADO")) {
      const cat = t.category || "Sem categoria";
      const sign = t.type === "RECEBER" ? 1 : -1;
      catMap.set(cat, (catMap.get(cat) || 0) + Number(t.amount) * sign);
    }
    const sorted = [...catMap.entries()].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
    if (sorted.length > 0) {
      const [topCat, topVal] = sorted[0];
      insights.push({
        text: `Maior impacto: "${topCat}" — ${fmtShort(topVal)}.`,
        type: "info",
      });
    }
  }

  const dotColor = {
    info: "bg-neon-blue/50",
    positive: "bg-emerald-500/50",
    warning: "bg-amber-500/50",
  };

  return (
    <div className="space-y-1.5">
      {insights.map((insight, i) => (
        <div key={i} className="flex items-center gap-3 py-2 px-1">
          <div className={`w-1 h-1 rounded-full shrink-0 ${dotColor[insight.type]}`} />
          <p className="text-[10px] font-mono text-muted-foreground/50 leading-relaxed">
            {insight.text}
          </p>
        </div>
      ))}
    </div>
  );
}

function fmtShort(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
