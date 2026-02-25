# FlowMap — Topologia Geoespacial

O **FlowMap** é o módulo de visualização geoespacial da rede, com topologia em tempo real e detecção de falhas.

## Criando um Mapa

1. Acesse **Operações → FlowMap**
2. Clique em **Novo Mapa**
3. Defina o nome e a região central
4. Comece a adicionar hosts e links

## Hosts

Adicione equipamentos de rede posicionados geograficamente no mapa:
- Roteadores, Switches, OLTs, POPs
- Status em tempo real via Zabbix (UP/DOWN/DEGRADED)
- Arrastar para reposicionar

## Links

Conexões entre hosts com roteamento viário automático:
- Cálculo de rota via OSRM (OpenStreetMap)
- Fallback para linha reta quando sem rota
- Capacidade configurável (Mbps/Gbps)
- Tráfego in/out em tempo real

## CTOs e Cabos

Infraestrutura de acesso (rede passiva):
- CTOs com controle de portas e ocupação
- Cabos com vértices editáveis no mapa
- Detecção de queda massiva

## War Room

Modo fullscreen para salas de operação NOC:
- Console de eventos em tempo real
- Alertas sonoros para hosts críticos
- Visualização otimizada para telões

## Viabilidade

Consulta de cobertura FTTH diretamente no mapa:
- Clique em qualquer ponto
- Busca a CTO mais próxima (raio de 200m)
- Mostra portas livres e ocupação
