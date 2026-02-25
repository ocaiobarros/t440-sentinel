# BGP Flow Monitor

O módulo **BGP Flow Monitor** permite monitorar sessões BGP, tráfego por ASN e integridade de peering em tempo real.

## Configuração Inicial

1. Acesse **Monitoramento → BGP Flow** e clique em **Novo**
2. Selecione o hardware (Huawei NE8000, Datacom DM4770, etc.)
3. Configure as credenciais SSH (host, porta, usuário e senha)
4. Confirme e conecte

## Funcionalidades

### Peering Wall
Visão consolidada de todas as sessões BGP com status em tempo real (Established/Down), uptime, prefixos recebidos e bandwidth.

### Visão BGP / Flow
Gráfico Sankey mostrando o fluxo de tráfego entre ASNs, com categorização automática por tipo (Transit, IX/Peering, CDN, Enterprise).

### Estabilidade (Flap History)
Histórico de flaps nas últimas 24h com contagem total e timeline visual por sessão.

### Geo-BGP
Mapa geográfico mostrando a origem dos peers com base nos dados de registro LACNIC/Registro.br.

### Resumo de Rede
Top 10 por subnet, AS, aplicação, protocolo, grupo de interfaces e dispositivos com métricas de tráfego in/out.

## Coletor de Dados

Para enviar dados ao dashboard, use o script coletor:

```bash
wget https://<seu-domínio>/scripts/ne8000-bgp-collector.sh
export ROUTER_HOST="10.150.255.1"
export COLLECTOR_URL="https://<project>.supabase.co/functions/v1/bgp-collector"
bash ne8000-bgp-collector.sh
```

## Alertas

Configure alertas de queda de sessão BGP via Telegram no módulo **Configurações → Telegram**.
