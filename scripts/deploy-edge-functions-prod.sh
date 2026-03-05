#!/usr/bin/env bash
set -euo pipefail

PROJECT_REF="${1:-mlmvnngtmptiuvjvnivb}"
FUNCTIONS_DIR="supabase/functions"

if ! command -v npx >/dev/null 2>&1; then
  echo "❌ npx não encontrado. Instale Node.js/npm antes de continuar."
  exit 1
fi

if [ ! -d "$FUNCTIONS_DIR" ]; then
  echo "❌ Diretório $FUNCTIONS_DIR não encontrado."
  exit 1
fi

FUNCTION_NAMES="$(find "$FUNCTIONS_DIR" -mindepth 1 -maxdepth 1 -type d | sed 's#.*/##' | grep -v '^_' | sort)"

if [ -z "$FUNCTION_NAMES" ]; then
  echo "❌ Nenhuma edge function encontrada em $FUNCTIONS_DIR"
  exit 1
fi

echo "🔗 Linkando projeto: $PROJECT_REF"
npx supabase link --project-ref "$PROJECT_REF"

echo "🚀 Deploy de todas as edge functions para $PROJECT_REF"
for fn in $FUNCTION_NAMES; do
  echo "  • Deploy: $fn"
  npx supabase functions deploy "$fn" --no-verify-jwt --project-ref "$PROJECT_REF"
done

echo "✅ Sincronização concluída."
