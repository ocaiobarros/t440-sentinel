

## Plataformas 100% Compatíveis para Hospedar o FlowPulse Fora da Lovable

### Arquitetura Atual

O FlowPulse é composto por duas camadas:

1. **Frontend**: React 18 + TypeScript (SPA estática — `npm run build` gera uma pasta `dist/`)
2. **Backend**: PostgreSQL 15 + GoTrue (Auth) + PostgREST (API) + Realtime (WebSocket) + Storage + 20 Edge Functions (Deno/TypeScript)

O backend usa **100% da API do Supabase** (`supabase-js` SDK). Portanto, a plataforma de destino precisa ser compatível com o protocolo Supabase.

---

### Opção 1: Supabase Cloud (RECOMENDADA — Zero Refatoração)

```text
┌─────────────────────────────┐     ┌──────────────────────────┐
│  Frontend (SPA estática)    │     │  Supabase Cloud          │
│  Vercel / Netlify / Nginx   │────▶│  supabase.com            │
│  dist/ servido via CDN      │     │  PostgreSQL + Auth +     │
│                             │     │  Edge Functions + Storage │
└─────────────────────────────┘     └──────────────────────────┘
```

- **Compatibilidade**: 100% — o `supabase-js` SDK funciona nativamente
- **Mudanças no código**: Apenas trocar 3 variáveis de ambiente (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`)
- **Edge Functions**: Deploy direto com `supabase functions deploy`
- **Banco**: Exportar schema via SQL e aplicar no novo projeto
- **Custo**: Plano gratuito disponível, Pro a partir de $25/mês

**Passos**:
1. Criar conta em [supabase.com](https://supabase.com)
2. Criar projeto e aplicar o schema (`deploy/schema_cblabs_full.sql`)
3. Configurar secrets (Zabbix, Telegram, etc.)
4. Deploy das 20 Edge Functions via CLI
5. Build do frontend com as novas variáveis
6. Hospedar o `dist/` em Vercel, Netlify ou qualquer servidor Nginx

---

### Opção 2: Supabase Self-Hosted via Docker (On-Premise)

Já documentado nos seus arquivos `docs/ONPREM_DOCKER.md` e `deploy/docker-compose.onprem.yml`.

- **Compatibilidade**: 100%
- **Mudanças no código**: 3 variáveis de ambiente
- **Requisitos**: Servidor com Docker (4+ cores, 8+ GB RAM)
- **Custo**: Apenas infraestrutura (VPS ou servidor físico)

---

### Opção 3: VPS + Docker (DigitalOcean, Hetzner, AWS EC2)

Mesma arquitetura da Opção 2, mas rodando em um VPS na nuvem.

- **Compatibilidade**: 100%
- **Provedores recomendados**: Hetzner (custo-benefício), DigitalOcean, AWS EC2, Contabo
- **Custo**: A partir de ~$20/mês para um servidor adequado

---

### O que NÃO é compatível (exigiria reescrita)

| Plataforma | Problema |
|---|---|
| Firebase | SDK incompatível, Auth diferente, sem PostgREST |
| PlanetScale / Neon (só DB) | Sem Auth, sem Edge Functions, sem Storage |
| AWS Amplify | SDK próprio, Auth Cognito incompatível |
| Backend próprio (Express) | 25-42 dias de reescrita (documentado em `docs/ONPREM_PLAN.md`) |

---

### Processo de Migração (para Supabase Cloud)

1. Exportar o schema completo do banco de dados atual
2. Criar novo projeto Supabase e aplicar schema + seed
3. Configurar os 8 secrets necessários
4. Deploy das 20 Edge Functions via `supabase functions deploy`
5. Conectar repositório GitHub (exportar de Lovable via Settings > GitHub)
6. Build do frontend: `npm run build` com novas variáveis `.env`
7. Deploy do `dist/` em Vercel/Netlify (conectar ao mesmo repo GitHub)
8. Smoke test completo

**Esforço estimado: 4-6 horas**

---

### Resumo

| Critério | Supabase Cloud | Self-Hosted Docker | Backend Custom |
|---|---|---|---|
| Compatibilidade | 100% | 100% | ~90% |
| Mudanças no código | 3 variáveis | 3 variáveis | 5000+ linhas |
| Esforço | 4-6h | 8-10h | 200h+ |
| Custo mensal | ~$25 | Infra própria | Infra + dev |

**Recomendação**: Supabase Cloud + Vercel/Netlify para o frontend. Zero refatoração, máxima confiabilidade.

