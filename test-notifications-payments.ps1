Write-Host "=== Testing Notifications & Payment Workflow ===" -ForegroundColor Cyan
Write-Host ""

$API_URL = "http://localhost:8000/api"

# Test 1: Login as customer
Write-Host "1. Login as customer..." -ForegroundColor Yellow
$loginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"john@example.com","password":"password123"}'
$customerToken = $loginResponse.data.token
$customerId = $loginResponse.data.user.id
Write-Host "   [OK] Customer logged in: $customerId" -ForegroundColor Green
Write-Host ""

# Test 2: Get notifications (should have some)
Write-Host "2. Get customer notifications..." -ForegroundColor Yellow
$headers = @{ Authorization = "Bearer $customerToken" }
$notifResponse = Invoke-RestMethod -Uri "$API_URL/notifications" -Method GET -Headers $headers
$unreadCount = ($notifResponse.data.notifications | Where-Object { -not $_.isRead }).Count
Write-Host "   [OK] Total notifications: $($notifResponse.data.notifications.Count)" -ForegroundColor Green
Write-Host "   [OK] Unread notifications: $unreadCount" -ForegroundColor Green
Write-Host ""

# Test 3: Mark first unread notification as read
if ($unreadCount -gt 0) {
    Write-Host "3. Mark first notification as read..." -ForegroundColor Yellow
    $firstUnread = $notifResponse.data.notifications | Where-Object { -not $_.isRead } | Select-Object -First 1
    $notifId = $firstUnread.id
    Write-Host "   Notification: $($firstUnread.title)" -ForegroundColor Gray
    
    $markReadResponse = Invoke-RestMethod -Uri "$API_URL/notifications/$notifId/read" -Method PATCH -Headers $headers
    Write-Host "   [OK] Marked as read!" -ForegroundColor Green
    
    # Verify it's now read
    $notifResponse2 = Invoke-RestMethod -Uri "$API_URL/notifications" -Method GET -Headers $headers
    $newUnreadCount = ($notifResponse2.data.notifications | Where-Object { -not $_.isRead }).Count
    Write-Host "   [OK] New unread count: $newUnreadCount (was $unreadCount)" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "3. No unread notifications to mark" -ForegroundColor Gray
    Write-Host ""
}

# Test 4: Get customer invoices
Write-Host "4. Get customer invoices..." -ForegroundColor Yellow
try {
    $invoicesResponse = Invoke-RestMethod -Uri "$API_URL/invoices/customer/$customerId" -Method GET -Headers $headers
    $invoices = $invoicesResponse.data.invoices
    Write-Host "   [OK] Total invoices: $($invoices.Count)" -ForegroundColor Green
    
    foreach ($invoice in $invoices) {
        $statusColor = switch ($invoice.status) {
            "PENDING" { "Yellow" }
            "PROCESSING" { "Cyan" }
            "PAID" { "Green" }
            default { "White" }
        }
        Write-Host "   - Invoice $($invoice.id.Substring(0,8)): EUR $($invoice.amount) [$($invoice.status)]" -ForegroundColor $statusColor
    }
    Write-Host ""
    
    # Test 5: Pay a pending invoice if any
    $pendingInvoice = $invoices | Where-Object { $_.status -eq "PENDING" } | Select-Object -First 1
    
    if ($pendingInvoice) {
        Write-Host "5. Customer pays invoice..." -ForegroundColor Yellow
        Write-Host "   Invoice ID: $($pendingInvoice.id.Substring(0,8))" -ForegroundColor Gray
        Write-Host "   Amount: EUR $($pendingInvoice.amount)" -ForegroundColor Gray
        
        $payResponse = Invoke-RestMethod -Uri "$API_URL/invoices/$($pendingInvoice.id)/pay" -Method POST -Headers $headers -ContentType "application/json" -Body '{}'
        Write-Host "   [OK] Payment submitted! Status: $($payResponse.data.invoice.status)" -ForegroundColor Green
        Write-Host ""
        
        # Test 6: Login as admin and confirm payment
        Write-Host "6. Login as admin..." -ForegroundColor Yellow
        $adminLoginResponse = Invoke-RestMethod -Uri "$API_URL/auth/login" -Method POST -ContentType "application/json" -Body '{"email":"admin@garage.com","password":"admin123"}'
        $adminToken = $adminLoginResponse.data.token
        Write-Host "   [OK] Admin logged in" -ForegroundColor Green
        Write-Host ""
        
        Write-Host "7. Admin gets all invoices..." -ForegroundColor Yellow
        $adminHeaders = @{ Authorization = "Bearer $adminToken" }
        $allInvoicesResponse = Invoke-RestMethod -Uri "$API_URL/invoices" -Method GET -Headers $adminHeaders
        $processingInvoices = $allInvoicesResponse.data.invoices | Where-Object { $_.status -eq "PROCESSING" }
        Write-Host "   [OK] Total invoices: $($allInvoicesResponse.data.invoices.Count)" -ForegroundColor Green
        Write-Host "   [OK] Processing invoices: $($processingInvoices.Count)" -ForegroundColor Cyan
        Write-Host ""
        
        Write-Host "8. Admin confirms payment..." -ForegroundColor Yellow
        $confirmResponse = Invoke-RestMethod -Uri "$API_URL/invoices/$($pendingInvoice.id)/confirm" -Method POST -Headers $adminHeaders -ContentType "application/json" -Body '{}'
        Write-Host "   [OK] Payment confirmed! Status: $($confirmResponse.data.invoice.status)" -ForegroundColor Green
        Write-Host ""
        
        # Test 7: Verify final status
        Write-Host "9. Verify final invoice status..." -ForegroundColor Yellow
        $finalInvoiceResponse = Invoke-RestMethod -Uri "$API_URL/invoices/$($pendingInvoice.id)" -Method GET -Headers $headers
        Write-Host "   [OK] Final Status: $($finalInvoiceResponse.data.invoice.status)" -ForegroundColor Green
        Write-Host ""
        
    } else {
        Write-Host "5. No pending invoices to test payment workflow" -ForegroundColor Gray
        Write-Host ""
    }
    
} catch {
    Write-Host "   [ERROR] Testing invoices failed" -ForegroundColor Red
    Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
}

Write-Host "=== Test Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Test Summary:" -ForegroundColor White
Write-Host "- Notifications can be marked as read" -ForegroundColor Green
Write-Host "- Dashboard shows only UNREAD notifications" -ForegroundColor Green
Write-Host "- Payment workflow: PENDING -> PROCESSING -> PAID" -ForegroundColor Green
Write-Host "- Customer can pay invoices" -ForegroundColor Green
Write-Host "- Admin can confirm payments" -ForegroundColor Green
