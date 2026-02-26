#!/bin/bash
# ╔══════════════════════════════════════════════════════════════════╗
# ║  FLOWPULSE — Parity Scan                                        ║
# ║  Varre o código e gera inventário de chamadas Supabase           ║
# ║  Output: docs/generated_endpoints.txt                            ║
# ╚══════════════════════════════════════════════════════════════════╝

set -euo pipefail

OUT="docs/generated_endpoints.txt"
mkdir -p docs

{
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║  FlowPulse — Generated Endpoint Inventory                   ║"
echo "║  Gerado em: $(date -u '+%Y-%m-%d %H:%M:%S UTC')                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  1. supabase.from() — PostgREST table calls"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'supabase\.from(' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  sed 's/.*supabase\.from("\([^"]*\)").*/\1/' | \
  sort | uniq -c | sort -rn | \
  while read count table; do
    printf "  %-40s %s calls\n" "$table" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  2. supabase.rpc() — PostgREST RPC calls"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'supabase\.rpc(' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  sed 's/.*supabase\.rpc("\([^"]*\)".*/\1/' | \
  sort | uniq -c | sort -rn | \
  while read count rpc; do
    printf "  %-40s %s calls\n" "$rpc" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  3. supabase.functions.invoke() — Edge Function calls"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'functions\.invoke(' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  sed 's/.*functions\.invoke("\([^"]*\)".*/\1/' | \
  sort | uniq -c | sort -rn | \
  while read count fn; do
    printf "  %-40s %s calls\n" "$fn" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  4. supabase.storage — Storage calls"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'supabase\.storage' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  sed 's/.*\.from("\([^"]*\)").*/bucket: \1/' | \
  sort | uniq -c | sort -rn | \
  while read count bucket; do
    printf "  %-40s %s calls\n" "$bucket" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  5. supabase.channel() — Realtime channels"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn '\.channel(' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  grep -v node_modules | \
  sed 's/.*\.channel("\([^"]*\)".*/\1/' 2>/dev/null | \
  sort | uniq -c | sort -rn | \
  while read count ch; do
    printf "  %-40s %s uses\n" "$ch" "$count"
  done 2>/dev/null || echo "  (nenhum canal encontrado)"
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  6. supabase.auth.* — Auth method calls"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'supabase\.auth\.' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  sed 's/.*supabase\.auth\.\([a-zA-Z]*\).*/\1/' | \
  sort | uniq -c | sort -rn | \
  while read count method; do
    printf "  %-40s %s calls\n" "$method" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  7. fetch() direto com /functions/v1 — Bypass SDK"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'functions/v1/' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  grep -v node_modules | \
  sed 's|.*functions/v1/\([a-zA-Z0-9_-]*\).*|\1|' | \
  sort | uniq -c | sort -rn | \
  while read count fn; do
    printf "  %-40s %s refs\n" "$fn" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  8. import.meta.env.* — Environment variables"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'import\.meta\.env\.' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  grep -v node_modules | \
  sed 's/.*import\.meta\.env\.\([A-Z_]*\).*/\1/' | \
  sort | uniq -c | sort -rn | \
  while read count var; do
    printf "  %-40s %s refs\n" "$var" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  9. Edge Functions — Deno.env.get() secrets"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'Deno\.env\.get(' supabase/functions/ --include='*.ts' 2>/dev/null | \
  sed 's/.*Deno\.env\.get("\([^"]*\)".*/\1/' | \
  sort | uniq -c | sort -rn | \
  while read count secret; do
    printf "  %-40s %s refs\n" "$secret" "$count"
  done
echo ""

echo "═══════════════════════════════════════════════════════════════"
echo "  10. Referências a .supabase.co (URLs hardcoded)"
echo "═══════════════════════════════════════════════════════════════"
echo ""
grep -rn 'supabase\.co' src/ --include='*.ts' --include='*.tsx' 2>/dev/null | \
  grep -v node_modules | \
  while IFS= read -r line; do
    echo "  ⚠️  $line"
  done
echo ""

echo "══════════════════════════════════════════════════════════════"
echo "  FIM DO RELATÓRIO"
echo "══════════════════════════════════════════════════════════════"

} > "$OUT"

echo "✅ Relatório gerado em: $OUT"
echo "   $(wc -l < "$OUT") linhas"
