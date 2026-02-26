# FlowPulse — Troubleshooting On-Premise

> Guia de diagnóstico e correção para deploy Docker local.
> Data: 2026-02-26

---

## 1. Script de Diagnóstico

Antes de qualquer correção, colete o relatório completo:

```bash
bash scripts/diagnose-onprem.sh
```

O script gera um arquivo `diagnose-report-YYYYMMDD_HHMMSS.txt` com:
- Status de todos os containers
- Health checks (Auth, REST, Functions)
- Teste de login do admin
- Teste da function `invite-user` (criação de usuário)
- Listagem de tenants via REST
- Últimas 30 linhas de log de cada container
- Verificação do volume de Functions
- Verificação de tabelas e RPCs no banco

---

## 2. Problemas Conhecidos e Soluções

### 2.1 Criação de Usuário não Funciona

**Sintoma:** Botão "Adicionar Usuário" no Admin Hub retorna erro ou não faz nada.

**Diagnóstico:**
```bash
# Verificar se a function invite-user existe no container
docker exec $(docker compose -f deploy/docker-compose.onprem.yml ps -q functions) \
  ls -la /home/deno/functions/invite-user/

# Verificar logs da function
docker compose -f deploy/docker-compose.onprem.yml logs --tail=50 functions | grep -i invite
```

**Causas possíveis:**
1. Volume não montado → verificar `docker-compose.onprem.yml` linha `../supabase/functions:/home/deno/functions:ro`
2. Erro de importação no Deno → verificar logs do container `functions`
3. `SUPABASE_SERVICE_ROLE_KEY` não configurada → verificar `deploy/.env`

**Solução:**
```bash
# Recriar o container com código atualizado
docker compose -f deploy/docker-compose.onprem.yml restart functions

# Se persistir, rebuild completo
docker compose -f deploy/docker-compose.onprem.yml down
docker compose -f deploy/docker-compose.onprem.yml up -d
```

### 2.2 Vincular Usuário a Organização não Funciona

**Sintoma:** Usuário criado mas fica em organização errada ou sem organização.

**Diagnóstico:**
```bash
# Verificar profiles e roles
docker exec $(docker compose -f deploy/docker-compose.onprem.yml ps -q db) \
  psql -U supabase_admin -d postgres -c "
    SELECT p.email, p.tenant_id, t.name as tenant_name, ur.role
    FROM profiles p
    LEFT JOIN tenants t ON t.id = p.tenant_id
    LEFT JOIN user_roles ur ON ur.user_id = p.id
    ORDER BY p.created_at DESC
    LIMIT 10;
  "
```

**Causa raiz:** O trigger `handle_new_user` cria automaticamente um tenant para cada usuário novo. A function `invite-user` deve limpar esse tenant e mover o usuário para o tenant correto.

**Solução manual (se necessário):**
```bash
docker exec $(docker compose -f deploy/docker-compose.onprem.yml ps -q db) \
  psql -U supabase_admin -d postgres -c "
    -- Mover usuário para o tenant correto
    UPDATE profiles SET tenant_id = '<TARGET_TENANT_ID>' WHERE email = '<USER_EMAIL>';
    DELETE FROM user_roles WHERE user_id = (SELECT id FROM profiles WHERE email = '<USER_EMAIL>');
    INSERT INTO user_roles (user_id, tenant_id, role)
    VALUES ((SELECT id FROM profiles WHERE email = '<USER_EMAIL>'), '<TARGET_TENANT_ID>', 'viewer');
  "
```

### 2.3 Sair da Visualização da Organização não Funciona

**Sintoma:** Não existe botão para fechar o painel de detalhes da organização.

**Solução:** O botão X foi adicionado no `TenantsPage.tsx` e no `AdminHub.tsx`. Após `git pull`, reconstrua o frontend:

```bash
npm ci && npm run build
cp -r dist/ deploy/dist/
docker compose -f deploy/docker-compose.onprem.yml restart nginx
```

### 2.4 Edge Functions retornam 404

**Diagnóstico:**
```bash
# Testar o router principal
curl -v http://localhost:8000/functions/v1/ \
  -H "Authorization: Bearer $ANON_KEY"

# Testar function específica
curl -v http://localhost:8000/functions/v1/invite-user \
  -X OPTIONS
```

**Solução:** Verificar se o `main/index.ts` está no volume:
```bash
docker exec $(docker compose -f deploy/docker-compose.onprem.yml ps -q functions) \
  cat /home/deno/functions/main/index.ts | head -5
```

---

## 3. Fluxo de Atualização Completo

Quando há correções no código, siga este fluxo:

```bash
# 1. Puxar as alterações
git pull origin main

# 2. Rebuild do frontend
npm ci && npm run build

# 3. Copiar dist para o deploy
cp -r dist/ deploy/dist/

# 4. Reiniciar os containers afetados
docker compose -f deploy/docker-compose.onprem.yml restart functions nginx

# 5. Rodar diagnóstico
bash scripts/diagnose-onprem.sh

# 6. Verificar relatório
cat diagnose-report-*.txt | tail -50
```

---

## 4. Coleta de Logs para Suporte

```bash
# Gerar pacote de diagnóstico completo
bash scripts/diagnose-onprem.sh 2>&1 | tee support-bundle.txt

# Ou coletar logs manualmente
docker compose -f deploy/docker-compose.onprem.yml logs --since=1h > docker-logs-$(date +%s).txt
```
