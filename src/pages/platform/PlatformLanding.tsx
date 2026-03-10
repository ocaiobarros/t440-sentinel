import { useNavigate } from "react-router-dom";
import { Building2, CreditCard, Activity, Zap, FileSearch, ShieldCheck } from "lucide-react";

interface PlatformCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  color: string;
}

const cards: PlatformCard[] = [
  {
    title: "Tenants",
    description: "Gerencie todas as organizações da plataforma, seus membros e configurações.",
    icon: Building2,
    path: "/platform/tenants",
    color: "border-l-emerald-500",
  },
  {
    title: "Billing & Planos",
    description: "Visualize e gerencie planos, limites e uso de cada organização.",
    icon: CreditCard,
    path: "/platform/billing",
    color: "border-l-pink-500",
  },
  {
    title: "System Health",
    description: "Health checks do backend, diagnósticos globais e checklist de migração.",
    icon: Zap,
    path: "/platform/health",
    color: "border-l-amber-500",
  },
  {
    title: "Global Metrics",
    description: "Métricas de uso da plataforma, funil de vendas e análise operacional.",
    icon: Activity,
    path: "/platform/metrics",
    color: "border-l-cyan-500",
  },
  {
    title: "Platform Audit Logs",
    description: "Investigue ações em toda a plataforma, rastreie mudanças cross-tenant.",
    icon: FileSearch,
    path: "/platform/audit",
    color: "border-l-violet-500",
  },
  {
    title: "Platform Admins",
    description: "Gerencie quem tem acesso ao Platform Hub.",
    icon: ShieldCheck,
    path: "/platform/admins",
    color: "border-l-blue-500",
  },
];

export default function PlatformLanding() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Platform Hub</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Administração global da plataforma FlowPulse. Gerencie tenants, billing e saúde do sistema.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((card) => (
          <button
            key={card.path}
            onClick={() => navigate(card.path)}
            className={`text-left rounded-xl border border-border bg-card/60 backdrop-blur-sm p-6 hover:bg-muted/40 transition-all border-l-4 ${card.color} group`}
          >
            <div className="flex items-center gap-3 mb-3">
              <card.icon className="w-5 h-5 text-foreground group-hover:text-primary transition-colors" />
              <h3 className="text-sm font-bold text-foreground">{card.title}</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{card.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
