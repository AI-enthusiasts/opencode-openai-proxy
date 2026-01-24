#!/usr/bin/env bash
set -euo pipefail

# Deploy opencode-openai-proxy to a server
# Usage: ./scripts/deploy.sh user@server.com [--no-auth]

REPO_URL="https://github.com/AI-enthusiasts/opencode-openai-proxy.git"
REMOTE_DIR="/opt/opencode-proxy"
DATA_DIR="$REMOTE_DIR/data"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() { echo -e "${GREEN}[deploy]${NC} $1"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $1"; }
error() { echo -e "${RED}[deploy]${NC} $1" >&2; exit 1; }

# Parse arguments
SERVER=""
SKIP_AUTH=false

for arg in "$@"; do
    case $arg in
        --no-auth) SKIP_AUTH=true ;;
        -*) error "Unknown flag: $arg" ;;
        *) SERVER="$arg" ;;
    esac
done

[[ -z "$SERVER" ]] && error "Usage: $0 user@server.com [--no-auth]"

# Find local auth.json
find_auth_json() {
    local paths=(
        "$HOME/.local/share/opencode/auth.json"           # Linux/Mac
        "$APPDATA/opencode/auth.json"                      # Windows (Git Bash)
        "$LOCALAPPDATA/opencode/auth.json"                 # Windows alt
        "$HOME/AppData/Local/opencode/auth.json"           # Windows (explicit)
    )
    
    for path in "${paths[@]}"; do
        [[ -f "$path" ]] && echo "$path" && return 0
    done
    return 1
}

# Copy auth.json to server
deploy_auth() {
    if $SKIP_AUTH; then
        warn "Skipping auth.json (--no-auth)"
        return 0
    fi
    
    local auth_json
    if ! auth_json=$(find_auth_json); then
        error "auth.json not found. Run 'opencode auth login' first or use --no-auth"
    fi
    
    log "Copying auth.json from $auth_json"
    ssh "$SERVER" "mkdir -p $DATA_DIR"
    scp "$auth_json" "$SERVER:$DATA_DIR/auth.json"
}

# Deploy or update repo
deploy_repo() {
    log "Checking remote repository..."
    
    if ssh "$SERVER" "test -d $REMOTE_DIR/app/.git"; then
        log "Updating existing deployment..."
        ssh "$SERVER" "cd $REMOTE_DIR/app && git pull --ff-only"
    else
        log "First deployment - cloning repository..."
        ssh "$SERVER" "mkdir -p $REMOTE_DIR && git clone $REPO_URL $REMOTE_DIR/app"
    fi
}

# Start/restart container
deploy_container() {
    log "Starting container..."
    ssh "$SERVER" "cd $REMOTE_DIR/app && docker compose up -d --build"
    
    log "Waiting for health check..."
    sleep 3
    
    if ssh "$SERVER" "curl -sf http://localhost:8080/health > /dev/null"; then
        log "Health check passed"
    else
        warn "Health check failed - check logs with: ssh $SERVER 'cd $REMOTE_DIR/app && docker compose logs'"
    fi
}

# Main
log "Deploying to $SERVER"
deploy_auth
deploy_repo
deploy_container

echo ""
log "Done! Proxy running at http://$SERVER:8080"
log "Test: curl http://$SERVER:8080/health"
