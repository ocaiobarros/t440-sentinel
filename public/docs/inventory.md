# Inventário de Ativos

O módulo **Inventário** centraliza a gestão de Hosts, CTOs e Cabos da sua rede.

## Hosts

Equipamentos de rede monitorados via Zabbix (roteadores, switches, OLTs, etc.).

- **Status**: UP / DOWN em tempo real
- **Grupo**: Agrupamento lógico do Zabbix
- **Role**: Tipo de ícone (router, switch, olt, etc.)
- **Localização**: Coordenadas geográficas no FlowMap

## CTOs (Caixas de Terminação Óptica)

Pontos de distribuição de fibra com controle de capacidade.

- **Capacidade**: 8, 16 ou 32 portas
- **Ocupação**: Portas ocupadas vs livres
- **Status**: OK, DEGRADED, CRITICAL ou UNKNOWN

## Cabos

Infraestrutura de cabos com tipos:
- **AS**: Auto-sustentado
- **ASU**: Auto-sustentado com mensageiro
- **Geleado**: Gel preenchido
- **ADSS**: All-Dielectric Self-Supporting

## Import/Export

- **KML**: Importe/exporte pontos e rotas no formato Google Earth
- **CSV**: Exporte dados tabulares para análise em planilhas

## Filtros

Filtre por mapa, grupo, status e pesquisa textual.
