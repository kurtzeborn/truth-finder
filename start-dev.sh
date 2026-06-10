#!/bin/bash
# Start the local development environment for One Truth

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "🎯 One Truth - Local Development Setup"
echo "========================================"
echo ""

# Check prerequisites
echo "🔧 Checking dependencies..."

if ! command -v node &> /dev/null; then
    echo "   ✗ Node.js not found. Install from https://nodejs.org/"
    exit 1
fi
echo "   ✓ Node.js: $(node --version)"

if ! npx swa --version &> /dev/null; then
    echo "   Installing SWA CLI..."
    npm install -g @azure/static-web-apps-cli
fi
echo "   ✓ SWA CLI available"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
if [ ! -d "$SCRIPT_DIR/api/node_modules" ]; then
    cd "$SCRIPT_DIR/api" && npm install
fi
echo "   ✓ API dependencies installed"

if [ ! -d "$SCRIPT_DIR/web/node_modules" ]; then
    cd "$SCRIPT_DIR/web" && npm install
fi
echo "   ✓ Web dependencies installed"

# Build API
echo ""
echo "🔨 Building API..."
cd "$SCRIPT_DIR/api" && npm run build
echo "   ✓ API build complete"

# Start SWA CLI
echo ""
echo "═══════════════════════════════════════════"
echo "  Starting SWA CLI..."
echo "  🌐 Web App:  http://localhost:4280"
echo "  ⚡ API:      http://localhost:4280/api"
echo "  Press Ctrl+C to stop"
echo "═══════════════════════════════════════════"
echo ""

cd "$SCRIPT_DIR"
swa start web --api-location api --run "cd web && npm run dev" --api-devserver-url http://localhost:7071
