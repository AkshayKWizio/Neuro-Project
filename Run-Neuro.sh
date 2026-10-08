#!/usr/bin/env bash
# Run-Neuro.sh: Single-click launcher for macOS
set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
DASHBOARD_ROOT="$PROJECT_ROOT/glove-dashboard"
VENV_DIR="$DASHBOARD_ROOT/backend/.venv"
VENV_PYTHON="$VENV_DIR/bin/python"

echo "=== Launching Neuro Rehabilitation Platform ==="

# 1. Ensure Python virtual environment exists
if [ ! -f "$VENV_PYTHON" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv "$VENV_DIR"
    "$VENV_PYTHON" -m pip install --upgrade pip
    "$VENV_PYTHON" -m pip install -r "$DASHBOARD_ROOT/backend/requirements.txt"
fi

# 2. Stop any previous instance on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null || true

# 3. Start Python backend in background
cd "$DASHBOARD_ROOT"
"$VENV_PYTHON" -m uvicorn backend.server:app --host 127.0.0.1 --port 3000 &
BACKEND_PID=$!
echo "Backend running (PID: $BACKEND_PID)"

# 4. Wait for backend to be ready
echo "Waiting for local bridge readiness..."
READY=false
for i in {1..30}; do
    if curl -s http://127.0.0.1:3000/api/health >/dev/null; then
        READY=true
        break
    fi
    sleep 0.5
done

if [ "$READY" = false ]; then
    echo "Backend failed to become ready."
    kill "$BACKEND_PID" 2>/dev/null || true
    exit 1
fi

echo "Neuro is ready at http://127.0.0.1:3000/"

# 5. Launch in standalone desktop application window mode (no browser address bar)
if [ -d "/Applications/Google Chrome.app" ]; then
    echo "Opening in Google Chrome App Mode..."
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --app="http://127.0.0.1:3000/" --window-size=1440,900
elif [ -d "/Applications/Microsoft Edge.app" ]; then
    echo "Opening in Microsoft Edge App Mode..."
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" --app="http://127.0.0.1:3000/" --window-size=1440,900
else
    echo "Opening in default browser..."
    open "http://127.0.0.1:3000/"
fi
