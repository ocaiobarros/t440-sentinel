import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import {
  User, Camera, Lock, Globe2, Palette, Save, RotateCcw,
  Eye, EyeOff, Check, Shield, ZoomIn, ZoomOut, Briefcase, Phone,
  Moon, Sun, Trash2, Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
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
  { value: "pt-BR", label: "Português (BR)", flag: "🇧🇷" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
];

export default function UserSettings() {
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const fileRef = useRef<HTMLInputElement>(null);

  // Profile state
  const [displayName, setDisplayName] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [phone, setPhone] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarZoom, setAvatarZoom] = useState(1);
  const [avatarLoading, setAvatarLoading] = useState(false);
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
    if (!profile || !user) return;
    setDisplayName(profile.display_name || user.email?.split("@")[0] || "");
    setAvatarUrl(profile.avatar_url);
    setJobTitle(profile.job_title || "");
    setPhone(profile.phone || "");
    const savedLang = localStorage.getItem("flowpulse-lang");
    if (savedLang) setLanguage(savedLang);
  }, [profile, user]);

  const initials = displayName.slice(0, 2).toUpperCase() || "??";

  // Avatar upload
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;
    setAvatarLoading(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `avatars/${user.id}.${ext}`;

      // Remove old file variants (jpg/png/webp)
      const { data: existingFiles } = await supabase.storage.from("dashboard-assets").list("avatars", {
        search: user.id,
      });
      if (existingFiles?.length) {
        await supabase.storage.from("dashboard-assets").remove(
          existingFiles.map(f => `avatars/${f.name}`)
        );
      }

      const { error } = await supabase.storage.from("dashboard-assets").upload(path, file, { upsert: true });
      if (error) { toast.error("Erro ao enviar avatar"); return; }

      const { data: pub } = supabase.storage.from("dashboard-assets").getPublicUrl(path);
      const url = pub.publicUrl + `?t=${Date.now()}`;
      setAvatarUrl(url);
      setAvatarZoom(1);
      await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
      await refreshProfile();
      toast.success("Avatar atualizado");
    } finally {
      setAvatarLoading(false);
      // Reset input so re-selecting same file triggers change
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [user, refreshProfile]);

  const handleResetAvatar = useCallback(async () => {
    if (!user) return;
    setAvatarLoading(true);
    try {
      // Remove from storage
      const { data: existingFiles } = await supabase.storage.from("dashboard-assets").list("avatars", {
        search: user.id,
      });
      if (existingFiles?.length) {
        await supabase.storage.from("dashboard-assets").remove(
          existingFiles.map(f => `avatars/${f.name}`)
        );
      }
      setAvatarUrl(null);
      setAvatarZoom(1);
      await supabase.from("profiles").update({ avatar_url: null }).eq("id", user.id);
      await refreshProfile();
      toast.success("Avatar removido");
    } finally {
      setAvatarLoading(false);
    }
  }, [user, refreshProfile]);

  // Save profile
  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      job_title: jobTitle || null,
      phone: phone || null,
    }).eq("id", user.id);
    if (error) { toast.error("Erro ao salvar perfil"); }
    else {
      localStorage.setItem("flowpulse-lang", language);
      await refreshProfile();
      toast.success("Perfil salvo com sucesso");
    }
    setSaving(false);
  }, [user, displayName, jobTitle, phone, language, refreshProfile]);

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
              {/* Loading overlay */}
              {avatarLoading && (
                <div className="absolute inset-0 rounded-full bg-background/70 flex items-center justify-center">
                  <Loader2 className="h-6 w-6 text-primary animate-spin" />
                </div>
              )}
              {/* Camera button */}
              {!avatarLoading && (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="absolute inset-0 rounded-full bg-background/60 opacity-0 group-hover:opacity-100
                    flex items-center justify-center transition-opacity"
                >
                  <Camera className="h-5 w-5 text-foreground" />
                </button>
              )}
              {/* Trash button */}
              {avatarUrl && !avatarLoading && (
                <button
                  onClick={handleResetAvatar}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-destructive text-destructive-foreground
                    flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-md"
                  title="Remover foto"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
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

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">E-mail</label>
            <input
              value={user?.email || ""}
              readOnly
              className="w-full px-3 py-2.5 rounded-lg bg-muted/10 border border-border/50 text-sm text-muted-foreground cursor-not-allowed"
            />
          </div>

          {/* Job Title & Phone */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Briefcase className="h-3 w-3" /> Cargo
              </label>
              <input
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                  placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                placeholder="Ex: Engenheiro NOC"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Phone className="h-3 w-3" /> Telefone
              </label>
              <input
                value={phone}
                onChange={e => setPhone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                  placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                placeholder="+55 11 9xxxx-xxxx"
              />
            </div>
          </div>

          {/* Preferences */}
          <div className="space-y-4">
            {/* Language with flags */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Globe2 className="h-3 w-3" /> Idioma
              </label>
              <div className="flex gap-2">
                {LANGUAGES.map(l => (
                  <button
                    key={l.value}
                    onClick={() => setLanguage(l.value)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-xs font-medium transition-all
                      ${language === l.value
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/20 text-muted-foreground hover:border-border/80"
                      }`}
                  >
                    <span className="text-base">{l.flag}</span>
                    <span>{l.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Theme visual cards */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Palette className="h-3 w-3" /> Tema
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setTheme("dark")}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${theme === "dark"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/50 bg-muted/10 hover:border-border"
                    }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[hsl(220,40%,8%)] border border-white/10 flex items-center justify-center">
                    <Moon className="h-4 w-4 text-[hsl(var(--neon-cyan))]" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Deep Space</span>
                  <span className="text-[9px] text-muted-foreground">Modo escuro</span>
                  {theme === "dark" && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                  )}
                </button>
                <button
                  onClick={() => setTheme("light")}
                  className={`relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all
                    ${theme === "light"
                      ? "border-primary bg-primary/5 ring-1 ring-primary/20"
                      : "border-border/50 bg-muted/10 hover:border-border"
                    }`}
                >
                  <div className="w-10 h-10 rounded-full bg-[hsl(210,25%,95%)] border border-black/10 flex items-center justify-center">
                    <Sun className="h-4 w-4 text-amber-500" />
                  </div>
                  <span className="text-xs font-medium text-foreground">Arctic Frost</span>
                  <span className="text-[9px] text-muted-foreground">Modo claro</span>
                  {theme === "light" && (
                    <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-primary flex items-center justify-center">
                      <Check className="h-2.5 w-2.5 text-primary-foreground" />
                    </div>
                  )}
                </button>
              </div>
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
