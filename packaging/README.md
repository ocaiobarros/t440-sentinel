# FlowPulse — Packaging Debian (.deb)

## Visão Geral

O FlowPulse é empacotado como um `.deb` autossuficiente para instalação em servidores Debian 13+.

O pacote inclui:
- **Frontend React** compilado em `/usr/share/flowpulse/web/`
- **Backend Express** com `node_modules` em `/usr/lib/flowpulse/server/`
- **Node.js 22 LTS** embutido em `/opt/flowpulse/node/`
- **Config** em `/etc/flowpulse/flowpulse.env` (conffile preservado em upgrades)
- **systemd unit** com hardening completo
- **Nginx config** com security headers

## Build Local

```bash
# Na raiz do projeto
bash packaging/build-deb.sh 3.0.0
```

Resultado: `build/flowpulse_3.0.0_amd64.deb`

## Build via CI (GitHub Actions)

O workflow `.github/workflows/build-deb.yml` gera o `.deb` automaticamente:

- **Em tags `v*`**: cria Release no GitHub com o `.deb` anexado
- **Manual**: via `workflow_dispatch` informando a versão

## Instalação no Servidor

```bash
# Instalar (resolve dependências automaticamente)
apt install ./flowpulse_3.0.0_amd64.deb
```

O `postinst` faz automaticamente:
1. Cria usuário de serviço `flowpulse`
2. Gera secrets (JWT, DB password, Zabbix key)
3. Cria banco PostgreSQL + extensões
4. Aplica schema
5. Habilita e inicia o serviço
6. Configura Nginx

## Upgrade

```bash
dpkg -i flowpulse_3.1.0_amd64.deb
```

O `/etc/flowpulse/flowpulse.env` é marcado como **conffile** — o `dpkg` pergunta antes de sobrescrever.

## Remoção

```bash
# Remove binários, mantém dados e config
apt remove flowpulse

# Remove tudo (dados, config, usuário)
apt purge flowpulse
```

## Estrutura no Servidor

```
/usr/lib/flowpulse/server/    ← Backend + node_modules
/usr/share/flowpulse/web/     ← Frontend compilado
/opt/flowpulse/node/          ← Node.js runtime embutido
/etc/flowpulse/flowpulse.env  ← Configuração (conffile)
/var/lib/flowpulse/data/      ← Storage local
/lib/systemd/system/flowpulse.service
/etc/nginx/sites-available/flowpulse
```
