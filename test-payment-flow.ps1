Write-Host "Testing Payment Flow..." -ForegroundColor Cyan
Write-Host ""

$API_URL = "http://localhost:8000/api"

# Login as customer
Write-Host "1. Login as customer..." -ForegroundColor Yellow
try {
    $loginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"test@example.com","password":"password123"}'
    $token = $loginResponse.data.token
    $userId = $loginResponse.data.user.id
    Write-Host "   [OK] Logged in as: $($loginResponse.data.user.name)" -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] Login failed. Creating new user..." -ForegroundColor Yellow
    
    # Register new user
    $regResponse = Invoke-RestMethod -Uri "$API_URL/auth/register" -Method POST -ContentType "application/json" -Body '{"name":"Test User","email":"test@example.com","password":"password123","phone":"+1234567890"}'
    $token = $regResponse.data.token
    $userId = $regResponse.data.user.id
    Write-Host "   [OK] Registered new user: $($regResponse.data.user.name)" -ForegroundColor Green
}
Write-Host ""

$headers = @{ Authorization = "Bearer $token" }

# Get invoices
Write-Host "2. Get customer invoices..." -ForegroundColor Yellow
$invoicesResponse = Invoke-RestMethod -Uri "$API_URL/invoices/customer/$userId" -Method GET -Headers $headers
$pendingInvoice = $invoicesResponse.data.invoices | Where-Object { $_.status -eq "PENDING" } | Select-Object -First 1

if ($pendingInvoice) {
    Write-Host "   [OK] Found pending invoice: $($pendingInvoice.id.Substring(0,8))" -ForegroundColor Green
    Write-Host "   Amount: EUR $($pendingInvoice.amount)" -ForegroundColor Gray
    Write-Host ""
    
    # Pay invoice
    Write-Host "3. Customer pays invoice..." -ForegroundColor Yellow
    try {
        $payResponse = Invoke-RestMethod -Uri "$API_URL/invoices/$($pendingInvoice.id)/pay" -Method POST -Headers $headers -ContentType "application/json" -Body '{}'
        Write-Host "   [OK] Payment submitted!" -ForegroundColor Green
        Write-Host "   New Status: $($payResponse.data.invoice.status)" -ForegroundColor Cyan
        Write-Host ""
        
        # Login as admin
        Write-Host "4. Login as admin..." -ForegroundColor Yellow
        $adminLoginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@garage.com","password":"admin123"}'
        $adminToken = $adminLoginResponse.data.token
        $adminHeaders = @{ Authorization = "Bearer $adminToken" }
        Write-Host "   [OK] Admin logged in" -ForegroundColor Green
        Write-Host ""
        
        # Admin confirms payment
        Write-Host "5. Admin confirms payment..." -ForegroundColor Yellow
        $confirmResponse = Invoke-RestMethod -Uri "$API_URL/invoices/$($pendingInvoice.id)/confirm" -Method POST -Headers $adminHeaders -ContentType "application/json" -Body '{}'
        Write-Host "   [OK] Payment confirmed!" -ForegroundColor Green
        Write-Host "   Final Status: $($confirmResponse.data.invoice.status)" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "=== PAYMENT FLOW TEST PASSED ===" -ForegroundColor Green
        
    } catch {
        Write-Host "   [ERROR] Payment failed: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   [INFO] No pending invoices found" -ForegroundColor Yellow
    Write-Host "   Total invoices: $($invoicesResponse.data.invoices.Count)" -ForegroundColor Gray
}
