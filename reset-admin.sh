#!/bin/bash
# ┌──────────────────────────────────────────────────────────────┐
# │  FlowPulse CLI — Reset de senha do administrador mestre     │
# │  Uso: bash reset-admin.sh                                   │
# │  Requer: acesso físico ao servidor + docker rodando         │
# └──────────────────────────────────────────────────────────────┘

set -euo pipefail

ADMIN_EMAIL="admin@flowpulse.local"
DB_CONTAINER="${SUPABASE_DB_CONTAINER:-supabase-db}"

echo "╔══════════════════════════════════════════╗"
echo "║   FlowPulse — Reset de Senha do Admin   ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Conta alvo: $ADMIN_EMAIL"
echo ""

read -sp "Digite a nova senha para o admin: " NEW_PASSWORD
echo ""

if [ ${#NEW_PASSWORD} -lt 6 ]; then
  echo "❌ Erro: A senha deve ter pelo menos 6 caracteres."
  exit 1
fi

read -sp "Confirme a nova senha: " CONFIRM_PASSWORD
echo ""

if [ "$NEW_PASSWORD" != "$CONFIRM_PASSWORD" ]; then
  echo "❌ Erro: As senhas não coincidem."
  exit 1
fi

echo ""
echo "⏳ Atualizando senha no banco de dados..."

docker exec -i "$DB_CONTAINER" psql -U postgres -d postgres -c "
UPDATE auth.users
SET encrypted_password = crypt('$NEW_PASSWORD', gen_salt('bf'))
WHERE email = '$ADMIN_EMAIL';
"

if [ $? -eq 0 ]; then
  echo "✅ Senha do Admin ($ADMIN_EMAIL) atualizada com sucesso!"
else
  echo "❌ Falha ao atualizar a senha. Verifique se o container '$DB_CONTAINER' está rodando."
  exit 1
fi
