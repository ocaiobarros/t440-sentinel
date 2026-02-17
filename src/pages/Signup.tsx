import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import AuthLayout from "@/components/auth/AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Loader2, UserPlus, CheckCircle2 } from "lucide-react";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const { toast } = useToast();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: name },
        emailRedirectTo: window.location.origin,
      },
    });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro no cadastro",
        description: error.message,
      });
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  if (success) {
    return (
      <AuthLayout title="Verifique seu e-mail" subtitle="Enviamos um link de confirmação">
        <div className="text-center space-y-4">
          <CheckCircle2 className="w-12 h-12 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            Acesse <span className="text-foreground font-medium">{email}</span> e clique no link de verificação para ativar sua conta.
          </p>
          <Link to="/login">
            <Button variant="outline" className="mt-4">
              Voltar ao login
            </Button>
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Criar conta" subtitle="Comece a monitorar em minutos">
      <form onSubmit={handleSignup} className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="name" className="text-sm text-muted-foreground">Nome</Label>
          <Input
            id="name"
            type="text"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            maxLength={100}
            className="bg-muted/50 border-border focus:border-primary"
          />
        </div>

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

        <div className="space-y-2">
          <Label htmlFor="password" className="text-sm text-muted-foreground">Senha</Label>
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

        <Button type="submit" disabled={loading} className="w-full font-semibold">
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin mr-2" />
          ) : (
            <UserPlus className="w-4 h-4 mr-2" />
          )}
          Criar conta
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground mt-6">
        Já tem uma conta?{" "}
        <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
          Entrar
        </Link>
      </p>
    </AuthLayout>
  );
}
