# FlowPulse — Dashboard Builder

O **Dashboard Builder** permite criar painéis de monitoramento personalizados com widgets interativos.

## Criando um Dashboard

1. Acesse **Monitoramento → Dashboards**
2. Clique em **Novo Dashboard**
3. Conecte uma fonte de dados Zabbix
4. Arraste widgets da paleta para o canvas

## Tipos de Widget

| Widget | Descrição |
|--------|-----------|
| **Stat** | Valor numérico com ícone e cor |
| **Gauge** | Medidor circular com thresholds |
| **Progress** | Barra de progresso horizontal |
| **Timeseries** | Gráfico temporal com múltiplas séries |
| **Table** | Tabela de dados com ordenação |
| **Status** | Indicador de status UP/DOWN |
| **Traffic Light** | Semáforo com 3 estados |
| **Image Map** | Mapa de imagem com hotspots |
| **Label** | Texto estático formatado |
| **Battery Bar** | Indicador de nível tipo bateria |

## Conexão Zabbix

Cada dashboard pode ser vinculado a uma conexão Zabbix para buscar dados em tempo real:
- Items e Triggers
- History e Trends
- Host groups

## Configurações

- **Refresh interval**: Intervalo de atualização (5s a 5min)
- **Color scheme**: Paleta de cores personalizável
- **Grid**: Layout responsivo com drag & drop

## Exportação

Dashboards podem ser exportados como PDF para relatórios e apresentações.
