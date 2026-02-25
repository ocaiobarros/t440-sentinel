import { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Globe, FileText, Wrench, Send, Map, LayoutDashboard,
  ArrowLeft, Search, Clock, Sparkles, ExternalLink, ChevronRight,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

/* ─── Module cards config ─── */
interface DocModule {
  id: string;
  titleKey: string;
  descKey: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  file: string;
}

const DOC_MODULES: DocModule[] = [
  { id: "flowmap",    titleKey: "docs.modules.flowmap",    descKey: "docs.modules.flowmapDesc",    icon: Map,              color: "text-neon-green",  file: "/docs/flowmap.md" },
  { id: "bgp",        titleKey: "docs.modules.bgp",        descKey: "docs.modules.bgpDesc",        icon: Globe,            color: "text-neon-cyan",   file: "/docs/bgp-flow.md" },
  { id: "dashboards", titleKey: "docs.modules.dashboards", descKey: "docs.modules.dashboardsDesc", icon: LayoutDashboard,  color: "text-neon-amber",  file: "/docs/dashboards.md" },
  { id: "sla",        titleKey: "docs.modules.sla",        descKey: "docs.modules.slaDesc",        icon: FileText,         color: "text-purple-400",  file: "/docs/sla-governance.md" },
  { id: "inventory",  titleKey: "docs.modules.inventory",  descKey: "docs.modules.inventoryDesc",  icon: Wrench,           color: "text-orange-400",  file: "/docs/inventory.md" },
  { id: "telegram",   titleKey: "docs.modules.telegram",   descKey: "docs.modules.telegramDesc",   icon: Send,             color: "text-blue-400",    file: "/docs/telegram-bot.md" },
];

/* ─── System updates timeline ─── */
interface UpdateEntry {
  version: string;
  date: string;
  titleKey: string;
  descKey: string;
  type: "feature" | "fix" | "improvement";
}

const UPDATES: UpdateEntry[] = [
  { version: "2.8.0", date: "2026-02-25", titleKey: "docs.updates.i18n",         descKey: "docs.updates.i18nDesc",         type: "feature" },
  { version: "2.7.0", date: "2026-02-20", titleKey: "docs.updates.docsPage",     descKey: "docs.updates.docsPageDesc",     type: "feature" },
  { version: "2.6.2", date: "2026-02-18", titleKey: "docs.updates.warRoom",      descKey: "docs.updates.warRoomDesc",      type: "improvement" },
  { version: "2.6.0", date: "2026-02-15", titleKey: "docs.updates.oltHealth",    descKey: "docs.updates.oltHealthDesc",    type: "feature" },
  { version: "2.5.1", date: "2026-02-10", titleKey: "docs.updates.cableVertex",  descKey: "docs.updates.cableVertexDesc",  type: "fix" },
  { version: "2.5.0", date: "2026-02-05", titleKey: "docs.updates.slaModule",    descKey: "docs.updates.slaModuleDesc",    type: "feature" },
];

const TYPE_COLORS: Record<string, string> = {
  feature: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
  fix: "bg-red-500/15 text-red-400 border-red-500/20",
  improvement: "bg-blue-500/15 text-blue-400 border-blue-500/20",
};

/* ─── Simple markdown renderer ─── */
function renderMarkdown(md: string): string {
  return md
    // Code blocks
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="p-3 rounded-lg bg-black/40 border border-muted/10 overflow-x-auto text-[11px] font-mono text-emerald-400/80 my-3"><code>$2</code></pre>')
    // Tables
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)*)/g, (_, header, body) => {
      const ths = header.split("|").filter(Boolean).map((h: string) => `<th class="text-left py-1.5 px-2 text-muted-foreground/60 text-[10px] uppercase">${h.trim()}</th>`).join("");
      const rows = body.trim().split("\n").map((row: string) => {
        const tds = row.split("|").filter(Boolean).map((c: string) => `<td class="py-1.5 px-2 text-[11px]">${c.trim().replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</td>`).join("");
        return `<tr class="border-b border-muted/5">${tds}</tr>`;
      }).join("");
      return `<table class="w-full text-sm font-mono my-3 border-collapse"><thead><tr class="border-b border-muted/10">${ths}</tr></thead><tbody>${rows}</tbody></table>`;
    })
    // Headings
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-display font-bold text-foreground mt-5 mb-2">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-base font-display font-bold text-foreground mt-6 mb-3 flex items-center gap-2"><span class="w-1 h-4 rounded-full bg-primary inline-block"></span>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="text-xl font-display font-bold text-foreground mb-4">$1</h1>')
    // Bold & inline code
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-foreground">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-muted/20 text-primary text-[11px] font-mono">$1</code>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" class="text-primary underline underline-offset-2 hover:text-primary/80">$1</a>')
    // Lists
    .replace(/^- (.+)$/gm, '<li class="text-sm text-muted-foreground ml-4 list-disc mb-1">$1</li>')
    .replace(/^(\d+)\. (.+)$/gm, '<li class="text-sm text-muted-foreground ml-4 list-decimal mb-1">$2</li>')
    // Paragraphs
    .replace(/^(?!<[hluotp]|<li|<pre|<table|<a)(.+)$/gm, '<p class="text-sm text-muted-foreground leading-relaxed mb-2">$1</p>');
}

/* ─── Page Component ─── */
export default function DocsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [selectedModule, setSelectedModule] = useState<DocModule | null>(null);
  const [mdContent, setMdContent] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Filter modules
  const filtered = useMemo(() => {
    if (!search) return DOC_MODULES;
    const q = search.toLowerCase();
    return DOC_MODULES.filter(m =>
      t(m.titleKey).toLowerCase().includes(q) ||
      t(m.descKey).toLowerCase().includes(q)
    );
  }, [search, t]);

  // Load markdown file
  useEffect(() => {
    if (!selectedModule) { setMdContent(""); return; }
    setLoading(true);
    fetch(selectedModule.file)
      .then(r => r.ok ? r.text() : Promise.reject("Not found"))
      .then(text => setMdContent(text))
      .catch(() => setMdContent(`# ${t(selectedModule.titleKey)}\n\n${t("docs.noContent")}`))
      .finally(() => setLoading(false));
  }, [selectedModule, t]);

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6 h-full min-h-0">
      {/* ─── Main content ─── */}
      <div className="flex-1 min-w-0">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-3 mb-4">
            {selectedModule && (
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setSelectedModule(null)}>
                <ArrowLeft className="w-4 h-4" />
              </Button>
            )}
            <div>
              <h1 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                {selectedModule ? t(selectedModule.titleKey) : t("docs.title")}
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {selectedModule ? t(selectedModule.descKey) : t("docs.subtitle")}
              </p>
            </div>
          </div>

          {!selectedModule && (
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
              <Input
                placeholder={t("docs.searchPlaceholder")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9 text-sm bg-card/60 border-border/50"
              />
            </div>
          )}
        </motion.div>

        <AnimatePresence mode="wait">
          {!selectedModule ? (
            /* ─── Knowledge Base Grid ─── */
            <motion.div
              key="grid"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4"
            >
              {filtered.map((mod, i) => {
                const Icon = mod.icon;
                return (
                  <motion.button
                    key={mod.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedModule(mod)}
                    className="group text-left rounded-xl p-5 border border-border/50 bg-card/60 backdrop-blur-sm
                      hover:border-primary/30 hover:shadow-[0_0_20px_rgba(var(--primary-rgb),0.05)] transition-all duration-300"
                  >
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center bg-muted/10 shrink-0
                        group-hover:scale-110 transition-transform duration-300`}>
                        <Icon className={`w-5 h-5 ${mod.color}`} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-bold text-sm text-foreground">{t(mod.titleKey)}</span>
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground/30 group-hover:text-primary/60 transition-colors" />
                        </div>
                        <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed line-clamp-2">
                          {t(mod.descKey)}
                        </p>
                      </div>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          ) : (
            /* ─── Markdown viewer ─── */
            <motion.div
              key="doc"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <ScrollArea className="h-[calc(100vh-220px)]">
                {loading ? (
                  <div className="flex items-center justify-center py-20">
                    <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                ) : (
                  <div
                    className="prose-custom max-w-none pr-4"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(mdContent) }}
                  />
                )}
              </ScrollArea>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ─── Right sidebar: Updates Timeline ─── */}
      <motion.aside
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 0.2 }}
        className="w-full lg:w-72 xl:w-80 shrink-0"
      >
        <div className="rounded-xl border border-border/50 bg-card/60 backdrop-blur-sm p-4">
          <h3 className="text-xs font-display font-bold text-foreground flex items-center gap-2 mb-4">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {t("docs.whatsNew")}
          </h3>

          <div className="space-y-0">
            {UPDATES.map((u, i) => (
              <div key={u.version} className="relative pl-5 pb-4 last:pb-0">
                {/* Timeline line */}
                {i < UPDATES.length - 1 && (
                  <div className="absolute left-[7px] top-3 bottom-0 w-px bg-border/50" />
                )}
                {/* Dot */}
                <div className="absolute left-0 top-1.5 w-[15px] h-[15px] rounded-full border-2 border-border/60 bg-card flex items-center justify-center">
                  <div className={`w-[7px] h-[7px] rounded-full ${
                    u.type === "feature" ? "bg-emerald-400" : u.type === "fix" ? "bg-red-400" : "bg-blue-400"
                  }`} />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className={`text-[8px] px-1.5 py-0 h-4 font-mono ${TYPE_COLORS[u.type]}`}>
                      {u.type === "feature" ? t("docs.feature") : u.type === "fix" ? t("docs.fix") : t("docs.improvement")}
                    </Badge>
                    <span className="text-[9px] font-mono text-muted-foreground/40">v{u.version}</span>
                  </div>
                  <h4 className="text-[11px] font-display font-bold text-foreground">{t(u.titleKey)}</h4>
                  <p className="text-[10px] text-muted-foreground/60 leading-relaxed mt-0.5">{t(u.descKey)}</p>
                  <span className="text-[9px] font-mono text-muted-foreground/30 flex items-center gap-1 mt-1">
                    <Clock className="w-2.5 h-2.5" />{u.date}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.aside>
    </div>
  );
}
