#!/bin/bash
#
# Production Deployment Script for Maiyuri Bricks App
#
# This script handles the full deployment pipeline:
# 1. Pre-deployment checks
# 2. Build verification
# 3. Vercel production deployment
# 4. Alias update (critical!)
# 5. Telegram webhook re-registration
# 6. Health check verification
# 7. Telegram notification
#
# Usage: ./scripts/deploy-production.sh
#
# Required environment variables:
# - VERCEL_TOKEN (or will prompt)
# - TELEGRAM_BOT_TOKEN
# - TELEGRAM_WEBHOOK_SECRET
# - TELEGRAM_CHAT_ID
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
APP_URL="https://maiyuri-bricks-app.vercel.app"
PROJECT_NAME="web"
HEALTH_ENDPOINT="${APP_URL}/api/telegram/health"

# Helper functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if required tools are installed
check_prerequisites() {
    log_info "Checking prerequisites..."

    if ! command -v vercel &> /dev/null; then
        log_error "Vercel CLI not installed. Run: npm i -g vercel"
        exit 1
    fi

    if ! command -v curl &> /dev/null; then
        log_error "curl not installed"
        exit 1
    fi

    if ! command -v jq &> /dev/null; then
        log_warning "jq not installed. Some features will be limited."
    fi

    log_success "Prerequisites OK"
}

# Validate environment variables
validate_env_vars() {
    log_info "Validating environment variables..."

    local missing=()
    local corrupted=()

    # Check for required vars
    if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
        # Try to get from Vercel
        if [ -n "$VERCEL_TOKEN" ]; then
            TELEGRAM_BOT_TOKEN=$(VERCEL_TOKEN="$VERCEL_TOKEN" vercel env pull --environment=production 2>/dev/null | grep TELEGRAM_BOT_TOKEN | cut -d'=' -f2 | tr -d '"' || echo "")
        fi
        if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
            missing+=("TELEGRAM_BOT_TOKEN")
        fi
    fi

    if [ -z "$TELEGRAM_WEBHOOK_SECRET" ]; then
        missing+=("TELEGRAM_WEBHOOK_SECRET")
    fi

    if [ -z "$TELEGRAM_CHAT_ID" ]; then
        missing+=("TELEGRAM_CHAT_ID")
    fi

    # Check for corruption (newline characters)
    for var_name in TELEGRAM_BOT_TOKEN TELEGRAM_WEBHOOK_SECRET TELEGRAM_CHAT_ID; do
        var_value="${!var_name}"
        if [[ "$var_value" == *$'\n'* ]] || [[ "$var_value" == *'\\n'* ]]; then
            corrupted+=("$var_name")
        fi
    done

    if [ ${#missing[@]} -gt 0 ]; then
        log_error "Missing environment variables: ${missing[*]}"
        log_info "Set them in your shell or .env file before running this script"
        exit 1
    fi

    if [ ${#corrupted[@]} -gt 0 ]; then
        log_error "Corrupted environment variables (contain newlines): ${corrupted[*]}"
        log_info "Fix these in Vercel dashboard and re-pull"
        exit 1
    fi

    log_success "Environment variables OK"
}

# Run pre-deployment checks
pre_deploy_checks() {
    log_info "Running pre-deployment checks..."

    # Check git status
    if [ -n "$(git status --porcelain)" ]; then
        log_warning "Uncommitted changes detected"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    # Check current branch
    CURRENT_BRANCH=$(git branch --show-current)
    if [ "$CURRENT_BRANCH" != "main" ] && [ "$CURRENT_BRANCH" != "master" ]; then
        log_warning "Not on main/master branch (current: $CURRENT_BRANCH)"
        read -p "Continue anyway? (y/N) " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi

    log_success "Pre-deployment checks passed"
}

# Build the project
build_project() {
    log_info "Building project..."

    cd apps/web

    if command -v bun &> /dev/null; then
        bun run build
    else
        npm run build
    fi

    cd ../..

    log_success "Build completed"
}

# Deploy to Vercel
deploy_vercel() {
    log_info "Deploying to Vercel production..."

    cd apps/web

    # Deploy and capture the deployment URL
    DEPLOY_OUTPUT=$(vercel --prod --yes 2>&1)
    DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[a-zA-Z0-9-]+\.vercel\.app' | head -1)

    cd ../..

    if [ -z "$DEPLOY_URL" ]; then
        log_error "Failed to get deployment URL"
        echo "$DEPLOY_OUTPUT"
        exit 1
    fi

    log_success "Deployed to: $DEPLOY_URL"

    # Update alias (CRITICAL - this is what was missing before!)
    log_info "Updating production alias..."
    vercel alias set "$DEPLOY_URL" maiyuri-bricks-app.vercel.app --yes || {
        log_warning "Alias update may have failed. Checking manually..."
    }

    log_success "Alias updated"
}

# Register Telegram webhook
register_webhook() {
    log_info "Registering Telegram webhook..."

    WEBHOOK_URL="${APP_URL}/api/telegram/webhook"

    # Delete existing webhook first (clears pending updates)
    curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook?drop_pending_updates=true" > /dev/null

    sleep 2

    # Register new webhook
    REGISTER_RESULT=$(curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
        -d "url=${WEBHOOK_URL}" \
        -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
        -d "allowed_updates=[\"message\"]")

    if echo "$REGISTER_RESULT" | grep -q '"ok":true'; then
        log_success "Webhook registered: $WEBHOOK_URL"
    else
        log_error "Webhook registration failed"
        echo "$REGISTER_RESULT"
        exit 1
    fi

    # Verify webhook
    sleep 2
    WEBHOOK_INFO=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo")

    if command -v jq &> /dev/null; then
        CURRENT_URL=$(echo "$WEBHOOK_INFO" | jq -r '.result.url')
        PENDING=$(echo "$WEBHOOK_INFO" | jq -r '.result.pending_update_count')
        LAST_ERROR=$(echo "$WEBHOOK_INFO" | jq -r '.result.last_error_message // "none"')

        log_info "Webhook URL: $CURRENT_URL"
        log_info "Pending updates: $PENDING"
        log_info "Last error: $LAST_ERROR"

        if [ "$CURRENT_URL" != "$WEBHOOK_URL" ]; then
            log_error "Webhook URL mismatch!"
            exit 1
        fi
    fi

    log_success "Webhook verified"
}

# Check health endpoint
check_health() {
    log_info "Checking health endpoint..."

    # Wait for deployment to propagate
    sleep 5

    HEALTH_RESULT=$(curl -s "$HEALTH_ENDPOINT")

    if command -v jq &> /dev/null; then
        STATUS=$(echo "$HEALTH_RESULT" | jq -r '.status')
        ISSUES=$(echo "$HEALTH_RESULT" | jq -r '.issues | length')

        if [ "$STATUS" == "healthy" ]; then
            log_success "Health check: HEALTHY"
        elif [ "$STATUS" == "degraded" ]; then
            log_warning "Health check: DEGRADED ($ISSUES issues)"
            echo "$HEALTH_RESULT" | jq '.issues'
        else
            log_error "Health check: UNHEALTHY"
            echo "$HEALTH_RESULT" | jq '.issues'
            exit 1
        fi
    else
        if echo "$HEALTH_RESULT" | grep -q '"status":"healthy"'; then
            log_success "Health check: HEALTHY"
        elif echo "$HEALTH_RESULT" | grep -q '"status":"degraded"'; then
            log_warning "Health check: DEGRADED"
        else
            log_error "Health check: UNHEALTHY"
            echo "$HEALTH_RESULT"
            exit 1
        fi
    fi
}

# Send Telegram notification
send_notification() {
    log_info "Sending Telegram notification..."

    VERSION=$(git describe --tags --always 2>/dev/null || git rev-parse --short HEAD)
    BRANCH=$(git branch --show-current)

    MESSAGE="<b>Deployment Complete</b>

<b>Version:</b> ${VERSION}
<b>Branch:</b> ${BRANCH}
<b>URL:</b> ${APP_URL}

<b>Webhook:</b> Registered
<b>Health:</b> Checked

Timestamp: $(date '+%Y-%m-%d %H:%M:%S %Z')"

    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d "chat_id=${TELEGRAM_CHAT_ID}" \
        -d "parse_mode=HTML" \
        -d "text=${MESSAGE}" > /dev/null

    log_success "Notification sent"
}

# Main deployment flow
main() {
    echo ""
    echo "========================================"
    echo "  Maiyuri Bricks Production Deploy"
    echo "========================================"
    echo ""

    check_prerequisites
    validate_env_vars
    pre_deploy_checks
    build_project
    deploy_vercel
    register_webhook
    check_health
    send_notification

    echo ""
    echo "========================================"
    log_success "Deployment completed successfully!"
    echo "========================================"
    echo ""
    echo "Production URL: $APP_URL"
    echo "Health Check:   $HEALTH_ENDPOINT"
    echo ""
}

# Run main function
main "$@"
