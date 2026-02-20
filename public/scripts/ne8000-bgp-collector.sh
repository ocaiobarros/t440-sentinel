#!/usr/bin/env bash
# ┌──────────────────────────────────────────────────────────────────────┐
# │  FlowPulse — Coletor BGP/Flow para Huawei NE8000                   │
# │  Modos: SSH (expect) ou SNMP (snmpwalk)                            │
# │  Extrai: bgp peer, netstream cache, interface brief, health        │
# │  Envia para o endpoint bgp-collector via curl a cada N segundos    │
# │                                                                      │
# │  IMPORTANTE: Configure as variáveis de ambiente antes de rodar:     │
# │    export ROUTER_HOST=10.150.255.1                                  │
# │    export COLLECTOR_URL=https://SEU-PROJETO.supabase.co/functions/v1/bgp-collector │
# │                                                                      │
# │  Dependências:                                                       │
# │    SSH mode:  expect, curl, jq                                      │
# │    SNMP mode: snmpwalk, snmpget, curl, jq                           │
# │  Uso: bash ne8000-bgp-collector.sh                                  │
# └──────────────────────────────────────────────────────────────────────┘
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════
# CONFIGURAÇÃO — edite conforme seu ambiente
# ══════════════════════════════════════════════════════════════════════
ROUTER_HOST="${ROUTER_HOST:?❌ Defina ROUTER_HOST (ex: export ROUTER_HOST=10.150.255.1)}"
CONFIG_ID="${CONFIG_ID:-$(echo "$ROUTER_HOST" | tr '.' '-')}"
VENDOR="${VENDOR:-huawei}"
MODEL="${MODEL:-NE8000-M8}"
LOCAL_ASN="${LOCAL_ASN:-0}"

# ── Modo de coleta: "ssh" ou "snmp"
COLLECT_MODE="${COLLECT_MODE:-ssh}"

# ── SSH config
ROUTER_USER="${ROUTER_USER:-admin}"
ROUTER_PASS="${ROUTER_PASS:-admin@123}"
ROUTER_PORT="${ROUTER_PORT:-22}"
SSH_TIMEOUT="${SSH_TIMEOUT:-15}"

# ── SNMP config
SNMP_COMMUNITY="${SNMP_COMMUNITY:-public}"
SNMP_VERSION="${SNMP_VERSION:-2c}"      # 1, 2c, 3
SNMP_TIMEOUT="${SNMP_TIMEOUT:-10}"
SNMP_RETRIES="${SNMP_RETRIES:-2}"
# SNMPv3 (se SNMP_VERSION=3)
SNMP_SEC_NAME="${SNMP_SEC_NAME:-}"
SNMP_SEC_LEVEL="${SNMP_SEC_LEVEL:-authPriv}"  # noAuthNoPriv, authNoPriv, authPriv
SNMP_AUTH_PROTO="${SNMP_AUTH_PROTO:-SHA}"
SNMP_AUTH_PASS="${SNMP_AUTH_PASS:-}"
SNMP_PRIV_PROTO="${SNMP_PRIV_PROTO:-AES}"
SNMP_PRIV_PASS="${SNMP_PRIV_PASS:-}"

# Endpoint do bgp-collector (Edge Function)
# Cada ambiente tem sua própria URL — copie do painel FlowPulse ou configure manualmente
COLLECTOR_URL="${COLLECTOR_URL:?❌ Defina COLLECTOR_URL (ex: export COLLECTOR_URL=https://SEU-PROJETO.supabase.co/functions/v1/bgp-collector)}"

# Intervalo de coleta em segundos
INTERVAL="${INTERVAL:-30}"

# ══════════════════════════════════════════════════════════════════════
# OIDs — BGP4-MIB (RFC 4273) genérico + Huawei proprietário
# ══════════════════════════════════════════════════════════════════════

# ── BGP4-MIB genérico (funciona em qualquer vendor)
OID_BGP_PEER_IDENTIFIER="1.3.6.1.2.1.15.3.1.1"   # bgpPeerIdentifier
OID_BGP_PEER_STATE="1.3.6.1.2.1.15.3.1.2"         # bgpPeerState (1=idle,2=connect,3=active,4=opensent,5=openconfirm,6=established)
OID_BGP_PEER_REMOTE_AS="1.3.6.1.2.1.15.3.1.9"     # bgpPeerRemoteAs
OID_BGP_PEER_REMOTE_ADDR="1.3.6.1.2.1.15.3.1.7"   # bgpPeerRemoteAddr
OID_BGP_PEER_IN_UPDATES="1.3.6.1.2.1.15.3.1.10"   # bgpPeerInUpdates
OID_BGP_PEER_OUT_UPDATES="1.3.6.1.2.1.15.3.1.11"  # bgpPeerOutUpdates
OID_BGP_PEER_IN_TOTAL="1.3.6.1.2.1.15.3.1.12"     # bgpPeerInTotalMessages
OID_BGP_PEER_OUT_TOTAL="1.3.6.1.2.1.15.3.1.13"    # bgpPeerOutTotalMessages
OID_BGP_PEER_ESTABLISHED_TIME="1.3.6.1.2.1.15.3.1.16" # bgpPeerFsmEstablishedTime
OID_BGP_PEER_PREFIX_ACCEPTED="1.3.6.1.2.1.15.3.1.23"  # bgpPeerPrefixAccepted (se suportado)

# ── Huawei proprietário (HUAWEI-BGP-VPN-MIB)
OID_HW_BGP_PEER_REMOTE_ADDR="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.4"  # hwBgpPeerRemoteAddr
OID_HW_BGP_PEER_NAME="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.2"          # hwBgpPeerSessionName
OID_HW_BGP_PEER_STATE="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.6"         # hwBgpPeerState
OID_HW_BGP_PEER_REMOTE_AS="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.3"     # hwBgpPeerRemoteAs
OID_HW_BGP_PREFIX_RCV="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.10"        # hwBgpPeerPrefixRcvCounter
OID_HW_BGP_PREFIX_ADV="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.12"        # hwBgpPeerPrefixAdvCounter
OID_HW_BGP_UPTIME="1.3.6.1.4.1.2011.5.25.177.1.1.2.1.17"            # hwBgpPeerFsmEstablishedTime

# ── Interface e Saúde
OID_IF_DESCR="1.3.6.1.2.1.2.2.1.2"                # ifDescr
OID_IF_OPER_STATUS="1.3.6.1.2.1.2.2.1.8"           # ifOperStatus
OID_IF_IN_OCTETS="1.3.6.1.2.1.2.2.1.10"             # ifInOctets
OID_IF_OUT_OCTETS="1.3.6.1.2.1.2.2.1.16"            # ifOutOctets
OID_IF_HC_IN_OCTETS="1.3.6.1.2.1.31.1.1.1.6"        # ifHCInOctets (64-bit)
OID_IF_HC_OUT_OCTETS="1.3.6.1.2.1.31.1.1.1.10"      # ifHCOutOctets (64-bit)

# ── Saúde do sistema
OID_HW_CPU_USAGE="1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5"   # hwEntityCpuUsage
OID_HW_MEM_USAGE="1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"   # hwEntityMemUsage
OID_SYS_DESCR="1.3.6.1.2.1.1.1.0"                         # sysDescr
OID_SYS_UPTIME="1.3.6.1.2.1.1.3.0"                        # sysUpTime

# ══════════════════════════════════════════════════════════════════════
# FUNÇÕES AUXILIARES
# ══════════════════════════════════════════════════════════════════════

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

check_deps() {
  local required=("curl" "jq")
  if [ "$COLLECT_MODE" = "ssh" ]; then
    required+=("expect")
  else
    required+=("snmpwalk" "snmpget")
  fi
  for cmd in "${required[@]}"; do
    if ! command -v "$cmd" &>/dev/null; then
      echo "❌ Dependência não encontrada: $cmd"
      if [ "$cmd" = "snmpwalk" ] || [ "$cmd" = "snmpget" ]; then
        echo "   Instale com: apt-get install -y snmp"
      else
        echo "   Instale com: apt-get install -y $cmd"
      fi
      exit 1
    fi
  done
}

# Monta argumentos SNMP conforme versão
snmp_args() {
  if [ "$SNMP_VERSION" = "3" ]; then
    echo "-v3 -u $SNMP_SEC_NAME -l $SNMP_SEC_LEVEL -a $SNMP_AUTH_PROTO -A $SNMP_AUTH_PASS -x $SNMP_PRIV_PROTO -X $SNMP_PRIV_PASS -t $SNMP_TIMEOUT -r $SNMP_RETRIES"
  else
    echo "-v$SNMP_VERSION -c $SNMP_COMMUNITY -t $SNMP_TIMEOUT -r $SNMP_RETRIES"
  fi
}

# Executa snmpwalk e retorna linhas "OID = VALUE"
do_snmpwalk() {
  local oid="$1"
  snmpwalk $(snmp_args) -OQn "$ROUTER_HOST" "$oid" 2>/dev/null || true
}

# Executa snmpget para um OID escalar
do_snmpget() {
  local oid="$1"
  snmpget $(snmp_args) -OQvn "$ROUTER_HOST" "$oid" 2>/dev/null | tr -d '"' || echo ""
}

# Mapeia estado numérico BGP4-MIB para string
bgp_state_name() {
  case "$1" in
    1) echo "Idle" ;;
    2) echo "Connect" ;;
    3) echo "Active" ;;
    4) echo "OpenSent" ;;
    5) echo "OpenConfirm" ;;
    6) echo "Established" ;;
    *) echo "Unknown" ;;
  esac
}

# ══════════════════════════════════════════════════════════════════════
# COLETOR SNMP
# ══════════════════════════════════════════════════════════════════════

collect_snmp() {
  log "📡 [SNMP] Coletando BGP peers de $ROUTER_HOST..."

  local use_huawei=false

  # Tenta OIDs Huawei primeiro; se falhar, usa genérico
  local hw_test
  hw_test=$(do_snmpwalk "$OID_HW_BGP_PEER_REMOTE_ADDR" | head -1)
  if [ -n "$hw_test" ] && [[ ! "$hw_test" =~ "No Such" ]] && [[ ! "$hw_test" =~ "Timeout" ]]; then
    use_huawei=true
    log "   ✓ OIDs Huawei proprietários detectados"
  else
    log "   ⚠ OIDs Huawei não disponíveis, usando BGP4-MIB genérico"
  fi

  local peers_json=""

  if [ "$use_huawei" = true ]; then
    # ── Coleta Huawei
    local -A hw_addrs hw_states hw_asns hw_prefrcv hw_prefadv hw_names

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local idx="${oid##*.}"
      hw_addrs["$idx"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_HW_BGP_PEER_REMOTE_ADDR")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local idx="${oid##*.}"
      hw_states["$idx"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_HW_BGP_PEER_STATE")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local idx="${oid##*.}"
      hw_asns["$idx"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_HW_BGP_PEER_REMOTE_AS")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local idx="${oid##*.}"
      hw_prefrcv["$idx"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_HW_BGP_PREFIX_RCV")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local idx="${oid##*.}"
      hw_prefadv["$idx"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_HW_BGP_PREFIX_ADV")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local idx="${oid##*.}"
      hw_names["$idx"]="$(echo "$val" | tr -d '"')"
    done < <(do_snmpwalk "$OID_HW_BGP_PEER_NAME")

    for idx in "${!hw_addrs[@]}"; do
      local ip="${hw_addrs[$idx]}"
      local state="${hw_states[$idx]:-Unknown}"
      local asn="${hw_asns[$idx]:-0}"
      local prefrcv="${hw_prefrcv[$idx]:-0}"
      local prefadv="${hw_prefadv[$idx]:-0}"
      local name="${hw_names[$idx]:-}"

      # Huawei state: 1=idle,2=connect,3=active,4=opensent,5=openconfirm,6=established
      state=$(bgp_state_name "$state")

      [ -n "$peers_json" ] && peers_json="${peers_json},"
      peers_json="${peers_json}{\"ip\":\"${ip}\",\"asn\":${asn},\"state\":\"${state}\",\"prefixes_received\":${prefrcv},\"prefixes_sent\":${prefadv},\"session_name\":\"${name}\"}"
    done

  else
    # ── Coleta BGP4-MIB genérica
    local -A gen_states gen_asns gen_addrs gen_prefrcv gen_uptime

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      # Index é o IP do peer no OID: .1.3.6.1.2.1.15.3.1.2.X.X.X.X
      local peer_ip="${oid#*.3.6.1.2.1.15.3.1.2.}"
      gen_states["$peer_ip"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_BGP_PEER_STATE")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local peer_ip="${oid#*.3.6.1.2.1.15.3.1.9.}"
      gen_asns["$peer_ip"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_BGP_PEER_REMOTE_AS")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local peer_ip="${oid#*.3.6.1.2.1.15.3.1.7.}"
      gen_addrs["$peer_ip"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_BGP_PEER_REMOTE_ADDR")

    while IFS='= ' read -r oid val; do
      [ -z "$oid" ] && continue
      local peer_ip="${oid#*.3.6.1.2.1.15.3.1.16.}"
      gen_uptime["$peer_ip"]="$(echo "$val" | tr -d ' "')"
    done < <(do_snmpwalk "$OID_BGP_PEER_ESTABLISHED_TIME")

    for peer_ip in "${!gen_states[@]}"; do
      local ip="${gen_addrs[$peer_ip]:-$peer_ip}"
      local state_num="${gen_states[$peer_ip]}"
      local asn="${gen_asns[$peer_ip]:-0}"
      local uptime="${gen_uptime[$peer_ip]:-0}"
      local state=$(bgp_state_name "$state_num")

      [ -n "$peers_json" ] && peers_json="${peers_json},"
      peers_json="${peers_json}{\"ip\":\"${ip}\",\"asn\":${asn},\"state\":\"${state}\",\"prefixes_received\":0,\"prefixes_sent\":0,\"uptime\":\"${uptime}s\"}"
    done
  fi

  # ── Saúde do sistema via SNMP
  local cpu_usage mem_usage sys_descr sys_uptime
  cpu_usage=$(do_snmpget "$OID_HW_CPU_USAGE" 2>/dev/null || echo "0")
  mem_usage=$(do_snmpget "$OID_HW_MEM_USAGE" 2>/dev/null || echo "0")
  sys_descr=$(do_snmpget "$OID_SYS_DESCR" 2>/dev/null || echo "")
  sys_uptime=$(do_snmpget "$OID_SYS_UPTIME" 2>/dev/null || echo "0")

  cpu_usage="${cpu_usage:-0}"
  mem_usage="${mem_usage:-0}"

  # ── Monta payload
  local payload
  payload=$(jq -n \
    --arg config_id "$CONFIG_ID" \
    --arg host "$ROUTER_HOST" \
    --arg vendor "$VENDOR" \
    --arg model "$MODEL" \
    --arg sys_descr "$sys_descr" \
    --arg sys_uptime "$sys_uptime" \
    --arg collect_mode "snmp" \
    --argjson peers "[$peers_json]" \
    --argjson cpu "${cpu_usage}" \
    --argjson mem "${mem_usage}" \
    '{
      config_id: $config_id,
      host: $host,
      vendor: $vendor,
      model: $model,
      peers: $peers,
      flow_data: [],
      routing_stats: { total_prefixes: 0, active_routes: 0 },
      health: { cpu_percent: $cpu, memory_percent: $mem, sys_descr: $sys_descr, sys_uptime: $sys_uptime },
      collect_mode: $collect_mode
    }')

  send_payload "$payload"
}

# ══════════════════════════════════════════════════════════════════════
# COLETOR SSH (expect)
# ══════════════════════════════════════════════════════════════════════

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

    expect {
      \"*>\" {}
      \"*]\" {}
      timeout { puts \"ERROR: prompt timeout\"; exit 1 }
    }

    send \"screen-length 0 temporary\r\"
    expect {
      \"*>\" {}
      \"*]\" {}
    }

    $commands

    send \"quit\r\"
    expect eof
  " 2>/dev/null
}

parse_bgp_peers() {
  local raw="$1"
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
  echo "$raw" | awk '
    /SrcAS/ || /DstAS/ || /Bytes/ {
      if ($1 == "SrcAS") src_asn=$NF
      if ($1 == "DstAS") dst_asn=$NF
      if ($1 == "Bytes") {
        bytes=$NF
        mbps = (bytes * 8) / (30 * 1000000)
        if (src_asn != "" && dst_asn != "" && bytes > 0) {
          printf "{\"source_asn\":%s,\"target_asn\":%s,\"bw_mbps\":%.2f},\n", src_asn, dst_asn, mbps
        }
        src_asn=""; dst_asn=""
      }
    }
  ' | sort -t: -k2 -rn | head -50 | sed '$ s/,$//'
}

parse_health() {
  local raw="$1"
  local cpu=$(echo "$raw" | grep -i "cpu" | grep -oP '[0-9]+%' | head -1 | tr -d '%')
  local mem=$(echo "$raw" | grep -i "memory" | grep -oP '[0-9]+%' | head -1 | tr -d '%')
  echo "${cpu:-0} ${mem:-0}"
}

collect_ssh() {
  log "📡 [SSH] Coletando dados de $ROUTER_HOST ($MODEL / AS$LOCAL_ASN)..."

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

  local bgp_peer_raw=$(echo "$full_output" | sed -n '/display bgp peer/,/display bgp routing/p')
  local routing_raw=$(echo "$full_output" | sed -n '/display bgp routing-table/,/display netstream/p')
  local netstream_raw=$(echo "$full_output" | sed -n '/display netstream/,/display interface brief/p')
  local health_raw=$(echo "$full_output" | sed -n '/display health/,$ p')

  local peers_json=$(parse_bgp_peers "$bgp_peer_raw")
  local flows_json=$(parse_netstream_cache "$netstream_raw")
  local health_vals=$(parse_health "$health_raw")
  local cpu_val=$(echo "$health_vals" | awk '{print $1}')
  local mem_val=$(echo "$health_vals" | awk '{print $2}')

  local total_routes=$(echo "$routing_raw" | grep -i "total" | grep -oP '[0-9]+' | head -1)
  local active_routes=$(echo "$routing_raw" | grep -i "active" | grep -oP '[0-9]+' | head -1)

  local payload
  payload=$(jq -n \
    --arg config_id "$CONFIG_ID" \
    --arg host "$ROUTER_HOST" \
    --arg vendor "$VENDOR" \
    --arg model "$MODEL" \
    --arg collect_mode "ssh" \
    --argjson peers "[$peers_json]" \
    --argjson flow_data "[$flows_json]" \
    --argjson total "${total_routes:-0}" \
    --argjson active "${active_routes:-0}" \
    --argjson cpu "${cpu_val:-0}" \
    --argjson mem "${mem_val:-0}" \
    '{
      config_id: $config_id,
      host: $host,
      vendor: $vendor,
      model: $model,
      peers: $peers,
      flow_data: $flow_data,
      routing_stats: { total_prefixes: $total, active_routes: $active },
      health: { cpu_percent: $cpu, memory_percent: $mem },
      collect_mode: $collect_mode
    }')

  send_payload "$payload"
}

# ══════════════════════════════════════════════════════════════════════
# ENVIO PARA O bgp-collector
# ══════════════════════════════════════════════════════════════════════

send_payload() {
  local payload="$1"
  local peer_count=$(echo "$payload" | jq '.peers | length')
  local flow_count=$(echo "$payload" | jq '.flow_data | length')

  log "📊 Peers: $peer_count | Flows: $flow_count | Enviando para collector..."

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

  echo "╔══════════════════════════════════════════════════════════════╗"
  echo "║   FlowPulse — NE8000 BGP/Flow Collector                    ║"
  echo "╠══════════════════════════════════════════════════════════════╣"
  echo "║  Router:      $ROUTER_HOST (AS $LOCAL_ASN)"
  echo "║  Modelo:      $MODEL ($VENDOR)"
  echo "║  Config ID:   $CONFIG_ID"
  echo "║  Modo coleta: $COLLECT_MODE"
  if [ "$COLLECT_MODE" = "snmp" ]; then
  echo "║  SNMP:        v$SNMP_VERSION community=$SNMP_COMMUNITY"
  else
  echo "║  SSH:         $ROUTER_USER@$ROUTER_HOST:$ROUTER_PORT"
  fi
  echo "║  Intervalo:   ${INTERVAL}s"
  echo "║  Endpoint:    $COLLECTOR_URL"
  echo "╚══════════════════════════════════════════════════════════════╝"
  echo ""
  echo "OIDs BGP4-MIB genérico:"
  echo "  bgpPeerState:      $OID_BGP_PEER_STATE"
  echo "  bgpPeerRemoteAs:   $OID_BGP_PEER_REMOTE_AS"
  echo "  bgpPeerRemoteAddr: $OID_BGP_PEER_REMOTE_ADDR"
  echo ""
  echo "OIDs Huawei proprietário:"
  echo "  hwBgpPeerAddr:     $OID_HW_BGP_PEER_REMOTE_ADDR"
  echo "  hwBgpPeerState:    $OID_HW_BGP_PEER_STATE"
  echo "  hwBgpPeerName:     $OID_HW_BGP_PEER_NAME"
  echo "  hwBgpPrefixRcv:    $OID_HW_BGP_PREFIX_RCV"
  echo ""
  log "🚀 Iniciando coleta contínua (Ctrl+C para parar)..."
  echo ""

  while true; do
    if [ "$COLLECT_MODE" = "snmp" ]; then
      collect_snmp || true
    else
      collect_ssh || true
    fi
    log "⏳ Próxima coleta em ${INTERVAL}s..."
    sleep "$INTERVAL"
  done
}

main "$@"
