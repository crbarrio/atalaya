#!/usr/bin/env bash
#
# atalaya — server setup
#
# Takes a machine that already runs Docker, Tailscale and `stack`, and leaves it
# ready to be watched and read by atalaya:
#
#   - node_exporter (native)  host metrics, plus the textfile directory `stack`
#                             writes its backup and version metrics into.
#   - cAdvisor (container)    per-container metrics, keeping the client label.
#   - an `atalaya` user       read-only access to stack's state over SSH.
#   - a command dispatcher    lets that user run a fixed list of `stack`
#                             subcommands, and nothing else.
#
# Everything listens ONLY on the Tailscale IP, and the SSH key only works from
# atalaya's own machine.
#
# Run it ON the machine being set up:
#
#   sudo ./setup-server.sh --atalaya-key "ssh-ed25519 AAAA... atalaya@homeserver" \
#                          --atalaya-from 100.100.0.1
#
# It is idempotent: re-running changes only what needs changing, so it is also
# how a key is rotated or a setting corrected.
#
# See docs/monitoring.md for the reasoning behind each decision.

set -euo pipefail

# --- Defaults --------------------------------------------------------------

TAILNET_IP=""                       # empty = detect with `tailscale ip -4`
NODE_PORT=9100
CADVISOR_PORT=8080
LABELS="stack.client"
CADVISOR_VERSION="v0.52.1"          # latest tag publishing an arm64 image
DIRECTORY="/opt/atalaya"
TEXTFILE_DIR="/var/lib/prometheus/node-exporter"
STACK_DIR="/home/ubuntu/docker/stack"
ATALAYA_USER="atalaya"
ATALAYA_KEY=""
ATALAYA_FROM=""
MODE="setup"                        # setup | check | uninstall

NODE_PACKAGE="prometheus-node-exporter"
NODE_DEFAULTS="/etc/default/prometheus-node-exporter"
NODE_SERVICE="prometheus-node-exporter"
CADVISOR_CONTAINER="atalaya-cadvisor"

CHANGES=0

# --- Output ----------------------------------------------------------------

if [[ -t 1 ]]; then
  RED=$'\033[31m'; GREEN=$'\033[32m'; AMBER=$'\033[33m'; GREY=$'\033[90m'; OFF=$'\033[0m'
else
  RED=""; GREEN=""; AMBER=""; GREY=""; OFF=""
fi

step()    { printf '\n%s==>%s %s\n' "$AMBER" "$OFF" "$*"; }
ok()      { printf '  %s✓%s %s\n' "$GREEN" "$OFF" "$*"; }
info()    { printf '  %s·%s %s\n' "$GREY" "$OFF" "$*"; }
changed() { printf '  %s±%s %s\n' "$AMBER" "$OFF" "$*"; CHANGES=$((CHANGES + 1)); }
fail()    { printf '  %s✗%s %s\n' "$RED" "$OFF" "$*" >&2; }
die()     { fail "$*"; exit 1; }

usage() {
  cat <<'HELPDOC'
atalaya — server setup

USAGE
  sudo ./setup-server.sh [options]

OPTIONS
  --atalaya-key "KEY"    Public key atalaya connects with. Without it the user
                         step is skipped and only the collectors are set up.
  --atalaya-from IP[,IP] Tailnet address the key may come from. Accepts a
                         comma-separated list, for when a workstation reads the
                         server during development as well as the panel does.
                         Required whenever --atalaya-key is given.
  --atalaya-user NAME    Account to create (default "atalaya").
  --stack-dir PATH       Where stack lives (default /home/ubuntu/docker/stack).
                         Its owner decides who may write the textfile metrics.
  --tailnet-ip IP        Detected with `tailscale ip -4` when omitted.
  --node-port N          node_exporter port (default 9100).
  --cadvisor-port N      cAdvisor port (default 8080).
  --labels LIST          Container labels cAdvisor keeps (default "stack.client").
  --cadvisor-version V   Image tag (default v0.52.1).
  --directory PATH       Where the compose file lives (default /opt/atalaya).
  --check                Change nothing: only verify the current state.
  --uninstall            Remove the collectors and the command dispatcher.
                         The user account itself is left alone.
  -h, --help             This.
HELPDOC
}

# --- Arguments -------------------------------------------------------------

while [[ $# -gt 0 ]]; do
  case "$1" in
    --atalaya-key)      ATALAYA_KEY="${2:?--atalaya-key needs a value}"; shift 2 ;;
    --atalaya-from)     ATALAYA_FROM="${2:?--atalaya-from needs a value}"; shift 2 ;;
    --atalaya-user)     ATALAYA_USER="${2:?--atalaya-user needs a value}"; shift 2 ;;
    --stack-dir)        STACK_DIR="${2:?--stack-dir needs a value}"; shift 2 ;;
    --tailnet-ip)       TAILNET_IP="${2:?--tailnet-ip needs a value}"; shift 2 ;;
    --node-port)        NODE_PORT="${2:?--node-port needs a value}"; shift 2 ;;
    --cadvisor-port)    CADVISOR_PORT="${2:?--cadvisor-port needs a value}"; shift 2 ;;
    --labels)           LABELS="${2:?--labels needs a value}"; shift 2 ;;
    --cadvisor-version) CADVISOR_VERSION="${2:?--cadvisor-version needs a value}"; shift 2 ;;
    --directory)        DIRECTORY="${2:?--directory needs a value}"; shift 2 ;;
    --check)            MODE="check"; shift ;;
    --uninstall)        MODE="uninstall"; shift ;;
    -h|--help)          usage; exit 0 ;;
    *)                  die "Unknown option: $1  (--help lists the valid ones)" ;;
  esac
done

STACK_OWNER=""
STACK_GROUP=""

# --- Helpers ---------------------------------------------------------------

# Writes a file only when its content changes. This is the heart of the
# idempotence: without it, re-running would restart services for no reason.
#
# `content` is passed without a trailing newline and written with exactly one.
# `$(cat …)` strips trailing newlines, so any other arrangement makes the
# comparison always differ and the file get rewritten on every run.
write_if_changed() {
  local target="$1" content="$2" mode="${3:-0644}"
  if [[ -f $target ]] && [[ "$(cat "$target")" == "$content" ]]; then
    return 1
  fi
  mkdir -p "$(dirname "$target")"
  printf '%s\n' "$content" > "$target"
  chmod "$mode" "$target"
  return 0
}

port_taken_by_other() {
  local port="$1"
  ss -lntH "sport = :$port" 2>/dev/null | grep -q . && return 0
  return 1
}

detect_tailnet_ip() {
  command -v tailscale >/dev/null 2>&1 \
    || die "Tailscale is not installed. Collectors must bind to the tailnet IP."
  local ip
  ip="$(tailscale ip -4 2>/dev/null | head -1 || true)"
  [[ -n $ip ]] \
    || die "Tailscale reports no IP (logged out?). Run 'sudo tailscale up' and retry."
  printf '%s' "$ip"
}

# --- Preflight -------------------------------------------------------------

preflight() {
  step "Preflight checks"

  [[ $EUID -eq 0 ]] || die "Must run as root: sudo $0"

  command -v systemctl >/dev/null 2>&1 || die "No systemd; this script assumes Ubuntu/Debian."
  command -v docker    >/dev/null 2>&1 || die "Docker is not installed (cAdvisor needs it)."
  docker compose version >/dev/null 2>&1 || die "The 'docker compose' plugin is missing."

  if [[ -z $TAILNET_IP ]]; then
    TAILNET_IP="$(detect_tailnet_ip)"
    info "Tailnet IP detected: $TAILNET_IP"
  else
    info "Tailnet IP given: $TAILNET_IP"
  fi

  # Binding to an IP the machine does not hold fails confusingly at service
  # start. Better to say it here.
  ip -4 addr show 2>/dev/null | grep -qw "$TAILNET_IP" \
    || die "This machine does not hold $TAILNET_IP. Check 'tailscale ip -4'."

  # stack's owner decides two things: who may write the textfile metrics, and
  # which group the atalaya account joins in order to read the inventory.
  [[ -d $STACK_DIR ]] || die "Cannot find stack at $STACK_DIR. Use --stack-dir."
  STACK_OWNER="$(stat -c %U "$STACK_DIR")"
  STACK_GROUP="$(stat -c %G "$STACK_DIR")"
  info "stack at $STACK_DIR, owned by ${STACK_OWNER}:${STACK_GROUP}"

  if [[ -n $ATALAYA_KEY && -z $ATALAYA_FROM ]]; then
    die "--atalaya-key given without --atalaya-from. An unrestricted key would work from anywhere on the tailnet."
  fi

  ok "root, systemd, docker, tailnet IP and stack all in place"
}

# --- node_exporter ---------------------------------------------------------

install_node_exporter() {
  step "node_exporter (native)"

  if dpkg -s "$NODE_PACKAGE" >/dev/null 2>&1; then
    info "$NODE_PACKAGE already installed"
  else
    if port_taken_by_other "$NODE_PORT"; then
      die "Port $NODE_PORT is already taken. Use --node-port."
    fi
    changed "installing $NODE_PACKAGE"
    DEBIAN_FRONTEND=noninteractive apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq "$NODE_PACKAGE" >/dev/null
  fi

  # The textfile collector directory, and the reason it needs care: `stack`
  # writes its backup status and deployed version here, from cron, as
  # $STACK_OWNER. Left root-owned it is unwritable, and since the cron job
  # discards its output the metric would simply never appear — the exact silent
  # failure the metric exists to report.
  #
  # setgid so files created here keep the group, whoever writes them.
  mkdir -p "$TEXTFILE_DIR"
  local want_group="$STACK_GROUP" now_group now_mode
  now_group="$(stat -c %G "$TEXTFILE_DIR")"
  now_mode="$(stat -c %a "$TEXTFILE_DIR")"
  if [[ "$now_group" != "$want_group" || "$now_mode" != "2775" ]]; then
    chgrp "$want_group" "$TEXTFILE_DIR"
    chmod 2775 "$TEXTFILE_DIR"
    changed "$TEXTFILE_DIR now writable by group $want_group"
  else
    info "$TEXTFILE_DIR already writable by group $want_group"
  fi

  local args
  args="--web.listen-address=${TAILNET_IP}:${NODE_PORT}"
  args+=" --collector.textfile.directory=${TEXTFILE_DIR}"

  local content
  content=$(cat <<CONF
# Managed by atalaya (infra/fleet/server-setup/setup-server.sh).
# Hand edits are lost on the next run.
#
# Bound to the tailnet IP on purpose: on 0.0.0.0 these metrics would be
# exposed to anyone who can reach the machine.
ARGS="${args}"
CONF
)

  if write_if_changed "$NODE_DEFAULTS" "$content"; then
    changed "configuration written to $NODE_DEFAULTS"
    systemctl restart "$NODE_SERVICE"
    changed "service restarted"
  else
    info "configuration already correct"
  fi

  systemctl enable --quiet "$NODE_SERVICE" 2>/dev/null || true
  systemctl is-active --quiet "$NODE_SERVICE" || systemctl start "$NODE_SERVICE"

  ok "node_exporter listening on ${TAILNET_IP}:${NODE_PORT}"
}

# --- cAdvisor --------------------------------------------------------------

install_cadvisor() {
  step "cAdvisor (container)"

  if ! docker ps -a --format '{{.Names}}' | grep -qx "$CADVISOR_CONTAINER"; then
    if port_taken_by_other "$CADVISOR_PORT"; then
      die "Port $CADVISOR_PORT is already taken. Use --cadvisor-port."
    fi
  fi

  # A container left behind by an earlier layout: same name, different compose
  # project. Docker refuses to recreate it and the run would abort halfway, so
  # the old one is taken down first.
  local previous_dir
  previous_dir="$(docker inspect "$CADVISOR_CONTAINER" \
      --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
  if [[ -n $previous_dir && $previous_dir != "$DIRECTORY" ]]; then
    docker rm -f "$CADVISOR_CONTAINER" >/dev/null 2>&1 || true
    rm -f "$previous_dir/docker-compose.yml"
    rmdir --ignore-fail-on-non-empty "$previous_dir" 2>/dev/null || true
    changed "removed the container and compose left at $previous_dir"
  fi

  # --whitelisted_container_labels is the line that actually matters: cAdvisor
  # does NOT export container labels by default. Without it everything looks
  # fine and the "how much does each client cost" figure does not exist.
  #
  # --disable_metrics drops families nobody will look at and that multiply the
  # series count, and therefore the disk. Reversible.
  local content
  content=$(cat <<COMPOSE
# Managed by atalaya (infra/fleet/server-setup/setup-server.sh).
# Hand edits are lost on the next run.
#
# The project name is explicit so it does not follow the directory: moving the
# file would otherwise orphan the running container under the old project.
name: atalaya
services:
  cadvisor:
    image: gcr.io/cadvisor/cadvisor:${CADVISOR_VERSION}
    container_name: ${CADVISOR_CONTAINER}
    restart: unless-stopped
    # Tailnet IP only. Never 0.0.0.0.
    ports:
      - "${TAILNET_IP}:${CADVISOR_PORT}:8080"
    volumes:
      - /:/rootfs:ro
      - /var/run:/var/run:ro
      - /sys:/sys:ro
      - /var/lib/docker/:/var/lib/docker:ro
      - /dev/disk/:/dev/disk:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    devices:
      - /dev/kmsg
    privileged: true
    command:
      - --docker_only=true
      - --store_container_labels=false
      - --whitelisted_container_labels=${LABELS}
      - --housekeeping_interval=30s
      - --disable_metrics=advtcp,cpu_topology,cpuset,hugetlb,memory_numa,percpu,process,referenced_memory,resctrl,sched,tcp,udp
COMPOSE
)

  mkdir -p "$DIRECTORY"
  if write_if_changed "${DIRECTORY}/docker-compose.yml" "$content"; then
    changed "compose file written to ${DIRECTORY}/docker-compose.yml"
  else
    info "compose file already correct"
  fi

  local output
  output="$(docker compose -f "${DIRECTORY}/docker-compose.yml" up -d 2>&1)"
  if grep -qiE 'creat|recreat|start' <<<"$output"; then
    changed "container started or recreated"
  else
    info "container already running"
  fi

  ok "cAdvisor listening on ${TAILNET_IP}:${CADVISOR_PORT}"
}

# --- atalaya account -------------------------------------------------------

setup_atalaya_user() {
  step "atalaya account"

  if [[ -z $ATALAYA_KEY ]]; then
    info "no --atalaya-key given: skipping. atalaya will not be able to read this server."
    return 0
  fi

  if id "$ATALAYA_USER" >/dev/null 2>&1; then
    info "user $ATALAYA_USER already exists"
  else
    useradd -m -s /bin/bash "$ATALAYA_USER"
    changed "user $ATALAYA_USER created"
  fi

  # In stack's group, and in no other: the group can traverse the home and read
  # the inventory, while secrets/ is 700 and stays out of reach.
  #
  # This account gets no general sudo. It does get one narrow exception, granted
  # by install_command_dispatcher below — a single root-owned program running a
  # fixed list of stack subcommands. See that function for the reasoning.
  if id -nG "$ATALAYA_USER" | tr ' ' '\n' | grep -qx "$STACK_GROUP"; then
    info "already in group $STACK_GROUP"
  else
    usermod -aG "$STACK_GROUP" "$ATALAYA_USER"
    changed "added to group $STACK_GROUP"
  fi

  passwd -l "$ATALAYA_USER" >/dev/null 2>&1 || true

  local home; home="$(getent passwd "$ATALAYA_USER" | cut -d: -f6)"
  mkdir -p "$home/.ssh"

  # from= ties the key to the addresses given, so a copy taken anywhere else is
  # useless. OpenSSH accepts a comma-separated list, which is how a development
  # workstation gets in without a second identity. restrict turns off port
  # forwarding, agent forwarding and a pty: reading over exec needs none of them.
  local line="from=\"${ATALAYA_FROM}\",restrict ${ATALAYA_KEY}"
  if write_if_changed "$home/.ssh/authorized_keys" "$line" 0600; then
    changed "authorized_keys written, restricted to ${ATALAYA_FROM}"
  else
    info "authorized_keys already correct"
  fi

  chown -R "${ATALAYA_USER}:${ATALAYA_USER}" "$home/.ssh"
  chmod 700 "$home/.ssh"

  ok "$ATALAYA_USER ready, no sudo, key restricted to ${ATALAYA_FROM}"
}

# --- Command dispatcher ----------------------------------------------------

# atalaya reads over SSH as an account with no docker and no sudo — that is the
# whole permission model, and `inventory` was designed to fit inside it. Every
# other `stack` command needs the docker socket AND .env (600 ubuntu, database
# root passwords), so neither is reachable from that account.
#
# This grants the narrowest thing that works: a dispatcher owned by root, and
# one sudo rule naming it exactly, with no wildcard for sudo to mis-match. The
# list of allowed subcommands lives here, in a file the atalaya account cannot
# write, rather than in sudoers globs or in the panel's own code.
#
# `exec` is absent on purpose and must stay absent: `stack exec` is
# `docker compose exec <svc> <command...>`, which is a remote shell. `retire`
# and `add` are absent because they are destructive and configuration-writing
# respectively; both are separate decisions, not a parameter.
install_command_dispatcher() {
  step "command dispatcher"

  if [[ -z $ATALAYA_KEY ]]; then
    info "no --atalaya-key given: skipping. Nothing to authorise."
    return 0
  fi

  # Quoted heredoc: nothing here is expanded while this script runs, so the
  # dispatcher's own `$1`/`$@` survive verbatim. The two values that do need
  # substituting are placeholders, replaced once below.
  local dispatcher_body
  dispatcher_body="$(cat <<'DISPATCHER'
#!/usr/bin/env bash
#
# GENERATED BY atalaya's setup-server.sh — DO NOT EDIT BY HAND.
#
# Runs a fixed set of `stack` subcommands on behalf of the atalaya account,
# which has neither docker nor .env access of its own. Reached only through:
#
#   sudo -u __OWNER__ /usr/local/sbin/atalaya-stack <subcommand> [args...]
#
# This file is the security boundary. It is owned by root and the atalaya
# account cannot modify it. Keep it short, keep it free of `eval`, and never
# add `exec` — `stack exec` is `docker compose exec`, which is a remote shell.

set -euo pipefail

STACK="__STACK_BIN__"

die() { printf 'atalaya-stack: %s\n' "$*" >&2; exit 2; }

# One shape for every name we pass on. Refused here, before `stack` is reached.
valid_name() { [[ "$1" =~ ^[a-z0-9][a-z0-9._-]*$ ]]; }

subcommand="${1:-}"
shift || true

case "$subcommand" in
  status)
    # The only one whose argument is optional: bare, it reports every instance.
    [[ $# -eq 0 ]] || valid_name "$1" || die "bad instance name"
    [[ $# -le 1 ]] || die "status takes at most one instance"
    ;;
  versions|logs|rollback|start|stop)
    [[ $# -ge 1 ]] || die "$subcommand needs an instance"
    valid_name "$1" || die "bad instance name"
    [[ $# -eq 1 ]] || die "$subcommand takes no further arguments"
    ;;
  deploy)
    [[ $# -ge 1 ]] || die "deploy needs an instance"
    valid_name "$1" || die "bad instance name"
    # Only --version <tag> may follow, and nothing else.
    if [[ $# -gt 1 ]]; then
      [[ $# -eq 3 && "$2" == "--version" ]] || die "only '--version <tag>' is accepted"
      valid_name "$3" || die "bad version tag"
    fi
    ;;
  backup)
    [[ "${1:-}" == "full" || "${1:-}" == "incremental" ]] \
      || die "backup takes 'full' or 'incremental'"
    [[ $# -eq 1 ]] || die "backup takes no further arguments"
    ;;
  *)
    die "refused: '$subcommand' is not an allowed subcommand"
    ;;
esac

# Forwarded as an array, never re-split from a string.
exec "$STACK" "$subcommand" "$@"
DISPATCHER
)"
  dispatcher_body="${dispatcher_body//__STACK_BIN__/${STACK_DIR}/stack}"
  dispatcher_body="${dispatcher_body//__OWNER__/${STACK_OWNER}}"

  if write_if_changed /usr/local/sbin/atalaya-stack "$dispatcher_body" 0755; then
    chown root:root /usr/local/sbin/atalaya-stack
    changed "dispatcher written to /usr/local/sbin/atalaya-stack"
  else
    info "dispatcher already correct"
  fi

  # One exact path, no wildcard. Validated before being moved into place: a
  # malformed sudoers file can lock every account out of sudo on the machine.
  local sudoers_body="${ATALAYA_USER} ALL=(${STACK_OWNER}) NOPASSWD: /usr/local/sbin/atalaya-stack"
  local staged="/tmp/atalaya-sudoers.$$"
  printf '%s\n' "$sudoers_body" > "$staged"
  chmod 0440 "$staged"

  if ! visudo -c -f "$staged" >/dev/null 2>&1; then
    rm -f "$staged"
    die "the generated sudoers rule is invalid — refusing to install it"
  fi

  if [[ -f /etc/sudoers.d/atalaya ]] \
     && [[ "$(cat /etc/sudoers.d/atalaya)" == "$sudoers_body" ]]; then
    rm -f "$staged"
    info "sudoers rule already correct"
  else
    install -o root -g root -m 0440 "$staged" /etc/sudoers.d/atalaya
    rm -f "$staged"
    changed "sudoers rule written: ${ATALAYA_USER} may run the dispatcher as ${STACK_OWNER}"
  fi

  ok "atalaya can run a fixed list of stack subcommands, and nothing else"
}

# --- Verification ----------------------------------------------------------

verify() {
  step "Verification"

  local failures=0 url body

  url="http://${TAILNET_IP}:${NODE_PORT}/metrics"
  if body="$(curl -sf --max-time 10 "$url" 2>/dev/null)"; then
    local n; n="$(grep -c '^node_' <<<"$body" || true)"
    ok "node_exporter responds ($n host metrics)"
    if grep -q '^node_textfile_scrape_error' <<<"$body"; then
      info "textfile collector active"
    else
      fail "textfile collector is not active: stack's metrics will never arrive"
      failures=$((failures + 1))
    fi
  else
    fail "node_exporter does NOT respond at $url"
    failures=$((failures + 1))
  fi

  # The check that was missing, and that a whole class of silent failure hides
  # behind: stack writes its metrics here as $STACK_OWNER, from cron, with the
  # output discarded.
  if [[ -n $STACK_OWNER ]]; then
    if sudo -u "$STACK_OWNER" test -w "$TEXTFILE_DIR"; then
      ok "$STACK_OWNER can write to $TEXTFILE_DIR"
    else
      fail "$STACK_OWNER cannot write to $TEXTFILE_DIR: stack's metrics would fail silently"
      failures=$((failures + 1))
    fi
  fi

  url="http://${TAILNET_IP}:${CADVISOR_PORT}/metrics"
  local attempt
  for attempt in 1 2 3 4 5 6; do
    body="$(curl -sf --max-time 10 "$url" 2>/dev/null)" && break
    sleep 5
  done

  if [[ -n ${body:-} ]] && grep -q '^container_' <<<"$body"; then
    local n; n="$(grep -c '^container_cpu_usage_seconds_total' <<<"$body" || true)"
    ok "cAdvisor responds ($n containers measured)"

    local first="${LABELS%%,*}" as_metric
    as_metric="container_label_${first//./_}"
    if grep -q "${as_metric}=" <<<"$body"; then
      ok "label '${first}' present in the metrics"
    else
      info "no container carries the '${first}' label yet"
      info "  (set 'client' on the instances in stack and redeploy them)"
    fi
  else
    fail "cAdvisor does NOT respond at $url"
    failures=$((failures + 1))
  fi

  # The account, checked from both sides: what it must be able to do, and what
  # it must not. A door assumed shut is not a door checked shut.
  if id "$ATALAYA_USER" >/dev/null 2>&1; then
    if sudo -u "$ATALAYA_USER" test -r "$STACK_DIR/apps.json"; then
      ok "$ATALAYA_USER reads stack's inventory"
    else
      fail "$ATALAYA_USER cannot read $STACK_DIR/apps.json"
      failures=$((failures + 1))
    fi

    local a_secret
    a_secret="$(find "$STACK_DIR/secrets" -name '*.env' -print -quit 2>/dev/null || true)"
    if [[ -n $a_secret ]]; then
      if sudo -u "$ATALAYA_USER" test -r "$a_secret"; then
        fail "$ATALAYA_USER CAN read $a_secret — secrets must stay out of reach"
        failures=$((failures + 1))
      else
        ok "$ATALAYA_USER cannot read the secrets"
      fi
    fi

    # Sudo, checked as a boundary rather than as a feature. Since the dispatcher
    # exists the account is no longer sudo-less, so what matters is that the one
    # thing it may run is the only thing it may run.
    local allowed; allowed="$(sudo -n -l -U "$ATALAYA_USER" 2>/dev/null || true)"
    if [[ -f /usr/local/sbin/atalaya-stack ]]; then
      if grep -q '/usr/local/sbin/atalaya-stack' <<<"$allowed"; then
        ok "$ATALAYA_USER may run the dispatcher"
      else
        fail "$ATALAYA_USER cannot run the dispatcher — actions from the panel will fail"
        failures=$((failures + 1))
      fi

      if grep -qE '\(ALL\)|NOPASSWD: ALL|\(root\)' <<<"$allowed"; then
        fail "$ATALAYA_USER has sudo beyond the dispatcher"
        failures=$((failures + 1))
      else
        ok "$ATALAYA_USER has no sudo beyond it"
      fi

      # The refusals are the point of the dispatcher, so they are asserted, not
      # assumed. `exec` would be a remote shell; `retire` deletes an instance.
      local refused=0 forbidden
      for forbidden in exec retire add engine; do
        if sudo -n -u "$STACK_OWNER" /usr/local/sbin/atalaya-stack "$forbidden" x 2>/dev/null; then
          fail "the dispatcher ACCEPTED '$forbidden' — it must not"
          failures=$((failures + 1))
        else
          refused=$((refused + 1))
        fi
      done
      if sudo -n -u "$STACK_OWNER" /usr/local/sbin/atalaya-stack deploy 'a; rm -rf /' 2>/dev/null; then
        fail "the dispatcher ACCEPTED an instance name with metacharacters"
        failures=$((failures + 1))
      else
        refused=$((refused + 1))
      fi
      ok "the dispatcher refused $refused disallowed calls"
    elif sudo -n -l -U "$ATALAYA_USER" 2>&1 | grep -q 'not allowed'; then
      info "$ATALAYA_USER has no sudo and no dispatcher: reads only, no actions"
    fi
  fi

  return "$failures"
}

# --- Prometheus target -----------------------------------------------------

print_target() {
  local name; name="$(hostname)"
  step "Prometheus targets"
  cat <<TARGET
  Add these on the Prometheus host. They are split by job because node and
  cAdvisor metrics are queried separately.
  (atalaya will generate them from its database later on.)

  targets/node.json:
    { "targets": ["${TAILNET_IP}:${NODE_PORT}"], "labels": { "server": "${name}" } }

  targets/cadvisor.json:
    { "targets": ["${TAILNET_IP}:${CADVISOR_PORT}"], "labels": { "server": "${name}" } }
TARGET
}

# --- Uninstall -------------------------------------------------------------

uninstall() {
  step "Removing the collectors"

  if [[ -f "${DIRECTORY}/docker-compose.yml" ]]; then
    docker compose -f "${DIRECTORY}/docker-compose.yml" down 2>/dev/null || true
    rm -f "${DIRECTORY}/docker-compose.yml"
    rmdir --ignore-fail-on-non-empty "$DIRECTORY" 2>/dev/null || true
    changed "cAdvisor stopped"
  else
    info "cAdvisor was not installed"
  fi

  if dpkg -s "$NODE_PACKAGE" >/dev/null 2>&1; then
    systemctl disable --now "$NODE_SERVICE" 2>/dev/null || true
    DEBIAN_FRONTEND=noninteractive apt-get purge -y -qq "$NODE_PACKAGE" >/dev/null
    changed "$NODE_PACKAGE removed"
  else
    info "node_exporter was not installed"
  fi

  # The dispatcher and its sudo rule DO go: they are a granted privilege, and
  # leaving them behind after removing the collectors would leave an account
  # able to deploy on a machine nobody is watching any more.
  if [[ -f /etc/sudoers.d/atalaya || -f /usr/local/sbin/atalaya-stack ]]; then
    rm -f /etc/sudoers.d/atalaya /usr/local/sbin/atalaya-stack
    changed "command dispatcher and its sudo rule removed"
  else
    info "no command dispatcher was installed"
  fi

  # Neither the textfile directory nor the account is touched: the first may
  # hold stack's data, and deleting an account is not something to do as a side
  # effect of removing metrics.
  [[ -d $TEXTFILE_DIR ]] && info "kept $TEXTFILE_DIR (may hold stack's data)"
  id "$ATALAYA_USER" >/dev/null 2>&1 && info "kept the $ATALAYA_USER account; remove it by hand if that is intended"

  ok "Removed."
}

# --- Main ------------------------------------------------------------------

main() {
  case "$MODE" in
    check)
      [[ -z $TAILNET_IP ]] && TAILNET_IP="$(detect_tailnet_ip)"
      [[ -d $STACK_DIR ]] && { STACK_OWNER="$(stat -c %U "$STACK_DIR")"; STACK_GROUP="$(stat -c %G "$STACK_DIR")"; }
      if verify; then
        printf '\n%sAll good.%s\n' "$GREEN" "$OFF"
      else
        printf '\n%sSome checks are red.%s Run without --check to fix it.\n' "$RED" "$OFF"
        exit 1
      fi
      ;;

    uninstall)
      [[ $EUID -eq 0 ]] || die "Must run as root: sudo $0 --uninstall"
      uninstall
      ;;

    setup)
      preflight
      install_node_exporter
      install_cadvisor
      setup_atalaya_user
      install_command_dispatcher
      if verify; then
        print_target
        printf '\n%sDone.%s' "$GREEN" "$OFF"
        if [[ $CHANGES -eq 0 ]]; then
          printf ' Nothing to change: everything was already in place.\n'
        else
          printf ' %d change(s) applied.\n' "$CHANGES"
        fi
      else
        printf '\n%sSet up, but some checks are red.%s Review the output above.\n' "$RED" "$OFF"
        exit 1
      fi
      ;;
  esac
}

main
