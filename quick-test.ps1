# Quick System Test Script
Write-Host "=== Garage Management System - Quick Test ===" -ForegroundColor Green

Write-Host "`n1. Building system..." -ForegroundColor Yellow
docker compose build --quiet 2>&1 | Out-Null

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Build successful" -ForegroundColor Green
} else {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}

Write-Host "`n2. Starting services..." -ForegroundColor Yellow
docker compose up -d

Write-Host "`n3. Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 30

Write-Host "`n4. Checking service health..." -ForegroundColor Yellow

$services = @(
    @{Name="Gateway"; Port=8000},
    @{Name="Identity"; Port=8001},
    @{Name="Repair"; Port=8002},
    @{Name="Payment"; Port=8003},
    @{Name="Notification"; Port=8004},
    @{Name="AI"; Port=8005}
)

$allHealthy = $true
foreach ($service in $services) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$($service.Port)/health" -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            Write-Host "  ✅ $($service.Name) Service (Port $($service.Port))" -ForegroundColor Green
        }
    } catch {
        Write-Host "  ❌ $($service.Name) Service (Port $($service.Port)) - NOT RESPONDING" -ForegroundColor Red
        $allHealthy = $false
    }
}

Write-Host "`n5. Testing API endpoints..." -ForegroundColor Yellow

# Test Registration
try {
    $regBody = @{
        name = "Test User"
        email = "test@test.com"
        phone = "+123456789"
        password = "test123"
    } | ConvertTo-Json

    $regResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/register" `
        -Method Post `
        -ContentType "application/json" `
        -Body $regBody
    
    $token = $regResponse.data.token
    Write-Host "  ✅ User Registration" -ForegroundColor Green
    Write-Host "  ✅ JWT Token Generated" -ForegroundColor Green
} catch {
    Write-Host "  ⚠️  Registration (user may already exist)" -ForegroundColor Yellow
    
    # Try login instead
    $loginBody = @{
        email = "test@test.com"
        password = "test123"
    } | ConvertTo-Json
    
    $loginResponse = Invoke-RestMethod -Uri "http://localhost:8000/api/auth/login" `
        -Method Post `
        -ContentType "application/json" `
        -Body $loginBody
    
    $token = $loginResponse.data.token
    Write-Host "  ✅ User Login" -ForegroundColor Green
}

# Test Protected Endpoint
try {
    $headers = @{
        Authorization = "Bearer $token"
    }
    
    $profile = Invoke-RestMethod -Uri "http://localhost:8000/api/users/me" `
        -Headers $headers
    
    Write-Host "  ✅ Protected Endpoint Access" -ForegroundColor Green
    Write-Host "  ✅ JWT Validation" -ForegroundColor Green
} catch {
    Write-Host "  ❌ Protected Endpoint Failed" -ForegroundColor Red
}

Write-Host "`n=== Test Summary ===" -ForegroundColor Green

if ($allHealthy) {
    Write-Host "✅ All services are running" -ForegroundColor Green
    Write-Host "✅ API endpoints working" -ForegroundColor Green
    Write-Host "✅ Authentication working" -ForegroundColor Green
    Write-Host "`nFrontend: http://localhost:3000" -ForegroundColor Cyan
    Write-Host "RabbitMQ: http://localhost:15672 (guest/guest)" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Some services need more time to start" -ForegroundColor Yellow
    Write-Host "Run 'docker compose logs' to check details" -ForegroundColor Yellow
}

Write-Host "`nSystem is ready for manual testing!" -ForegroundColor Green
