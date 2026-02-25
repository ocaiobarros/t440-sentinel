import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, LogIn } from "lucide-react";

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const resolveEmail = (input: string): string => {
    const trimmed = input.trim();
    // If it looks like an email, use as-is; otherwise append @flowpulse.local
    if (trimmed.includes("@")) return trimmed;
    return `${trimmed}@flowpulse.local`;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const email = resolveEmail(identifier);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      toast({
        variant: "destructive",
        title: "Falha no login",
        description: error.message,
      });
    } else {
      navigate("/");
    }
    setLoading(false);
  };

  return (
    <AuthLayout title="Bem-vindo de volta" subtitle="Entre com suas credenciais">
      <form onSubmit={handleLogin} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="identifier" className="text-sm text-muted-foreground">Usuário ou E-mail</Label>
          <Input
            id="identifier"
            type="text"
            placeholder="admin ou seu@email.com"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            required
            className="bg-muted/50 border-border focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password" className="text-sm text-muted-foreground">Senha</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-primary hover:text-primary/80 transition-colors"
            >
              Esqueceu a senha?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-muted/50 border-border focus:border-primary"
          />
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full font-semibold"
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <LogIn className="w-4 h-4 mr-2" />
          )}
          Entrar
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground/60 mt-6">
        Acesso restrito. Contate o administrador para obter credenciais.
      </p>
      <p className="text-center text-[9px] text-muted-foreground/30 mt-2 font-mono tracking-wider">
        Powered by <span className="text-muted-foreground/50 font-semibold">CBLabs</span>
      </p>
    </AuthLayout>
  );
}
