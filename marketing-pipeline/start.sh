#!/bin/bash
# Stori Marketing Pipeline — startup script
# Usage: bash start.sh
# Then open: http://localhost:8080/marketing-pipeline/index.html

NODE=/usr/local/bin/node
NPX=/usr/local/bin/npx
PROXY="$(dirname "$0")/kling-proxy.js"
SERVE_DIR="$(dirname "$0")/.."

# Kill any existing instances on these ports
lsof -ti :3004 | xargs kill -9 2>/dev/null
lsof -ti :8080 | xargs kill -9 2>/dev/null

echo "Starting Kling proxy on port 3004..."
$NODE "$PROXY" &
PROXY_PID=$!

echo "Starting file server on port 8080..."
PATH=/usr/local/bin:$PATH $NODE $NPX serve -l 8080 "$SERVE_DIR" &
SERVER_PID=$!

echo ""
echo "✓ Kling proxy  → http://localhost:3004"
echo "✓ File server  → http://localhost:8080"
echo ""
echo "Open: http://localhost:8080/marketing-pipeline/index.html"
echo ""
echo "Press Ctrl+C to stop both servers."

# Keep script running; kill children on exit
trap "kill $PROXY_PID $SERVER_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
