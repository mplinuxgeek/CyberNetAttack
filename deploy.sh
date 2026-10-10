#!/usr/bin/env bash
# Deploy Cyber Net Attack to a remote host and serve it with a basic Python web server.
#
#   ./deploy.sh                       # 192.168.1.50, user $USER, port 8080
#   ./deploy.sh -u pi -p 8088         # other user / port
#   ./deploy.sh --systemd             # install as a systemd service (needs sudo on the host)
#   ./deploy.sh --open-firewall       # also open the port in ufw / firewalld (needs sudo)
#   ./deploy.sh --stop                # stop the server
#
# Needs on the host: ssh access (key auth recommended) and python3. No other software.
set -euo pipefail

HOST="${DEPLOY_HOST:-192.168.1.50}"
USER_="${DEPLOY_USER:-$USER}"
PORT="${DEPLOY_PORT:-8080}"
REMOTE_DIR="${DEPLOY_DIR:-cybernetattack}"      # relative to the remote home
MODE="nohup"; OPEN_FW=0; STOP=0

while [ $# -gt 0 ]; do
  case "$1" in
    -H|--host) HOST="$2"; shift 2 ;;
    -u|--user) USER_="$2"; shift 2 ;;
    -p|--port) PORT="$2"; shift 2 ;;
    -d|--dir)  REMOTE_DIR="$2"; shift 2 ;;
    --systemd) MODE="systemd"; shift ;;
    --open-firewall) OPEN_FW=1; shift ;;
    --stop) STOP=1; shift ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

HERE="$(cd "$(dirname "$0")" && pwd)"
TARGET="$USER_@$HOST"
SSH_OPTS=(-o ConnectTimeout=8 -o StrictHostKeyChecking=accept-new)
ssh_() { ssh "${SSH_OPTS[@]}" "$TARGET" "$@"; }

echo ">> checking ssh to $TARGET"
ssh_ 'true' || { echo "ssh failed. Set up key auth: ssh-copy-id $TARGET" >&2; exit 1; }
ssh_ 'command -v python3 >/dev/null' || { echo "python3 missing on $HOST" >&2; exit 1; }

REMOTE_HOME="$(ssh_ 'printf %s "$HOME"')"
RDIR="$REMOTE_HOME/$REMOTE_DIR"

stop_server() {
  ssh_ "if [ -f '$RDIR/server.pid' ] && kill -0 \$(cat '$RDIR/server.pid') 2>/dev/null; then kill \$(cat '$RDIR/server.pid'); echo stopped pid \$(cat '$RDIR/server.pid'); rm -f '$RDIR/server.pid'; fi" || true
  if [ "$MODE" = "systemd" ] || [ "$STOP" = 1 ]; then
    ssh_ "sudo -n systemctl stop cybernetattack 2>/dev/null || true"
  fi
}

if [ "$STOP" = 1 ]; then stop_server; echo "stopped"; exit 0; fi

# the port must be free (unless it is our own server, which we stop first)
stop_server
if ssh_ "python3 - <<'PY'
import socket,sys
s=socket.socket()
s.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
try:
    s.bind(('0.0.0.0',$PORT))
except OSError:
    sys.exit(1)
PY"; then :; else
  echo "port $PORT is already in use on $HOST by something else. Pick another with -p." >&2; exit 1
fi

echo ">> copying game to $TARGET:$RDIR"
ssh_ "mkdir -p '$RDIR'"
FILES=(index.html game.js sw.js manifest.webmanifest)
if command -v rsync >/dev/null; then
  rsync -az -e "ssh ${SSH_OPTS[*]}" "${FILES[@]/#/$HERE/}" "$HERE/tools/serve.py" "$TARGET:$RDIR/"
  rsync -az --delete --exclude=_archive -e "ssh ${SSH_OPTS[*]}" "$HERE/assets/" "$TARGET:$RDIR/assets/"
else
  scp "${SSH_OPTS[@]}" "${FILES[@]/#/$HERE/}" "$HERE/tools/serve.py" "$TARGET:$RDIR/"
  scp -r "${SSH_OPTS[@]}" "$HERE/assets" "$TARGET:$RDIR/"
fi

if [ "$OPEN_FW" = 1 ]; then
  echo ">> opening port $PORT in the host firewall"
  ssh_ "if command -v ufw >/dev/null && sudo -n ufw status | grep -q active; then sudo -n ufw allow $PORT/tcp;
        elif command -v firewall-cmd >/dev/null && sudo -n firewall-cmd --state >/dev/null 2>&1; then sudo -n firewall-cmd --permanent --add-port=$PORT/tcp && sudo -n firewall-cmd --reload;
        else echo 'no active ufw/firewalld found; nothing to open'; fi" || echo "firewall step failed (needs passwordless sudo)" >&2
fi

if [ "$MODE" = "systemd" ]; then
  echo ">> installing systemd service"
  ssh_ "sudo -n tee /etc/systemd/system/cybernetattack.service >/dev/null" <<EOF
[Unit]
Description=Cyber Net Attack web server
After=network.target

[Service]
User=$USER_
WorkingDirectory=$RDIR
ExecStart=/usr/bin/env python3 $RDIR/serve.py --port $PORT --dir $RDIR
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF
  ssh_ "sudo -n systemctl daemon-reload && sudo -n systemctl enable --now cybernetattack && sudo -n systemctl restart cybernetattack"
else
  echo ">> starting server (nohup, pid file in $RDIR)"
  ssh_ "cd '$RDIR' && { setsid nohup python3 serve.py --port $PORT --dir '$RDIR' > server.log 2>&1 < /dev/null & echo \$! > server.pid; }"
fi

echo ">> verifying"
ok=0
for _ in 1 2 3 4 5 6 7 8; do
  if curl -fsS -m 3 -o /dev/null "http://$HOST:$PORT/index.html"; then ok=1; break; fi
  sleep 1
done
if [ "$ok" = 1 ]; then
  echo "OK  http://$HOST:$PORT/"
else
  echo "server started but http://$HOST:$PORT/ is not reachable from here." >&2
  echo "likely a host firewall: rerun with --open-firewall, or open $PORT/tcp yourself. Log: $RDIR/server.log" >&2
  exit 1
fi
