import { useNavigate } from "react-router-dom";
import { Users, Building2, Cable, Radio, Activity, Zap, CreditCard, FileSearch } from "lucide-react";

interface AdminCard {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  path: string;
  color: string;
}

const cards: AdminCard[] = [
  {
    title: "Usuários e Acesso",
    description: "Gerencie usuários, papéis e permissões de acesso individuais e por time.",
    icon: Users,
    path: "/app/settings/admin/access",
    color: "border-l-blue-500",
  },
  {
    title: "Organizações",
    description: "Crie e gerencie organizações (ecossistemas isolados) e seus membros.",
    icon: Building2,
    path: "/app/settings/admin/orgs",
    color: "border-l-emerald-500",
  },
  {
    title: "Conexões de Dados",
    description: "Configure integrações com Zabbix, RMS Fueling e outros conectores.",
    icon: Cable,
    path: "/app/settings/admin/connections",
    color: "border-l-orange-500",
  },
  {
    title: "Telemetria",
    description: "Configure o pipeline de alertas: Zabbix Webhook → FlowPulse → Telegram.",
    icon: Radio,
    path: "/app/settings/admin/telemetry",
    color: "border-l-purple-500",
  },
  {
    title: "Intelligence Ops",
    description: "Métricas de funil de vendas, trilha de auditoria e análise operacional.",
    icon: Activity,
    path: "/app/settings/admin/ops",
    color: "border-l-cyan-500",
  },
  {
    title: "Diagnóstico",
    description: "Health checks do backend, diagnósticos de acesso e checklist de migração.",
    icon: Zap,
    path: "/app/settings/admin/diagnostics",
    color: "border-l-amber-500",
  },
  {
    title: "Billing & Planos",
    description: "Gerencie planos, limites de uso e informações de faturamento.",
    icon: CreditCard,
    path: "/app/settings/admin/billing",
    color: "border-l-pink-500",
  },
];

export default function AdminLanding() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-foreground font-[Orbitron] tracking-wide">Administration</h2>
        <p className="text-sm text-muted-foreground mt-1">Configurações gerais da plataforma FlowPulse.</p>
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
