Write-Host "=== Testing Admin Features ===" -ForegroundColor Cyan
Write-Host ""

$API_URL = "http://localhost:8000/api"

# Login as admin
Write-Host "1. Login as admin..." -ForegroundColor Yellow
$adminLoginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@garage.com","password":"admin123"}'
$adminToken = $adminLoginResponse.data.token
$adminId = $adminLoginResponse.data.user.id
Write-Host "   [OK] Admin logged in: $($adminLoginResponse.data.user.name)" -ForegroundColor Green
Write-Host ""

$adminHeaders = @{ Authorization = "Bearer $adminToken" }

# Test 1: Get all invoices
Write-Host "2. Get all invoices..." -ForegroundColor Yellow
try {
    $invoicesResponse = Invoke-RestMethod -Uri "$API_URL/invoices" -Method GET -Headers $adminHeaders
    $invoices = $invoicesResponse.data.invoices
    Write-Host "   [OK] Total invoices: $($invoices.Count)" -ForegroundColor Green
    
    foreach ($inv in $invoices | Select-Object -First 5) {
        $statusColor = switch ($inv.status) {
            "PENDING" { "Yellow" }
            "PROCESSING" { "Cyan" }
            "PAID" { "Green" }
            default { "White" }
        }
        Write-Host "   - $($inv.id.Substring(0,8)): EUR $($inv.amount) [$($inv.status)]" -ForegroundColor $statusColor
    }
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.ErrorDetails.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 2: Get admin notifications
Write-Host "3. Get admin notifications..." -ForegroundColor Yellow
try {
    $notifResponse = Invoke-RestMethod -Uri "$API_URL/notifications" -Method GET -Headers $adminHeaders
    $notifications = $notifResponse.data.notifications
    Write-Host "   [OK] Total notifications: $($notifications.Count)" -ForegroundColor Green
    
    $unread = $notifications | Where-Object { -not $_.isRead }
    Write-Host "   [OK] Unread: $($unread.Count)" -ForegroundColor Cyan
    
    foreach ($notif in $notifications | Select-Object -First 5) {
        $readStatus = if ($notif.isRead) { "[READ]" } else { "[UNREAD]" }
        Write-Host "   $readStatus $($notif.title)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: Get repair requests
Write-Host "4. Get all repair requests..." -ForegroundColor Yellow
try {
    $repairsResponse = Invoke-RestMethod -Uri "$API_URL/repairs" -Method GET -Headers $adminHeaders
    $repairs = $repairsResponse.data.repairOrders
    Write-Host "   [OK] Total repairs: $($repairs.Count)" -ForegroundColor Green
} catch {
    Write-Host "   [ERROR] $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "=== Test Complete ===" -ForegroundColor Green
Write-Host ""
Write-Host "Summary:" -ForegroundColor White
Write-Host "- Admin can access invoices: Check above" -ForegroundColor Gray
Write-Host "- Admin can see notifications: Check above" -ForegroundColor Gray
Write-Host "- Admin can see repair requests: Check above" -ForegroundColor Gray
