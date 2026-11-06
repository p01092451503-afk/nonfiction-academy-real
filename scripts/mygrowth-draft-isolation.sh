#!/usr/bin/env bash
# My Growth draft isolation guard.
# Runs ONLY inside a Lovable draft sandbox with its own local backend.
# It never touches the live app: every change below targets this draft's
# local services, runtime files and local database.
#
# Usage (as root, inside the draft sandbox):
#   bash scripts/mygrowth-draft-isolation.sh apply    # apply blocks + start guard timer
#   bash scripts/mygrowth-draft-isolation.sh verify   # check blocks, exit 1 on any failure
#   bash scripts/mygrowth-draft-isolation.sh probe    # live probes (external fetch, auth mail)
#
# Blocks are runtime-only (sandbox /etc is read-only). After a sandbox restart
# run `apply` again; `verify` fails closed until it is re-applied.
set -uo pipefail

MODE="${1:-verify}"
STATE=/persist/mygrowth-isolation
RUNDIR=/run/mygrowth-isolation
BLOCK="DRAFT-BLOCKED"
PROXY="http://127.0.0.1:9"
# Allowlist: local services + public module CDNs that functions import code from.
NOPROXY="127.0.0.1,localhost,::1,esm.sh,deno.land,jsr.io"
SINK_IP="127.0.0.9"
# Production integrations and live app hosts: resolved to a dead local address
# inside every draft backend service (shared hosts file).
SINK_HOSTS="hooks.slack.com slack.com api.slack.com video.bunnycdn.com api.bunny.net storage.bunnycdn.com sg.storage.bunnycdn.com iframe.mediadelivery.net v.kr.kollus.com api.kollus.com ai.gateway.lovable.dev connector-gateway.lovable.dev api.lovable.dev api.resend.com nonfiction-academy.lovable.app nonfiction-academy-real.lovable.app nonfiction-academy.webheads.co.kr academy.biz-nonfiction.com example.com"
HOSTS_FILE=/run/supabase/hosts
SELF="$(readlink -f "$0")"

die() { echo "FAIL: $*"; exit 1; }

# ---- draft-only safety gate -------------------------------------------------
[ "$(id -u)" = 0 ] || die "must run as root inside the draft sandbox"
[ -d /persist/supabase ] && [ -f /run/supabase/env/functions.env ] || die "not a draft sandbox"
grep -qE '^PUBLIC_SITE_URL=https://[^/]*-thr' /run/supabase/env/functions.env \
  || die "backend host is not a draft host; refusing to run"

sa() { env -u PGSERVICE -u PGSERVICEFILE psql "host=127.0.0.1 port=8004 user=supabase_admin dbname=postgres" -Atq -v ON_ERROR_STOP=1 "$@"; }
fpid() { systemctl show supabase-functions -p MainPID --value; }
gpid() { systemctl show supabase-gotrue -p MainPID --value; }

sanitize_files() {
  python3 - "$BLOCK" "$(fpid)" <<'PY'
import json, os, sys, tempfile
block, fpid = sys.argv[1], sys.argv[2]
changed = []

def write(path, text):
    st = os.stat(path)
    d = os.path.dirname(path)
    fd, tmp = tempfile.mkstemp(dir=d)
    with os.fdopen(fd, "w") as f:
        f.write(text)
    os.chmod(tmp, st.st_mode & 0o777)
    os.chown(tmp, st.st_uid, st.st_gid)
    os.replace(tmp, path)

def blocked_json(raw):
    try:
        d = json.loads(raw)
    except Exception:
        d = {}
    return json.dumps({k: block for k in d}, separators=(",", ":"))

# 1) function secrets: keep names, replace every value
p = "/persist/supabase/function-secrets.json"
if os.path.exists(p):
    d = json.load(open(p))
    if any(v != block for v in d.values()):
        write(p, json.dumps({k: block for k in d}))
        changed.append(p)

# 2) env files that carry LOVABLE_FUNCTION_SECRETS
paths = ["/run/supabase/env/functions.env", "/run/supabase/live/functions/env"]
for p in paths:
    if not os.path.exists(p):
        continue
    out, dirty = [], False
    for line in open(p).read().splitlines():
        if line.startswith("LOVABLE_FUNCTION_SECRETS="):
            raw = line.split("=", 1)[1].replace("\\\\", "\\")
            new = "LOVABLE_FUNCTION_SECRETS=" + blocked_json(raw)
            dirty |= new != line
            line = new
        out.append(line)
    if dirty:
        write(p, "\n".join(out) + "\n")
        changed.append(p)

# 3) auth env files: no external mail hook, no external sign-in providers
force = {
    "GOTRUE_HOOK_SEND_EMAIL_ENABLED": "false",
    "GOTRUE_HOOK_SEND_EMAIL_URI": "",
    "GOTRUE_EXTERNAL_GOOGLE_ENABLED": "false",
    "GOTRUE_EXTERNAL_AZURE_ENABLED": "false",
    "GOTRUE_EXTERNAL_APPLE_ENABLED": "false",
}
for p in ["/persist/supabase/gotrue.env", "/run/supabase/env/gotrue.env"]:
    if not os.path.exists(p):
        continue
    out, dirty = [], False
    for line in open(p).read().splitlines():
        k = line.split("=", 1)[0]
        if k == "GOTRUE_HOOK_SEND_EMAIL_SECRETS":
            dirty = True
            continue
        if k in force:
            new = f"{k}={force[k]}"
            dirty |= new != line
            line = new
        out.append(line)
    if dirty:
        write(p, "\n".join(out) + "\n")
        changed.append(p)

for c in changed:
    print("sanitized:", c)
PY
}

write_dropins() {
  mkdir -p "$RUNDIR" "$STATE"
  chmod 700 "$RUNDIR" "$STATE"
  cat > "$RUNDIR/gotrue-override.env" <<EOF
GOTRUE_HOOK_SEND_EMAIL_ENABLED=false
GOTRUE_HOOK_SEND_EMAIL_URI=
GOTRUE_HOOK_SEND_EMAIL_SECRETS=
GOTRUE_EXTERNAL_GOOGLE_ENABLED=false
GOTRUE_EXTERNAL_AZURE_ENABLED=false
GOTRUE_EXTERNAL_APPLE_ENABLED=false
GOTRUE_SMTP_HOST=127.0.0.1
GOTRUE_SMTP_PORT=11025
EOF
  local secrets
  secrets="$(python3 -c "import json;print(json.dumps({k:'$BLOCK' for k in json.load(open('/persist/supabase/function-secrets.json'))},separators=(',',':')))")"
  printf 'LOVABLE_FUNCTION_SECRETS=%s\n' "$secrets" > "$RUNDIR/functions-override.env"
  chmod 600 "$RUNDIR"/*.env

  local proxy_env="Environment=HTTP_PROXY=$PROXY HTTPS_PROXY=$PROXY ALL_PROXY=$PROXY http_proxy=$PROXY https_proxy=$PROXY all_proxy=$PROXY NO_PROXY=$NOPROXY no_proxy=$NOPROXY"
  local changed=0
  for svc in gotrue functions storage; do
    local dir="/run/systemd/system/supabase-$svc.service.d" f
    f="$dir/90-mygrowth-isolation.conf"
    mkdir -p "$dir"
    local body="[Service]
$proxy_env"
    [ "$svc" = gotrue ] && body="$body
EnvironmentFile=$RUNDIR/gotrue-override.env"
    [ "$svc" = functions ] && body="$body
EnvironmentFile=$RUNDIR/functions-override.env"
    if [ ! -f "$f" ] || [ "$(cat "$f")" != "$body" ]; then
      printf '%s\n' "$body" > "$f"
      changed=1
    fi
  done
  echo "$changed"
}

needs_restart() {
  # restart a service if its running process lacks the isolation env
  local pid="$1" key="$2" val="$3"
  [ -n "$pid" ] && [ "$pid" != 0 ] || return 0
  tr '\0' '\n' < "/proc/$pid/environ" | grep -qxF "$key=$val" && return 1 || return 0
}

apply_db() {
  sa <<'SQL'
revoke usage on schema net from public, anon, authenticated, service_role, postgres, supabase_functions_admin;
revoke execute on all functions in schema net from public, anon, authenticated, service_role, postgres, supabase_functions_admin;
revoke usage on schema cron from public, anon, authenticated, service_role, postgres;
revoke execute on all functions in schema cron from public, anon, authenticated, service_role, postgres;
update cron.job set active = false where active;
delete from net.http_request_queue;
SQL
}

install_timer() {
  mkdir -p "$STATE"
  install -m 700 "$SELF" "$STATE/guard.sh"
  cat > /run/systemd/system/mygrowth-isolation-guard.service <<EOF
[Unit]
Description=My Growth draft isolation guard (draft-only)
[Service]
Type=oneshot
Environment=PATH=$PATH GUARD_RUN=1
ExecStart=/bin/bash $STATE/guard.sh reapply
EOF
  cat > /run/systemd/system/mygrowth-isolation-guard.timer <<EOF
[Unit]
Description=Re-check My Growth draft isolation every 20 seconds
[Timer]
OnActiveSec=5s
OnUnitActiveSec=20s
AccuracySec=1s
[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl start mygrowth-isolation-guard.timer
}

apply_hosts() {
  local h
  for h in $SINK_HOSTS; do
    grep -qE "^$SINK_IP[[:space:]]+$h\$" "$HOSTS_FILE" || echo "$SINK_IP $h" >> "$HOSTS_FILE"
  done
}

do_apply() {
  apply_hosts
  sanitize_files
  local dchanged
  dchanged="$(write_dropins)"
  [ "$dchanged" = 1 ] && systemctl daemon-reload
  if needs_restart "$(gpid)" HTTPS_PROXY "$PROXY" || needs_restart "$(gpid)" GOTRUE_HOOK_SEND_EMAIL_ENABLED false; then
    systemctl restart supabase-gotrue && echo "restarted: auth"
  fi
  if needs_restart "$(fpid)" HTTPS_PROXY "$PROXY"; then
    systemctl restart supabase-functions && echo "restarted: functions"
    sleep 2
    sanitize_files
  fi
  if needs_restart "$(systemctl show supabase-storage -p MainPID --value)" HTTPS_PROXY "$PROXY"; then
    systemctl restart supabase-storage && echo "restarted: storage"
  fi
  apply_db
}

# ---- verification -----------------------------------------------------------
RESULTS=()
check() { # name, command...
  local name="$1"; shift
  if "$@" >/dev/null 2>&1; then RESULTS+=("PASS|$name"); else RESULTS+=("FAIL|$name"); fi
}
penv() { tr '\0' '\n' < "/proc/$1/environ" | grep -qxF "$2"; }
no_real_secrets() {
  python3 - "$1" "$BLOCK" <<'PY'
import json, sys
p, block = sys.argv[1], sys.argv[2]
txt = open(p).read()
if p.endswith(".json"):
    d = json.loads(txt)
else:
    line = next((l for l in txt.splitlines() if l.startswith("LOVABLE_FUNCTION_SECRETS=")), "LOVABLE_FUNCTION_SECRETS={}")
    d = json.loads(line.split("=", 1)[1].replace("\\\\", "\\"))
sys.exit(0 if all(v == block for v in d.values()) else 1)
PY
}
hosts_ok() {
  local h
  for h in $SINK_HOSTS; do grep -qE "^$SINK_IP[[:space:]]+$h\$" "$HOSTS_FILE" || return 1; done
}
sqlzero() { [ "$(sa -c "$1")" = "0" ]; }
sqlfalse() { [ "$(sa -c "$1")" = "f" ]; }

do_verify() {
  local G F S
  G="$(gpid)"; F="$(fpid)"; S="$(systemctl show supabase-storage -p MainPID --value)"
  check "auth: external mail hook disabled (running process)" penv "$G" GOTRUE_HOOK_SEND_EMAIL_ENABLED=false
  check "auth: Google sign-in disabled" penv "$G" GOTRUE_EXTERNAL_GOOGLE_ENABLED=false
  check "auth: Azure sign-in disabled" penv "$G" GOTRUE_EXTERNAL_AZURE_ENABLED=false
  check "auth: Apple sign-in disabled" penv "$G" GOTRUE_EXTERNAL_APPLE_ENABLED=false
  check "auth: SMTP is local mailbox only" penv "$G" GOTRUE_SMTP_HOST=127.0.0.1
  check "auth: outbound HTTP forced to dead proxy" penv "$G" HTTPS_PROXY=$PROXY
  check "functions: outbound HTTP forced to dead proxy" penv "$F" HTTPS_PROXY=$PROXY
  check "functions: stored secrets replaced" no_real_secrets /persist/supabase/function-secrets.json
  check "functions: live worker secrets replaced" no_real_secrets /run/supabase/live/functions/env
  check "network: production integration hosts sinkholed" hosts_ok
  check "functions: process secrets replaced" no_real_secrets /run/supabase/env/functions.env
  check "storage: outbound HTTP forced to dead proxy" penv "$S" HTTPS_PROXY=$PROXY
  check "storage: local file backend only (no S3 settings)" bash -c "! grep -qE '^(GLOBAL_S3|STORAGE_BACKEND=s3|AWS_)' /run/supabase/env/storage.env"
  check "mailbox: no external relay" bash -c "! systemctl show supabase-mailpit -p ExecStart --value | grep -q relay"
  check "jobs: no active scheduled jobs" sqlzero "select count(*) from cron.job where active"
  check "jobs: app roles cannot schedule jobs" sqlfalse "select has_function_privilege('postgres','cron.schedule(text,text,text)','execute') or has_function_privilege('service_role','cron.schedule(text,text,text)','execute')"
  check "db: app roles cannot send HTTP (pg_net)" sqlfalse "select bool_or(has_function_privilege(r,'net.http_post(text,jsonb,jsonb,jsonb,integer)','execute')) from unnest(array['anon','authenticated','service_role','postgres','authenticator','supabase_functions_admin']) r"
  check "db: no queued outbound HTTP requests" sqlzero "select count(*) from net.http_request_queue"
  check "guard: re-check timer running" systemctl is-active --quiet mygrowth-isolation-guard.timer
  if [ -z "${GUARD_RUN:-}" ]; then
    check "guard: last automatic re-check succeeded" bash -c '[ "$(systemctl show mygrowth-isolation-guard.service -p Result --value)" = success ]'
  fi

  local fail=0 ts
  ts="$(date -u +%FT%TZ)"
  mkdir -p "$STATE"
  { echo "checked_at=$ts"; printf '%s\n' "${RESULTS[@]}"; } > "$STATE/status.txt"
  printf '%s\n' "${RESULTS[@]}"
  for r in "${RESULTS[@]}"; do [[ "$r" == FAIL* ]] && fail=1; done
  [ $fail = 0 ] && echo "OVERALL=PASS ($ts)" || echo "OVERALL=FAIL ($ts)"
  return $fail
}

do_probe() {
  local dir out uid
  # temporary probe function in this draft's checkout; never committed, removed on return
  dir="/dev-server/supabase/functions/zz-isolation-probe"
  trap 'rm -rf /dev-server/supabase/functions/zz-isolation-probe' RETURN
  mkdir -p "$dir"
  cat > "$dir/index.ts" <<'TS'
const targets = ["https://www.google.com/", "https://example.com/", "https://hooks.slack.com/", "https://api.bunny.net/", "https://api.lovable.dev/"];
Deno.serve(async () => {
  const out: Record<string, string> = {};
  for (const t of targets) {
    try {
      const r = await fetch(t, { signal: AbortSignal.timeout(8000) });
      out[t] = "REACHED status " + r.status;
    } catch (e) {
      out[t] = "BLOCKED " + String(e).slice(0, 120);
    }
  }
  const secretValues = ["SLACK_API_KEY", "BUNNY_STREAM_API_KEY", "KOLLUS_API_KEY", "LOVABLE_API_KEY"]
    .map((k) => `${k}=${Deno.env.get(k) === "DRAFT-BLOCKED" ? "blocked" : Deno.env.get(k) ? "REAL VALUE PRESENT" : "missing"}`);
  return new Response(JSON.stringify({ out, secretValues }, null, 1), { headers: { "content-type": "application/json" } });
});
TS
  out="$(curl -s -m 60 -X POST http://127.0.0.1:8008/zz-isolation-probe \
    -H "Authorization: Bearer $(grep ^SUPABASE_ANON_KEY= /run/supabase/env/functions.env | cut -d= -f2-)" \
    -H "apikey: $(grep ^SUPABASE_ANON_KEY= /run/supabase/env/functions.env | cut -d= -f2-)")"
  rm -rf "$dir"
  echo "functions probe: $out"

  # auth mail: request a password reset for a synthetic address and check local mailbox
  local anon before after addr
  anon="$(grep ^SUPABASE_ANON_KEY= /run/supabase/env/functions.env | cut -d= -f2-)"
  addr="isolation-probe-$(date +%s)@draft.invalid"
  uid="$(curl -s -X POST http://127.0.0.1:8001/auth/v1/admin/users -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY:-}" \
    -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY:-}" -H "Content-Type: application/json" \
    -d "{\"email\":\"$addr\",\"email_confirm\":true}" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("id",""))')"
  before="$(curl -s http://127.0.0.1:18025/api/v1/messages | python3 -c 'import json,sys;print(json.load(sys.stdin).get("total",0))')"
  curl -s -o /dev/null -w "auth recover HTTP %{http_code}\n" -X POST http://127.0.0.1:8001/auth/v1/recover \
    -H "apikey: $anon" -H "Content-Type: application/json" -d "{\"email\":\"$addr\"}"
  sleep 3
  after="$(curl -s http://127.0.0.1:18025/api/v1/messages | python3 -c 'import json,sys;print(json.load(sys.stdin).get("total",0))')"
  echo "local mailbox messages: before=$before after=$after (to=$addr)"
  [ -n "$uid" ] && curl -s -o /dev/null -w "probe user removed HTTP %{http_code}\n" -X DELETE "http://127.0.0.1:8001/auth/v1/admin/users/$uid" \
    -H "apikey: ${SUPABASE_SERVICE_ROLE_KEY:-}" -H "Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY:-}"
  journalctl -u supabase-gotrue --since "-30s" --no-pager -o cat 2>/dev/null | grep -iE 'hook|smtp|mail' | tail -5 | cut -c1-240
}

case "$MODE" in
  apply)   do_apply; install_timer; sleep 6; do_verify ;;
  reapply) do_apply >/dev/null; do_verify >/dev/null ;;
  verify)  do_verify ;;
  probe)   do_probe ;;
  *) die "unknown mode: $MODE" ;;
esac
