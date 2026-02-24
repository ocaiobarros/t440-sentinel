import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User, Camera, Lock, Globe2, Palette, Save, RotateCcw,
  Eye, EyeOff, Check, Shield, ZoomIn, ZoomOut,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import { toast } from "sonner";
import { Slider } from "@/components/ui/slider";

/* ─── Password strength ── */
function getStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: "Fraca", color: "bg-destructive" };
  if (score <= 3) return { score, label: "Média", color: "bg-[hsl(var(--neon-amber))]" };
  return { score, label: "Forte", color: "bg-[hsl(var(--neon-green))]" };
}

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)" },
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
];

export default function UserSettings() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [language, setLanguage] = useState("pt-BR");
  const [saving, setSaving] = useState(false);

  // Password state
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [changingPw, setChangingPw] = useState(false);
  const strength = getStrength(newPw);

  // Load profile
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("profiles").select("display_name, avatar_url").eq("id", user.id).single();
      if (data) {
        setDisplayName(data.display_name || user.email?.split("@")[0] || "");
        setAvatarUrl(data.avatar_url);
      }
      const savedLang = localStorage.getItem("flowpulse-lang");
      if (savedLang) setLanguage(savedLang);
    })();
  }, [user]);

  const initials = displayName.slice(0, 2).toUpperCase() || "??";

  // Avatar upload
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    const ext = file.name.split(".").pop();
    const path = `avatars/${user.id}.${ext}`;

    const { error } = await supabase.storage.from("dashboard-assets").upload(path, file, { upsert: true });
    if (error) { toast.error("Erro ao enviar avatar"); return; }

    const { data: pub } = supabase.storage.from("dashboard-assets").getPublicUrl(path);
    const url = pub.publicUrl + `?t=${Date.now()}`;
    setAvatarUrl(url);
    await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
    toast.success("Avatar atualizado");
  }, [user]);

  const handleResetAvatar = useCallback(async () => {
    if (!user) return;
    setAvatarUrl(null);
    setAvatarZoom(1);
    await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
    toast.success("Avatar removido");
  }, [user]);

  // Save profile
  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ display_name: displayName }).eq("id", user.id);
    if (error) { toast.error("Erro ao salvar perfil"); }
    else {
      localStorage.setItem("flowpulse-lang", language);
      toast.success("Perfil salvo com sucesso");
    }
    setSaving(false);
  }, [user, displayName, language]);

  // Change password
  const handleChangePassword = useCallback(async () => {
    if (newPw !== confirmPw) { toast.error("As senhas não coincidem"); return; }
    if (newPw.length < 8) { toast.error("A senha deve ter pelo menos 8 caracteres"); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { toast.error(error.message); }
    else {
      toast.success("Senha alterada com sucesso");
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    }
    setChangingPw(false);
  }, [newPw, confirmPw]);

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">Configurações</h1>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Identity Card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6 space-y-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> Identidade
          </h2>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-4">
            <div className="relative group">
              <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-primary/30 bg-muted flex items-center justify-center">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                    style={{ transform: `scale(${avatarZoom})` }}
                  />
                ) : (
                  <span className="text-2xl font-bold font-mono text-primary">{initials}</span>
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100
                  flex items-center justify-center transition-opacity"
              >
                <Camera className="h-5 w-5 text-foreground" />
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
            </div>

            {/* Zoom controls */}
            {avatarUrl && (
              <div className="flex items-center gap-3 w-full max-w-[200px]">
                <ZoomOut className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <Slider
                  value={[avatarZoom]}
                  min={1}
                  max={2}
                  step={0.05}
                  onValueChange={([v]) => setAvatarZoom(v)}
                  className="flex-1"
                />
                <ZoomIn className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <button onClick={handleResetAvatar} className="text-muted-foreground hover:text-foreground" title="Resetar">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Nome Completo</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              placeholder="Seu nome"
            />
          </div>

          {/* Preferences */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Globe2 className="h-3 w-3" /> Idioma
              </label>
              <select
                value={language}
                onChange={e => setLanguage(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                  focus:border-primary/50 focus:outline-none transition-all appearance-none"
              >
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Palette className="h-3 w-3" /> Tema
              </label>
              <select
                value={theme}
                onChange={e => setTheme(e.target.value as "dark" | "light")}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                  focus:border-primary/50 focus:outline-none transition-all appearance-none"
              >
                <option value="dark">🌙 Deep Space</option>
                <option value="light">❄️ Arctic Frost</option>
              </select>
            </div>
          </div>

          <button
            onClick={handleSave}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              bg-primary text-primary-foreground text-sm font-medium
              hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <RotateCcw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Salvando..." : "Salvar Perfil"}
          </button>
        </motion.div>

        {/* ── Security Card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-6 space-y-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> Segurança
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Senha Atual</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={currentPw}
                  onChange={e => setCurrentPw(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2.5 pr-10 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                    placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                />
                <button onClick={() => setShowPw(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Nova Senha</label>
              <input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                  placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              />
              {newPw && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-muted/30 overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${strength.color}`}
                      style={{ width: `${(strength.score / 5) * 100}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-muted-foreground">{strength.label}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">Confirmar Nova Senha</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder="Repita a nova senha"
                  className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                    placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                />
                {confirmPw && confirmPw === newPw && (
                  <Check className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[hsl(var(--neon-green))]" />
                )}
              </div>
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={changingPw || !newPw || !confirmPw}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg
              border border-primary/30 text-primary text-sm font-medium
              hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <Lock className="h-4 w-4" />
            {changingPw ? "Alterando..." : "Alterar Senha"}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
