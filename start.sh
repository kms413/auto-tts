#!/usr/bin/env bash
#
# One-command launcher for auto-tts.
#
# It prepares the Python virtualenv, installs the backend and frontend
# dependencies, builds the frontend, then serves the API and the built UI from a
# single port. Run it with no arguments and open the printed URL.
#
#   ./start.sh                 first run installs everything, then serves
#   ./start.sh --rebuild       force a fresh frontend build
#   ./start.sh --dev           run the API with reload plus the Vite dev server
#   ./start.sh --port=9000     serve on a different port
#
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_DIR="$ROOT_DIR/.venv"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

HOST="${AUTO_TTS_HOST:-127.0.0.1}"
PORT="${AUTO_TTS_PORT:-8000}"
MODE="serve"
FORCE_BUILD=0

usage() {
  cat <<'EOF'
One-command launcher for auto-tts.

It prepares the Python virtualenv, installs the backend and frontend
dependencies, builds the frontend, then serves the API and the built UI from a
single port. Run it with no arguments and open the printed URL.

  ./start.sh                 first run installs everything, then serves
  ./start.sh --rebuild       force a fresh frontend build
  ./start.sh --dev           run the API with reload plus the Vite dev server
  ./start.sh --port=9000     serve on a different port
EOF
}

for arg in "$@"; do
  case "$arg" in
    --dev) MODE="dev" ;;
    --rebuild) FORCE_BUILD=1 ;;
    --port=*) PORT="${arg#*=}" ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 1 ;;
  esac
done

find_python() {
  for candidate in python3 python; do
    if command -v "$candidate" >/dev/null 2>&1; then
      echo "$candidate"
      return 0
    fi
  done
  echo "Python 3 is required but was not found on PATH." >&2
  exit 1
}

find_node_runner() {
  if command -v pnpm >/dev/null 2>&1; then
    echo "pnpm"
  elif command -v npm >/dev/null 2>&1; then
    echo "npm"
  else
    echo "Node.js (pnpm or npm) is required but was not found on PATH." >&2
    exit 1
  fi
}

ensure_venv() {
  if [ -x "$VENV_DIR/bin/python" ]; then
    return
  fi
  echo "==> Creating the Python virtualenv"
  "$(find_python)" -m venv "$VENV_DIR"
}

ensure_python_deps() {
  if "$VENV_DIR/bin/python" -c "import edge_tts, fastapi, uvicorn" >/dev/null 2>&1; then
    echo "==> Python dependencies already installed"
    return
  fi
  echo "==> Installing Python dependencies"
  "$VENV_DIR/bin/python" -m pip install --quiet --upgrade pip
  "$VENV_DIR/bin/python" -m pip install --quiet -r "$BACKEND_DIR/requirements.txt"
}

ensure_frontend_deps() {
  local runner="$1"
  if [ -d "$FRONTEND_DIR/node_modules" ]; then
    echo "==> Frontend dependencies already installed"
    return
  fi
  echo "==> Installing frontend dependencies"
  (cd "$FRONTEND_DIR" && "$runner" install)
}

build_frontend() {
  local runner="$1"
  if [ "$FORCE_BUILD" -ne 1 ] && [ -f "$FRONTEND_DIR/dist/index.html" ]; then
    echo "==> Frontend already built (use --rebuild to rebuild)"
    return
  fi
  echo "==> Building the frontend"
  (cd "$FRONTEND_DIR" && "$runner" run build)
}

ensure_port_free() {
  local host="$1" port="$2"
  if "$VENV_DIR/bin/python" - "$host" "$port" <<'PY'
import socket
import sys

# Mirror uvicorn's own settings: SO_REUSEADDR lets the bind succeed while
# leftover TIME_WAIT sockets linger, and still fails when a live server listens.
sock = socket.socket()
sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    sock.bind((sys.argv[1], int(sys.argv[2])))
except OSError:
    sys.exit(1)
finally:
    sock.close()
PY
  then
    return
  fi

  # A previous instance is the likeliest cause, so point at that first.
  echo "Port $port is already in use." >&2
  echo "If auto-tts is already running, just open http://$host:$port" >&2
  echo "Otherwise stop the process holding the port, or pick another one:" >&2
  echo "  ./start.sh --port=9000" >&2
  exit 1
}

serve_single_port() {
  ensure_port_free "$HOST" "$PORT"
  echo "==> auto-tts is ready at http://$HOST:$PORT"
  exec "$VENV_DIR/bin/python" -m uvicorn app.main:app \
    --app-dir "$BACKEND_DIR" --host "$HOST" --port "$PORT"
}

serve_dev() {
  ensure_port_free "127.0.0.1" 8000
  echo "==> Backend on http://127.0.0.1:8000, dev UI on http://127.0.0.1:5173"
  "$VENV_DIR/bin/python" -m uvicorn app.main:app \
    --app-dir "$BACKEND_DIR" --host 127.0.0.1 --port 8000 --reload &
  local backend_pid=$!
  trap 'kill "$backend_pid" 2>/dev/null || true' EXIT
  (cd "$FRONTEND_DIR" && "$(find_node_runner)" run dev)
}

ensure_venv
ensure_python_deps

if [ "$MODE" = "dev" ]; then
  ensure_frontend_deps "$(find_node_runner)"
  serve_dev
else
  RUNNER="$(find_node_runner)"
  ensure_frontend_deps "$RUNNER"
  build_frontend "$RUNNER"
  serve_single_port
fi