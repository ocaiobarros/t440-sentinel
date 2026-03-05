import { Lightbulb, TrendingUp, AlertTriangle } from "lucide-react";

interface InsightProps {
  transactions: any[];
  saldoPrevisto: number;
  saldoRealizado: number;
  hasRealizado: boolean;
  monthLabel: string;
}

export default function FinanceInsight({ transactions, saldoPrevisto, saldoRealizado, hasRealizado, monthLabel }: InsightProps) {
  const insights: { icon: typeof Lightbulb; text: string; type: "info" | "positive" | "warning" }[] = [];

  if (!hasRealizado) {
    insights.push({
      icon: AlertTriangle,
      text: `${monthLabel}: Mês em curso — apenas dados previstos registrados. O realizado será alimentado conforme movimentações ocorram.`,
      type: "warning",
    });

    const previstoReceber = transactions.filter((t: any) => t.scenario === "PREVISTO" && t.type === "RECEBER").reduce((s: number, t: any) => s + Number(t.amount), 0);
    const previstoPagar = transactions.filter((t: any) => t.scenario === "PREVISTO" && t.type === "PAGAR").reduce((s: number, t: any) => s + Number(t.amount), 0);

    if (previstoReceber > 0 || previstoPagar > 0) {
      insights.push({
        icon: Lightbulb,
        text: `Projeção prevista: Receitas de ${fmtShort(previstoReceber)} contra despesas de ${fmtShort(previstoPagar)}, saldo líquido projetado de ${fmtShort(saldoPrevisto)}.`,
        type: "info",
      });
    }
  } else {
    const variancia = saldoPrevisto !== 0 ? ((saldoRealizado - saldoPrevisto) / Math.abs(saldoPrevisto)) * 100 : 0;

    if (variancia >= 0) {
      insights.push({
        icon: TrendingUp,
        text: `O realizado superou o previsto em ${variancia.toFixed(1)}%. Saldo acumulado de ${fmtShort(saldoRealizado)} vs ${fmtShort(saldoPrevisto)} previstos.`,
        type: "positive",
      });
    } else {
      insights.push({
        icon: AlertTriangle,
        text: `O realizado ficou ${Math.abs(variancia).toFixed(1)}% abaixo do previsto. Saldo de ${fmtShort(saldoRealizado)} vs ${fmtShort(saldoPrevisto)} planejados.`,
        type: "warning",
      });
    }

    // Find top category contributing to variance
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
        icon: Lightbulb,
        text: `Principal categoria impactante: "${topCat}" com impacto líquido de ${fmtShort(topVal)}.`,
        type: "info",
      });
    }
  }

  const typeStyles = {
    info: { bg: "bg-neon-blue/5 border-neon-blue/15", icon: "text-neon-blue", text: "text-foreground/80" },
    positive: { bg: "bg-emerald-500/5 border-emerald-500/15", icon: "text-emerald-400", text: "text-foreground/80" },
    warning: { bg: "bg-amber-500/5 border-amber-500/15", icon: "text-amber-400", text: "text-foreground/80" },
  };

  return (
    <div className="space-y-2">
      {insights.map((insight, i) => {
        const s = typeStyles[insight.type];
        return (
          <div key={i} className={`flex items-start gap-3 rounded-xl border ${s.bg} p-3.5 backdrop-blur-sm`}>
            <insight.icon className={`w-4 h-4 mt-0.5 shrink-0 ${s.icon}`} />
            <p className={`text-xs leading-relaxed ${s.text}`}>{insight.text}</p>
          </div>
        );
      })}
    </div>
  );
}

function fmtShort(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
