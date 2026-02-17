import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, KeyRound, CheckCircle2 } from "lucide-react";

export default function ResetPassword() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event) => {
        if (event === "PASSWORD_RECOVERY") {
          setReady(true);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirm) {
      toast({ variant: "destructive", title: "Erro", description: "As senhas não coincidem." });
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } else {
      toast({ title: "Senha atualizada!", description: "Você será redirecionado." });
      setTimeout(() => navigate("/"), 1500);
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <AuthLayout title="Link inválido" subtitle="Este link de recuperação expirou ou é inválido">
        <div className="text-center">
          <Button variant="outline" onClick={() => navigate("/forgot-password")}>
            Solicitar novo link
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Nova senha" subtitle="Defina sua nova senha">
      <form onSubmit={handleReset} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm text-muted-foreground">Nova senha</Label>
          <Input
            id="password"
            type="password"
            placeholder="Mín. 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            className="bg-muted/50 border-border focus:border-primary"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm" className="text-sm text-muted-foreground">Confirmar senha</Label>
          <Input
            id="confirm"
            type="password"
            placeholder="Repita a senha"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
            className="bg-muted/50 border-border focus:border-primary"
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full font-semibold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <KeyRound className="w-4 h-4 mr-2" />}
          Atualizar senha
        </Button>
      </form>
    </AuthLayout>
  );
}
