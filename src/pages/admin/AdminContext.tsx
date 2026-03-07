import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useNavigate, Outlet } from "react-router-dom";
import { Shield, ChevronLeft, Crown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

/* ── Types ── */
export interface Profile {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  tenant_id: string;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: "admin" | "editor" | "viewer" | "tech" | "sales";
  tenant_id: string;
  created_at?: string;
}

export interface TenantInfo {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export async function getFunctionErrorMessage(err: any, fallback: string) {
  const context = err?.context;
  if (context?.clone && typeof context.clone === "function") {
    try {
      const j = await context.clone().json();
      if (typeof j?.error === "string" && j.error.trim()) return j.error;
      if (typeof j?.message === "string" && j.message.trim()) return j.message;
    } catch { /* */ }
    try {
      const t = await context.clone().text();
      if (typeof t === "string" && t.trim()) return t;
    } catch { /* */ }
  }
  if (typeof err?.message === "string" && err.message.trim()) return err.message;
  return fallback;
}

/* ── Context ── */
interface AdminCtxType {
  profiles: Profile[];
  roles: UserRole[];
  tenants: TenantInfo[];
  selectedTenantId: string | null;
  setSelectedTenantId: (id: string | null) => void;
  isSuperAdmin: boolean;
  loading: boolean;
  fetchData: () => Promise<void>;
  profileById: Map<string, Profile>;
  getRoleForUser: (userId: string, tenantId?: string | null) => string | null;
  getRoleBadgeVariant: (role: string) => "default" | "secondary" | "outline";
}

const AdminCtx = createContext<AdminCtxType>(null!);
export const useAdmin = () => useContext(AdminCtx);

/* ── Layout ── */
export default function AdminLayout() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [roles, setRoles] = useState<UserRole[]>([]);
  const [tenants, setTenants] = useState<TenantInfo[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const hasInit = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: isSA, error: isSAErr } = await supabase.rpc("is_super_admin", { p_user_id: user.id });
      if (isSAErr) throw isSAErr;
      const superAdmin = Boolean(isSA);
      setIsSuperAdmin(superAdmin);

      const { data: myRoles, error: myRErr } = await supabase.from("user_roles").select("role").eq("user_id", user.id);
      if (myRErr) throw myRErr;
      const hasAdminRole = (myRoles ?? []).some((r) => r.role === "admin");
      if (!superAdmin && !hasAdminRole) { setIsAdmin(false); setLoading(false); return; }
      setIsAdmin(true);

      let allTenants: TenantInfo[] = [];
      let nextProfiles: Profile[] = [];
      let nextRoles: UserRole[] = [];

      if (superAdmin) {
        const [tRes, mRes, pRes] = await Promise.all([
          supabase.functions.invoke("tenant-admin", { body: { action: "list" } }),
          supabase.functions.invoke("tenant-admin", { body: { action: "members" } }),
          supabase.from("profiles").select("*").order("created_at", { ascending: true }),
        ]);
        if (tRes.error || tRes.data?.error) {
          const { data } = await supabase.from("tenants").select("id, name, slug, created_at").order("created_at", { ascending: true });
          allTenants = (data ?? []) as TenantInfo[];
        } else {
          allTenants = (tRes.data?.tenants ?? []) as TenantInfo[];
        }

        if (mRes.error || mRes.data?.error) {
          const { data: rolesData, error: rolesError } = await supabase.from("user_roles").select("*");
          if (rolesError) throw rolesError;

          nextProfiles = (pRes.data ?? []) as Profile[];
          nextRoles = (rolesData ?? []) as UserRole[];
        } else {
          const edgeProfiles = (mRes.data?.profiles ?? []) as Profile[];
          const edgeRoles = (mRes.data?.roles ?? []) as UserRole[];
          const dbProfiles = (pRes.data ?? []) as Profile[];

          const mergedProfiles = new Map<string, Profile>();
          edgeProfiles.forEach((p) => mergedProfiles.set(p.id, p));
          dbProfiles.forEach((p) => mergedProfiles.set(p.id, p));

          nextProfiles = Array.from(mergedProfiles.values()).sort((a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
          );
          nextRoles = edgeRoles;
        }
      } else {
        const [tRes, mRes] = await Promise.all([
          supabase.from("tenants").select("id, name, slug, created_at").order("created_at", { ascending: true }),
          supabase.functions.invoke("tenant-admin", { body: { action: "members" } }),
        ]);
        if (tRes.error) throw tRes.error;
        allTenants = (tRes.data ?? []) as TenantInfo[];

        if (mRes.error || mRes.data?.error) {
          const [pRes, rRes] = await Promise.all([
            supabase.from("profiles").select("*").order("created_at", { ascending: true }),
            supabase.from("user_roles").select("*"),
          ]);
          if (pRes.error) throw pRes.error;
          if (rRes.error) throw rRes.error;
          nextProfiles = (pRes.data ?? []) as Profile[];
          nextRoles = (rRes.data ?? []) as UserRole[];
        } else {
          nextProfiles = (mRes.data?.profiles ?? []) as Profile[];
          nextRoles = (mRes.data?.roles ?? []) as UserRole[];
        }
      }

      setTenants(allTenants);
      setSelectedTenantId((cur) => {
        if (cur && allTenants.some((t) => t.id === cur)) return cur;
        if (cur === null && hasInit.current && allTenants.length > 1) return null;
        return allTenants[0]?.id ?? null;
      });
      hasInit.current = allTenants.length > 0;
      setProfiles(nextProfiles);
      setRoles(nextRoles);
    } catch (err: any) {
      toast({ variant: "destructive", title: "Erro", description: err?.message || "Falha ao carregar dados." });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const getRoleForUser = (userId: string, tenantId?: string | null) => {
    const tid = tenantId ?? selectedTenantId;
    if (!tid) return null;
    return roles.find((r) => r.user_id === userId && r.tenant_id === tid)?.role ?? null;
  };

  const getRoleBadgeVariant = (role: string) => {
    if (role === "admin") return "default" as const;
    if (role === "editor") return "secondary" as const;
    return "outline" as const;
  };

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-destructive mx-auto opacity-60" />
          <h1 className="text-2xl font-bold text-foreground font-[Orbitron]">Acesso Negado</h1>
          <p className="text-muted-foreground">Apenas administradores podem acessar esta área.</p>
          <Button variant="outline" onClick={() => navigate("/")}>
            <ChevronLeft className="w-4 h-4 mr-2" /> Voltar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <AdminCtx.Provider value={{ profiles, roles, tenants, selectedTenantId, setSelectedTenantId, isSuperAdmin, loading, fetchData, profileById, getRoleForUser, getRoleBadgeVariant }}>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-30">
          <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate("/app/operations/home")}>
              <ChevronLeft className="w-5 h-5" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                <Crown className="w-5 h-5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold font-[Orbitron] tracking-wider text-foreground">ADMINISTRATION</h1>
                <p className="text-xs text-muted-foreground font-mono">FLOWPULSE INTELLIGENCE — Gerenciamento</p>
              </div>
            </div>
            {isSuperAdmin && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-xs font-mono">
                <Crown className="w-3 h-3 mr-1" /> SUPER ADMIN
              </Badge>
            )}
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </AdminCtx.Provider>
  );
}
