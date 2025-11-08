# Quick Deploy Script for PowerShell
# deploy.ps1

Write-Host "========================================" -ForegroundColor Green
Write-Host "WhatsApp Gateway - Quick Deploy" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""

# Cek docker running
Write-Host "Checking Docker..." -ForegroundColor Yellow
docker version | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Docker not running!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Docker is running" -ForegroundColor Green
Write-Host ""

# Load .env file
if (Test-Path .env) {
    Write-Host "Loading .env file..." -ForegroundColor Yellow
    Get-Content .env | ForEach-Object {
        if ($_ -match '^([^=]+)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
    Write-Host "✓ Environment variables loaded" -ForegroundColor Green
} else {
    Write-Host "⚠ .env file not found, using defaults" -ForegroundColor Yellow
}
Write-Host ""

# Build image
Write-Host "Building Docker image..." -ForegroundColor Yellow
docker build -t chillajar-wa-gateway:latest .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Build failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Image built successfully" -ForegroundColor Green
Write-Host ""

# Deploy dengan docker-compose
Write-Host "Deploying with docker-compose..." -ForegroundColor Yellow
docker-compose down
docker-compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Deployment failed!" -ForegroundColor Red
    exit 1
}
Write-Host "✓ Deployment successful" -ForegroundColor Green
Write-Host ""

# Cek status
Write-Host "Checking container status..." -ForegroundColor Yellow
Start-Sleep -Seconds 3
docker ps | Select-String "chillajar_wa_gateway"
Write-Host ""

Write-Host "========================================" -ForegroundColor Green
Write-Host "Deployment Complete!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. View logs: docker logs chillajar_wa_gateway -f" -ForegroundColor White
Write-Host "2. Scan QR code from logs" -ForegroundColor White
Write-Host "3. Test: http://localhost:8084/" -ForegroundColor White
Write-Host ""
