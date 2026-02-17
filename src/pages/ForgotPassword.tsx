import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      toast({ variant: "destructive", title: "Erro", description: error.message });
    } else {
      setSent(true);
    }
    setLoading(false);
  };

  if (sent) {
    return (
      <AuthLayout title="E-mail enviado" subtitle="Verifique sua caixa de entrada">
        <div className="text-center space-y-4">
          <Mail className="w-12 h-12 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            Enviamos um link de recuperação para <span className="text-foreground font-medium">{email}</span>.
          </p>
          <Link to="/login">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Voltar ao login
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Recuperar senha" subtitle="Informe seu e-mail para receber o link">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="email" className="text-sm text-muted-foreground">E-mail</Label>
          <Input
            id="email"
            type="email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="bg-muted/50 border-border focus:border-primary"
          />
        </div>

        <Button type="submit" disabled={loading} className="w-full font-semibold">
          {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
          Enviar link
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
          <ArrowLeft className="w-3 h-3 inline mr-1" /> Voltar ao login
        </Link>
      </p>
    </AuthLayout>
  );
}
