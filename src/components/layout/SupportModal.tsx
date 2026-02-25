import { useTranslation } from "react-i18next";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Send, MessageCircle, ExternalLink, Mail } from "lucide-react";

interface SupportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function SupportModal({ open, onOpenChange }: SupportModalProps) {
  const { t } = useTranslation();

  const channels = [
    {
      icon: Send,
      label: t("docs.support.telegram"),
      desc: t("docs.support.telegramDesc"),
      href: "https://t.me/FlowPulseBot",
      color: "text-blue-400",
      bg: "bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/20",
    },
    {
      icon: MessageCircle,
      label: t("docs.support.whatsapp"),
      desc: t("docs.support.whatsappDesc"),
      href: "https://wa.me/5500000000000",
      color: "text-emerald-400",
      bg: "bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/20",
    },
    {
      icon: Mail,
      label: t("docs.support.email"),
      desc: t("docs.support.emailDesc"),
      href: "mailto:suporte@flowpulse.io",
      color: "text-orange-400",
      bg: "bg-orange-500/10 hover:bg-orange-500/20 border-orange-500/20",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-card border-border/60">
        <DialogHeader>
          <DialogTitle className="font-display text-base flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            {t("docs.support.title")}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{t("docs.support.subtitle")}</p>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {channels.map((ch) => {
            const Icon = ch.icon;
            return (
              <a
                key={ch.label}
                href={ch.href}
                target="_blank"
                rel="noopener noreferrer"
                className={`flex items-center gap-3 p-3 rounded-lg border transition-all duration-200 ${ch.bg}`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center bg-background/50`}>
                  <Icon className={`w-4.5 h-4.5 ${ch.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-display font-bold text-foreground">{ch.label}</span>
                  <p className="text-[10px] text-muted-foreground/70">{ch.desc}</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground/30 shrink-0" />
              </a>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
