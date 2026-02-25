# Bot do Telegram

O **Bot do Telegram** do FlowPulse permite receber alertas e consultar o status da rede diretamente no Telegram.

## Configuração

1. Acesse **Configurações → Telegram**
2. Insira o **Bot Token** obtido via [@BotFather](https://t.me/BotFather)
3. Configure o **Chat ID** do grupo ou usuário que receberá os alertas
4. Salve e teste a conexão

## Comandos Disponíveis

### `/status`
Retorna a saúde geral do sistema:
- Hosts online/offline
- Incidentes abertos
- Uptime global

### `/flowmaps`
Lista os FlowMaps disponíveis com navegação interativa:
- Selecione um mapa para ver detalhes
- Visualize gráficos de tráfego dos links
- Receba imagens geradas automaticamente via QuickChart

## Alertas Automáticos

O bot envia notificações automáticas para:
- ⬇️ Queda de sessão BGP
- 🔴 Host crítico DOWN
- ⚠️ CPU acima do limiar configurado
- 🔐 Acessos administrativos

## Segurança

O webhook do Telegram é registrado via Edge Function com bypass de JWT para permitir comunicações seguras vindas dos servidores do Telegram.
