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
1. Selecione um mapa para ver os links
2. Selecione um link para abrir a escolha de período
3. Escolha o período do gráfico: **1 Hora**, **6 Horas** ou **24 Horas**
4. O Bot envia o status "Enviando foto..." e gera o gráfico automaticamente
5. A legenda inclui: nome do link, período, picos de tráfego IN/OUT e número de métricas

### Gráficos de Tráfego

Ao selecionar um período, o Bot gera um gráfico de linha via QuickChart contendo:

| Campo | Descrição |
| --- | --- |
| **Eixo X** | Horários do intervalo selecionado |
| **Eixo Y** | Tráfego em Mbps |
| **Linha Azul** | Tráfego de entrada (IN ▼) |
| **Linha Verde** | Tráfego de saída (OUT ▲) |
| **Legenda** | Nome do link, capacidade, status, período e picos |

## Alertas Automáticos

O bot envia notificações automáticas para:
- ⬇️ Queda de sessão BGP
- 🔴 Host crítico DOWN
- ⚠️ CPU acima do limiar configurado
- 🔐 Acessos administrativos

## Segurança

O webhook do Telegram é registrado via Edge Function com bypass de JWT para permitir comunicações seguras vindas dos servidores do Telegram.
