import { useState, useRef, useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
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
function getStrength(pw: string, t: (key: string) => string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (score <= 1) return { score, label: t("settings.strengthWeak"), color: "bg-destructive" };
  if (score <= 3) return { score, label: t("settings.strengthMedium"), color: "bg-[hsl(var(--neon-amber))]" };
  return { score, label: t("settings.strengthStrong"), color: "bg-[hsl(var(--neon-green))]" };
}

const LANGUAGES = [
  { value: "pt-BR", label: "Português (BR)", flag: "🇧🇷" },
  { value: "en", label: "English", flag: "🇺🇸" },
  { value: "es", label: "Español", flag: "🇪🇸" },
];

const ALLOWED_AVATAR_MIME = ["image/jpeg", "image/jpg", "image/png", "image/webp"];

function extractAvatarStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const cleanUrl = url.split("?")[0];
  const marker = "/storage/v1/object/public/dashboard-assets/";
  const markerIndex = cleanUrl.indexOf(marker);
  if (markerIndex === -1) return null;
  return cleanUrl.slice(markerIndex + marker.length);
}

export default function UserSettings() {
  const { user } = useAuth();
  const { profile, refresh: refreshProfile } = useProfile();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
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
  const strength = getStrength(newPw, t);

  // Load profile
  useEffect(() => {
    if (!profile || !user) return;
    setDisplayName(profile.display_name || user.email?.split("@")[0] || "");
    setAvatarUrl(profile.avatar_url);
    setJobTitle(profile.job_title || "");
    setPhone(profile.phone || "");
    const lang = profile.language || localStorage.getItem("flowpulse-lang") || "pt-BR";
    setLanguage(lang);
    if (i18n.language !== lang) i18n.changeLanguage(lang);
  }, [profile, user]);

  const initials = displayName.slice(0, 2).toUpperCase() || "??";

  // Avatar upload
  const handleAvatarUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setAvatarLoading(true);
    try {
      if (!ALLOWED_AVATAR_MIME.includes(file.type)) {
        console.error("[avatar] MIME não permitido", { type: file.type, size: file.size, name: file.name });
        toast.error(t("settings.invalidFormat"));
        return;
      }

      const oldAvatarPath = extractAvatarStoragePath(avatarUrl || profile?.avatar_url);
      const extFromMime = file.type === "image/jpeg" || file.type === "image/jpg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : "webp";
      const newPath = `avatars/${user.id}_${Date.now()}.${extFromMime}`;

      const { data: existingFiles, error: listError } = await supabase.storage
        .from("dashboard-assets")
        .list("avatars", { search: user.id });

      if (listError) {
        console.error("[avatar] erro ao listar arquivos antigos", listError);
      }

      const pathsToDelete = new Set<string>();
      if (oldAvatarPath?.startsWith("avatars/")) {
        pathsToDelete.add(oldAvatarPath);
      }
      existingFiles?.forEach((f) => {
        if (f.name.startsWith(`${user.id}_`) || f.name.startsWith(`${user.id}.`)) {
          pathsToDelete.add(`avatars/${f.name}`);
        }
      });

      if (pathsToDelete.size > 0) {
        const { error: removeError } = await supabase.storage
          .from("dashboard-assets")
          .remove(Array.from(pathsToDelete));

        if (removeError) {
          console.error("[avatar] erro ao remover avatar antigo", removeError);
          throw removeError;
        }
      }

      const { error: uploadError } = await supabase.storage
        .from("dashboard-assets")
        .upload(newPath, file, {
          upsert: false,
          cacheControl: "0",
          contentType: file.type,
        });

      if (uploadError) {
        console.error("[avatar] erro no upload", uploadError);
        throw uploadError;
      }

      const { data: pub } = supabase.storage.from("dashboard-assets").getPublicUrl(newPath);
      const nextAvatarUrl = `${pub.publicUrl}?t=${Date.now()}`;

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: nextAvatarUrl })
        .eq("id", user.id);

      if (profileError) {
        console.error("[avatar] erro ao atualizar profiles.avatar_url", profileError);
        throw profileError;
      }

      setAvatarUrl(nextAvatarUrl);
      setAvatarZoom(1);
      await refreshProfile();
      toast.success(t("settings.avatarUpdated"));
    } catch (err) {
      console.error("[avatar] falha no fluxo de substituição", err);
      toast.error(t("settings.avatarError"));
      setAvatarZoom(1);
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [user, avatarUrl, profile?.avatar_url, refreshProfile]);

  const handleResetAvatar = useCallback(async () => {
    if (!user) return;

    setAvatarLoading(true);
    try {
      const oldAvatarPath = extractAvatarStoragePath(avatarUrl || profile?.avatar_url);
      const { data: existingFiles, error: listError } = await supabase.storage
        .from("dashboard-assets")
        .list("avatars", { search: user.id });

      if (listError) {
        console.error("[avatar] erro ao listar para remoção", listError);
      }

      const pathsToDelete = new Set<string>();
      if (oldAvatarPath?.startsWith("avatars/")) {
        pathsToDelete.add(oldAvatarPath);
      }
      existingFiles?.forEach((f) => {
        if (f.name.startsWith(`${user.id}_`) || f.name.startsWith(`${user.id}.`)) {
          pathsToDelete.add(`avatars/${f.name}`);
        }
      });

      if (pathsToDelete.size > 0) {
        const { error: removeError } = await supabase.storage
          .from("dashboard-assets")
          .remove(Array.from(pathsToDelete));

        if (removeError) {
          console.error("[avatar] erro ao remover do storage", removeError);
          throw removeError;
        }
      }

      const { error: profileError } = await supabase
        .from("profiles")
        .update({ avatar_url: null })
        .eq("id", user.id);

      if (profileError) {
        console.error("[avatar] erro ao limpar profiles.avatar_url", profileError);
        throw profileError;
      }

      setAvatarUrl(null);
      setAvatarZoom(1);
      await refreshProfile();
      toast.success(t("settings.avatarRemoved"));
    } catch (err) {
      console.error("[avatar] falha ao remover avatar", err);
      toast.error(t("settings.avatarRemoveError"));
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [user, avatarUrl, profile?.avatar_url, refreshProfile]);

  // Save profile
  const handleSave = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: displayName,
      job_title: jobTitle || null,
      phone: phone || null,
      language,
    } as any).eq("id", user.id);
    if (error) { toast.error(t("settings.profileError")); }
    else {
      localStorage.setItem("flowpulse-lang", language);
      i18n.changeLanguage(language);
      await refreshProfile();
      toast.success(t("settings.profileSaved"));
    }
    setSaving(false);
  }, [user, displayName, jobTitle, phone, language, refreshProfile, t, i18n]);

  // Change password
  const handleChangePassword = useCallback(async () => {
    if (newPw !== confirmPw) { toast.error(t("settings.passwordMismatch")); return; }
    if (newPw.length < 8) { toast.error(t("settings.passwordTooShort")); return; }
    setChangingPw(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) { toast.error(error.message); }
    else {
      toast.success(t("settings.passwordChanged"));
      setCurrentPw(""); setNewPw(""); setConfirmPw("");
    }
    setChangingPw(false);
  }, [newPw, confirmPw, t]);

  return (
    <div className="p-4 md:p-6 max-w-[1000px] mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <User className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground font-display tracking-tight">{t("settings.title")}</h1>
          <p className="text-xs text-muted-foreground">{user?.email}</p>
        </div>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Identity Card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="glass-card rounded-xl p-6 space-y-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <User className="h-4 w-4 text-primary" /> {t("settings.identity")}
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
                  title={t("settings.removePhoto")}
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
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{t("settings.fullName")}</label>
            <input
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
              placeholder={t("settings.namePlaceholder")}
            />
          </div>

          {/* Email (read-only) */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{t("settings.email")}</label>
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
                <Briefcase className="h-3 w-3" /> {t("settings.jobTitle")}
              </label>
              <input
                value={jobTitle}
                onChange={e => setJobTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-muted/30 border border-border text-sm text-foreground
                  placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/20 transition-all"
                placeholder={t("settings.jobTitlePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                <Phone className="h-3 w-3" /> {t("settings.phone")}
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
                <Globe2 className="h-3 w-3" /> {t("settings.language")}
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
                <Palette className="h-3 w-3" /> {t("settings.theme")}
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
                  <span className="text-[9px] text-muted-foreground">{t("settings.darkMode")}</span>
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
                  <span className="text-[9px] text-muted-foreground">{t("settings.lightMode")}</span>
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
            {saving ? t("settings.saving") : t("settings.saveProfile")}
          </button>
        </motion.div>

        {/* ── Security Card ── */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="glass-card rounded-xl p-6 space-y-6">
          <h2 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" /> {t("settings.security")}
          </h2>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{t("settings.currentPassword")}</label>
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
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{t("settings.newPassword")}</label>
              <input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={e => setNewPw(e.target.value)}
                placeholder={t("settings.minChars")}
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
              <label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">{t("settings.confirmPassword")}</label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={confirmPw}
                  onChange={e => setConfirmPw(e.target.value)}
                  placeholder={t("settings.repeatPassword")}
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
            {changingPw ? t("settings.changingPassword") : t("settings.changePassword")}
          </button>
        </motion.div>
      </div>
    </div>
  );
}
