#!/usr/bin/env bash
# ┌──────────────────────────────────────────────────────────────────────┐
# │  FlowPulse — Coletor BGP/Flow para Huawei NE8000                   │
# │  Extrai: bgp peer, netstream cache, interface brief, health        │
# │  Envia para o endpoint bgp-collector via curl a cada N segundos    │
# │                                                                      │
# │  Dependências: expect, curl, jq                                     │
# │  Uso: bash ne8000-bgp-collector.sh                                  │
# │  Configuração via variáveis de ambiente ou edição direta abaixo     │
# └──────────────────────────────────────────────────────────────────────┘
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO — edite conforme seu ambiente
# ══════════════════════════════════════════════════════════════════════
ROUTER_HOST="${ROUTER_HOST:-10.150.255.1}"
ROUTER_USER="${ROUTER_USER:-admin}"
ROUTER_PASS="${ROUTER_PASS:-admin@123}"
ROUTER_PORT="${ROUTER_PORT:-22}"
CONFIG_ID="${CONFIG_ID:-ne8000-cgr01}"
VENDOR="${VENDOR:-huawei}"
MODEL="${MODEL:-NE8000-M8}"
LOCAL_ASN="${LOCAL_ASN:-61614}"

# Endpoint do bgp-collector (Edge Function)
COLLECTOR_URL="${COLLECTOR_URL:-https://wbtpefszwywgmnqssrgx.supabase.co/functions/v1/bgp-collector}"

# Intervalo de coleta em segundos
INTERVAL="${INTERVAL:-30}"

# Timeout SSH em segundos
SSH_TIMEOUT="${SSH_TIMEOUT:-15}"

# ══════════════════════════════════════════════════════════════════════
# FUNÇÕES AUXILIARES
# ══════════════════════════════════════════════════════════════════════

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

check_deps() {
  for cmd in expect curl jq; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "❌ Dependência não encontrada: $cmd"
      echo "   Instale com: apt-get install -y $cmd"
      exit 1
    fi
  done
}

# Executa comandos no roteador via SSH/expect
ssh_exec() {
  local commands="$1"
  expect -c "
    set timeout $SSH_TIMEOUT
    log_user 0
    spawn ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null -p $ROUTER_PORT $ROUTER_USER@$ROUTER_HOST

    expect {
      \"*assword:\" { send \"$ROUTER_PASS\r\" }
      \"*assword\" { send \"$ROUTER_PASS\r\" }
      timeout { puts \"ERROR: SSH timeout\"; exit 1 }
      eof { puts \"ERROR: SSH connection failed\"; exit 1 }
    }

    # Aguarda prompt
    expect {
      \"*>\" {}
      \"*]\" {}
      timeout { puts \"ERROR: prompt timeout\"; exit 1 }
    }

    # Desabilita paginação
    send \"screen-length 0 temporary\r\"
    expect {
      \"*>\" {}
      \"*]\" {}
    }

    # Executa cada comando
    $commands

    send \"quit\r\"
    expect eof
  " 2>/dev/null
}

# ══════════════════════════════════════════════════════════════════════
# PARSERS — extraem dados estruturados das saídas CLI
# ══════════════════════════════════════════════════════════════════════

parse_bgp_peers() {
  local raw="$1"
  # Extrai linhas de peers: IP  V  AS  MsgRcvd  MsgSent  OutQ  Up/Down  State  PrefRcv
  echo "$raw" | awk '
    /^  [0-9]+\.[0-9]+\.[0-9]+\.[0-9]+/ {
      ip=$1; ver=$2; asn=$3; rcvd=$4; sent=$5; outq=$6; updown=$7; state=$8; prefrcv=$9
      if (state == "") state = "Unknown"
      if (prefrcv == "") prefrcv = 0
      printf "{\"ip\":\"%s\",\"asn\":%s,\"state\":\"%s\",\"prefixes_received\":%s,\"prefixes_sent\":0,\"uptime\":\"%s\",\"msg_rcvd\":%s,\"msg_sent\":%s},\n", ip, asn, state, prefrcv, updown, rcvd, sent
    }
  ' | sed '$ s/,$//'
}

parse_netstream_cache() {
  local raw="$1"
  # Extrai fluxos: SrcAS -> DstAS com bytes
  echo "$raw" | awk '
    /SrcAS/ || /DstAS/ || /Bytes/ {
      if ($1 == "SrcAS") src_asn=$NF
      if ($1 == "DstAS") dst_asn=$NF
      if ($1 == "Bytes") {
        bytes=$NF
        # Converte bytes para Mbps (aproximação: bytes em 30s → bps → Mbps)
        mbps = (bytes * 8) / (30 * 1000000)
        if (src_asn != "" && dst_asn != "" && bytes > 0) {
          printf "{\"source_asn\":%s,\"target_asn\":%s,\"bw_mbps\":%.2f},\n", src_asn, dst_asn, mbps
        }
        src_asn=""; dst_asn=""
      }
    }
  ' | sort -t: -k2 -rn | head -50 | sed '$ s/,$//'
}

parse_interface_brief() {
  local raw="$1"
  # Extrai interfaces com status up e tráfego
  echo "$raw" | awk '
    /^[A-Za-z]/ && NF >= 5 && !/Interface/ && !/^---/ {
      iface=$1; status=$2; proto=$3
      # Captura InRate e OutRate se disponíveis
      in_rate=0; out_rate=0
      if (NF >= 6) { in_rate=$5; out_rate=$6 }
      if (status == "up" || status == "*up") {
        printf "{\"interface\":\"%s\",\"status\":\"%s\",\"protocol\":\"%s\",\"in_rate\":%s,\"out_rate\":%s},\n", iface, status, proto, in_rate, out_rate
      }
    }
  ' | sed '$ s/,$//'
}

parse_health() {
  local raw="$1"
  local cpu=$(echo "$raw" | grep -i "cpu" | grep -oP '[0-9]+%' | head -1 | tr -d '%')
  local mem=$(echo "$raw" | grep -i "memory" | grep -oP '[0-9]+%' | head -1 | tr -d '%')
  cpu="${cpu:-0}"
  mem="${mem:-0}"
  echo "{\"cpu_percent\":${cpu},\"memory_percent\":${mem}}"
}

parse_routing_stats() {
  local raw="$1"
  local total=$(echo "$raw" | grep -i "total" | grep -oP '[0-9]+' | head -1)
  local active=$(echo "$raw" | grep -i "active" | grep -oP '[0-9]+' | head -1)
  total="${total:-0}"
  active="${active:-0}"
  echo "{\"total_prefixes\":${total},\"active_routes\":${active}}"
}

# ══════════════════════════════════════════════════════════════════════
# COLETA PRINCIPAL
# ══════════════════════════════════════════════════════════════════════

collect_and_send() {
  log "📡 Coletando dados de $ROUTER_HOST ($MODEL / AS$LOCAL_ASN)..."

  # Monta bloco de comandos expect
  local expect_cmds='
    send "display bgp peer\r"
    expect { "*>" {} "*]" {} }
    send "display bgp routing-table statistics\r"
    expect { "*>" {} "*]" {} }
    send "display netstream cache ip source-ip\r"
    expect { "*>" {} "*]" {} }
    send "display interface brief\r"
    expect { "*>" {} "*]" {} }
    send "display health\r"
    expect { "*>" {} "*]" {} }
  '

  local full_output
  full_output=$(ssh_exec "$expect_cmds") || {
    log "❌ Falha na conexão SSH com $ROUTER_HOST"
    return 1
  }

  # Separa seções por comando
  local bgp_peer_raw=$(echo "$full_output" | sed -n '/display bgp peer/,/display bgp routing/p')
  local routing_raw=$(echo "$full_output" | sed -n '/display bgp routing-table/,/display netstream/p')
  local netstream_raw=$(echo "$full_output" | sed -n '/display netstream/,/display interface brief/p')
  local interface_raw=$(echo "$full_output" | sed -n '/display interface brief/,/display health/p')
  local health_raw=$(echo "$full_output" | sed -n '/display health/,$ p')

  # Parse cada seção
  local peers_json=$(parse_bgp_peers "$bgp_peer_raw")
  local flows_json=$(parse_netstream_cache "$netstream_raw")
  local health_json=$(parse_health "$health_raw")
  local routing_json=$(parse_routing_stats "$routing_raw")

  # Monta payload JSON
  local payload
  payload=$(jq -n \
    --arg config_id "$CONFIG_ID" \
    --arg host "$ROUTER_HOST" \
    --arg vendor "$VENDOR" \
    --arg model "$MODEL" \
    --argjson peers "[$peers_json]" \
    --argjson flow_data "[$flows_json]" \
    --argjson routing_stats "$routing_json" \
    '{
      config_id: $config_id,
      host: $host,
      vendor: $vendor,
      model: $model,
      peers: $peers,
      flow_data: $flow_data,
      routing_stats: $routing_stats
    }')

  # Contadores para log
  local peer_count=$(echo "$payload" | jq '.peers | length')
  local flow_count=$(echo "$payload" | jq '.flow_data | length')

  log "📊 Peers: $peer_count | Flows: $flow_count | Enviando para collector..."

  # Envia para o bgp-collector
  local response
  response=$(curl -s -w "\n%{http_code}" -X POST "$COLLECTOR_URL" \
    -H "Content-Type: application/json" \
    -d "$payload" \
    --connect-timeout 10 \
    --max-time 30) || {
    log "❌ Falha ao enviar para $COLLECTOR_URL"
    return 1
  }

  local http_code=$(echo "$response" | tail -1)
  local body=$(echo "$response" | head -n -1)

  if [ "$http_code" = "200" ]; then
    local enriched=$(echo "$body" | jq -r '.asns_enriched // 0')
    log "✅ Enviado com sucesso! ASNs enriquecidos: $enriched | HTTP $http_code"
  else
    log "⚠️  Resposta HTTP $http_code: $body"
  fi
}

# ══════════════════════════════════════════════════════════════════════
# LOOP PRINCIPAL
# ══════════════════════════════════════════════════════════════════════

main() {
  check_deps

  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║   FlowPulse — NE8000 BGP/Flow Collector                ║"
  echo "╠══════════════════════════════════════════════════════════╣"
  echo "║  Router:    $ROUTER_HOST (AS $LOCAL_ASN)"
  echo "║  Modelo:    $MODEL ($VENDOR)"
  echo "║  Config ID: $CONFIG_ID"
  echo "║  Intervalo: ${INTERVAL}s"
  echo "║  Endpoint:  $COLLECTOR_URL"
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
  log "🚀 Iniciando coleta contínua (Ctrl+C para parar)..."
  echo ""

  while true; do
    collect_and_send || true
    log "⏳ Próxima coleta em ${INTERVAL}s..."
    sleep "$INTERVAL"
  done
}

main "$@"
