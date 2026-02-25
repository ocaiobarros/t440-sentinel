# Guia de Instalação — FlowPulse

Este guia cobre a instalação do pacote `.deb` do FlowPulse via Google Drive e a configuração de permissões `sudoers`.

## Requisitos do Sistema

| Requisito | Mínimo |
|-----------|--------|
| **OS** | Ubuntu 22.04 LTS / Debian 12 |
| **RAM** | 4 GB |
| **CPU** | 2 vCPUs |
| **Disco** | 20 GB livres |
| **Node.js** | v18+ |

## Download do Pacote

O pacote `.deb` está disponível no Google Drive da equipe FlowPulse Labs:

```bash
# Instale o gdown para downloads diretos do Google Drive
pip3 install gdown

# Baixe o pacote (substitua FILE_ID pelo ID do arquivo compartilhado)
gdown --id <FILE_ID> -O flowpulse-latest.deb
```

Alternativamente, acesse o link compartilhado pelo administrador e baixe manualmente.

## Instalação

```bash
# Instale o pacote .deb
sudo dpkg -i flowpulse-latest.deb

# Resolva dependências faltantes (se houver)
sudo apt-get install -f

# Verifique a instalação
flowpulse --version
```

## Configuração de Permissões (sudoers)

Para que o serviço do FlowPulse execute scripts de coleta e atualização automática, configure o `sudoers`:

```bash
# Edite o arquivo sudoers com segurança
sudo visudo -f /etc/sudoers.d/flowpulse
```

Adicione as seguintes linhas:

```
# Permissões FlowPulse — coleta e atualização
flowpulse ALL=(ALL) NOPASSWD: /usr/bin/systemctl restart flowpulse
flowpulse ALL=(ALL) NOPASSWD: /usr/local/bin/flowpulse-update
flowpulse ALL=(ALL) NOPASSWD: /usr/bin/dpkg -i /tmp/flowpulse-*.deb
```

### Validação das Permissões

```bash
# Teste se o sudoers está correto (não deve retornar erros)
sudo visudo -c -f /etc/sudoers.d/flowpulse

# Teste a execução sem senha
sudo -u flowpulse sudo -n systemctl restart flowpulse
```

## Atualização Automática via Google Drive

O FlowPulse pode verificar atualizações automaticamente:

```bash
# Habilite o timer de atualização
sudo systemctl enable flowpulse-updater.timer
sudo systemctl start flowpulse-updater.timer

# Verifique o status
systemctl status flowpulse-updater.timer
```

O script de atualização verifica o Google Drive a cada 6 horas, baixa a versão mais recente e aplica via `dpkg`.

## Pós-Instalação

1. Acesse `http://<seu-servidor>:3060` no navegador
2. Crie a conta de administrador no primeiro acesso
3. Configure as conexões Zabbix em **Configurações → Conexões**
4. Pronto! Comece criando seu primeiro FlowMap ou Dashboard

## Suporte

- **Telegram**: [@flowpulselabsbot](https://t.me/flowpulselabsbot)
- **WhatsApp**: [+55 67 99290-3040](https://wa.me/5567992903040)
- **E-mail**: flowpulselabs@gmail.com
