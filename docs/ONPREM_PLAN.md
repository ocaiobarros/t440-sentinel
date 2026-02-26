# FlowPulse — Plano de Migração On-Premise

> Data: 2026-02-26

---

## Contexto

O FlowPulse utiliza **7 serviços do Supabase** em produção:
1. GoTrue (Auth) — login, JWT, sessions
2. PostgREST — CRUD em 25+ tabelas, 6 RPCs
3. Realtime — 5 canais (2 postgres_changes, 3 broadcast)
4. Storage — 2 buckets (dashboard-assets, flowmap-attachments)
5. Edge Functions — 20 funções Deno
6. PostgreSQL — 25 tabelas, 63 RLS policies, 17 funções PL/pgSQL, 8+ ENUMs
7. Kong Gateway — roteamento unificado

---

## Trilha A: Supabase Self-Hosted (RECOMENDADA)

### Princípio
Implantar o stack oficial Supabase via Docker no servidor do cliente. **Zero mudanças no código React.**

### Arquitetura

```
┌─────────────────────────────────────┐
│         Servidor On-Premise          │
│                                      │
│  ┌────────┐  ┌──────────────────┐   │
│  │ Nginx  │──│ Kong Gateway     │   │
│  │ :443   │  │ :8000            │   │
│  └────────┘  └──────┬───────────┘   │
│                     │               │
│    ┌────────────────┼────────────┐  │
│    │     Supabase Docker Stack    │  │
│    │                              │  │
│    │  GoTrue    PostgREST         │  │
│    │  Realtime  Storage (MinIO)   │  │
│    │  Edge Runtime (Deno)         │  │
│    │  PostgreSQL 15               │  │
│    └──────────────────────────────┘  │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  Redis (local ou container)   │   │
│  └──────────────────────────────┘   │
│                                      │
│  ┌──────────────────────────────┐   │
│  │  OSRM (container, opcional)   │   │
│  └──────────────────────────────┘   │
└─────────────────────────────────────┘
```

### Etapas

| Fase | Tarefa | Esforço | Risco |
|------|--------|---------|-------|
| **1** | Clonar `supabase/supabase` Docker, configurar `.env` | 2h | Baixo |
| **2** | Aplicar schema completo (tabelas, RLS, funções, triggers, ENUMs) | 1h | Baixo |
| **3** | Configurar secrets (ZABBIX_ENCRYPTION_KEY, etc.) | 30min | Baixo |
| **4** | Deploiar Edge Functions via `supabase functions deploy` local | 2h | Médio — verificar compatibilidade Deno runtime |
| **5** | Configurar Redis local (substituir Upstash) para flowpulse-reactor | 1h | Baixo |
| **6** | Configurar OSRM local (substituir router.project-osrm.org) para flowmap-route | 1h | Baixo — opcional |
| **7** | Refatorar 2 URLs hardcoded (`VITE_SUPABASE_PROJECT_ID + .supabase.co`) para usar `VITE_SUPABASE_URL` | 30min | Baixo |
| **8** | Build frontend com variáveis locais | 15min | Zero |
| **9** | Configurar Nginx + SSL | 1h | Baixo |
| **10** | Smoke test completo | 1h | — |
| **11** | Seed admin user via `seed-admin` edge function | 15min | Baixo |

**Total estimado: ~10h de trabalho técnico**

### Mudanças no Código (mínimas)

1. **`src/pages/BgpFlowMonitor.tsx`** (linhas 753, 1046): Trocar `https://${projectId}.supabase.co/functions/v1/` por `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/`
2. **`src/pages/TelegramSettings.tsx`** (linha 129): Mesma correção
3. **`flowpulse-reactor`**: Trocar Upstash por Redis local (alterar URL/token nos secrets)

### Pré-requisitos do Servidor

| Recurso | Mínimo | Recomendado |
|---------|--------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Disco | 50 GB SSD | 100 GB SSD |
| SO | Debian 12+/Ubuntu 22+ | Debian 13 |
| Docker | 24+ | 27+ |
| Docker Compose | v2.20+ | v2.30+ |

---

## Trilha B: Backend Próprio (Express/Fastify)

### Princípio
Substituir cada serviço Supabase por implementação customizada. **Requer refatoração significativa.**

### Mapeamento de Esforço

| Serviço | Substituto | Esforço | Risco |
|---------|-----------|---------|-------|
| GoTrue (Auth) | Passport.js + bcrypt + JWT | 3-5 dias | **Alto** — recriar flows de reset password, session refresh, onAuthStateChange |
| PostgREST (CRUD) | Express rotas + pg pool | 5-8 dias | **Alto** — emular filtros, ordering, embedding, error shapes do PostgREST |
| PostgREST (RPC) | Express + pg `SELECT func()` | 1-2 dias | Médio — 6 funções, shapes conhecidos |
| Realtime (postgres_changes) | pg_notify + WebSocket (ws) | 3-5 dias | **Alto** — emular protocolo de subscription do Supabase |
| Realtime (broadcast) | Socket.io / ws rooms | 2-3 dias | Médio |
| Storage | Express + multer + fs | 2-3 dias | Médio — emular getPublicUrl, list, ACLs |
| Edge Functions (20) | Express routes ou microservices | 5-10 dias | **Alto** — converter Deno → Node.js, testar cada uma |
| RLS (63 policies) | Middleware WHERE tenant_id | 3-5 dias | **Crítico** — cada tabela precisa de validação manual |
| Kong Gateway | Nginx reverse proxy | 1 dia | Baixo |

**Total estimado: 25-42 dias de desenvolvimento**

### Riscos Principais

1. **Paridade funcional**: Difícil garantir que o `supabase-js` SDK funcione com backend customizado
2. **Bugs sutis**: Filtros PostgREST (.eq, .in, .order, .limit, Prefer headers) têm comportamentos específicos
3. **Auth state**: `onAuthStateChange` do SDK espera protocolo GoTrue específico
4. **Manutenção**: Cada atualização do frontend pode quebrar compatibilidade com backend custom
5. **Segurança**: Reimplementar RLS manualmente é propenso a vazamentos de dados entre tenants

---

## Recomendação Final

| Critério | Trilha A (Self-Hosted) | Trilha B (Custom) |
|----------|----------------------|-------------------|
| **Esforço** | ~10h | ~200h (25-42 dias) |
| **Risco** | Baixo | Alto |
| **Paridade funcional** | 100% | ~90% (bugs esperados) |
| **Mudanças no código** | 3 linhas | ~5000+ linhas |
| **Manutenção futura** | Igual ao cloud | Dobro do esforço |
| **Air-gap** | ✅ Completo | ✅ Completo |
| **Docker necessário** | ✅ Sim | ❌ Não |

### **→ Trilha A é a escolha clara.**

Docker é o único requisito adicional, e a maioria dos servidores enterprise já possui. O retorno é paridade total com zero refatoração do frontend.

---

## Próximos Passos

1. Validar pré-requisitos do servidor (Docker, RAM, disco)
2. Gerar `docker-compose.yml` customizado com todas as variáveis do FlowPulse
3. Criar script de migração do schema (`docs/DATABASE_SCHEMA_AND_RLS.md`)
4. Testar Edge Functions no runtime local
5. Automatizar deploy via `.deb` que inclui Docker Compose
