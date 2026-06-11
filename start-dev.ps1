<#
.SYNOPSIS
    Start the local development environment for Spot the Lie.

.DESCRIPTION
    Uses SWA CLI with Azurite for local development.
    Works on both ARM64 and x64 Windows.

.PARAMETER SkipSeed
    Skip seeding the database with sample data.
#>

param(
    [switch]$SkipSeed
)

$ErrorActionPreference = "Stop"

Write-Host "`nSpot the Lie - Local Development Setup" -ForegroundColor Cyan
Write-Host "====================================`n" -ForegroundColor Cyan

# Check prerequisites
Write-Host "[1/5] Checking dependencies..." -ForegroundColor Yellow

$nodeVersion = node --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   ERROR: Node.js not found. Install from https://nodejs.org/" -ForegroundColor Red
    exit 1
}
Write-Host "   OK: Node.js: $nodeVersion" -ForegroundColor Green

$swaCheck = npx swa --version 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "   Installing SWA CLI..." -ForegroundColor Yellow
    npm install -g @azure/static-web-apps-cli
}
Write-Host "   OK: SWA CLI available" -ForegroundColor Green

# Install dependencies if needed
Write-Host "`n[2/5] Installing dependencies..." -ForegroundColor Yellow
if (-not (Test-Path "$PSScriptRoot\api\node_modules")) {
    Push-Location "$PSScriptRoot\api"
    npm install
    Pop-Location
}
Write-Host "   OK: API dependencies installed" -ForegroundColor Green

if (-not (Test-Path "$PSScriptRoot\web\node_modules")) {
    Push-Location "$PSScriptRoot\web"
    npm install
    Pop-Location
}
Write-Host "   OK: Web dependencies installed" -ForegroundColor Green

# Build API
Write-Host "`n[3/5] Building API..." -ForegroundColor Yellow
Push-Location "$PSScriptRoot\api"
npm run build
Pop-Location
Write-Host "   OK: API build complete" -ForegroundColor Green

# Start SWA CLI (handles Azurite, Functions, and Vite)
Write-Host "`n[4/5] Starting SWA development server..." -ForegroundColor Yellow

if (-not $SkipSeed) {
    # Will seed after SWA starts
    $env:ONE_TRUTH_SEED = "true"
}

Write-Host "`n[5/5] Ready!" -ForegroundColor Green
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "  Starting SWA CLI..." -ForegroundColor Cyan
Write-Host "  Web App:  http://localhost:4280" -ForegroundColor Cyan
Write-Host "  API:      http://localhost:4280/api" -ForegroundColor Cyan
Write-Host "  Press Ctrl+C to stop" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

Push-Location $PSScriptRoot
swa start web --api-location api --run "cd web && npm run dev" --api-devserver-url http://localhost:7071
Pop-Location
