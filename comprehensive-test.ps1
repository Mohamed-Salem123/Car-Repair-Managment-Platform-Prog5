Write-Host "=== COMPREHENSIVE SYSTEM TEST ===" -ForegroundColor Cyan
Write-Host ""

$API_URL = "http://localhost:8000/api"
$errors = @()
$warnings = @()

function Test-Endpoint {
    param($name, $method, $url, $headers, $body)
    try {
        if ($method -eq "GET") {
            $response = Invoke-RestMethod -Uri $url -Method GET -Headers $headers
        } elseif ($method -eq "POST") {
            $response = Invoke-RestMethod -Uri $url -Method POST -Headers $headers -ContentType "application/json" -Body $body
        } elseif ($method -eq "PUT") {
            $response = Invoke-RestMethod -Uri $url -Method PUT -Headers $headers -ContentType "application/json" -Body $body
        } elseif ($method -eq "DELETE") {
            $response = Invoke-RestMethod -Uri $url -Method DELETE -Headers $headers
        } elseif ($method -eq "PATCH") {
            $response = Invoke-RestMethod -Uri $url -Method PATCH -Headers $headers -ContentType "application/json" -Body $body
        }
        Write-Host "   [PASS] $name" -ForegroundColor Green
        return $response
    } catch {
        $script:errors += "$name - $($_.Exception.Message)"
        Write-Host "   [FAIL] $name - $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Test 1: User Registration and Authentication
Write-Host "TEST 1: Authentication Flow" -ForegroundColor Yellow
$timestamp = Get-Date -Format "yyyyMMddHHmmss"
$testEmail = "testuser$timestamp@example.com"

$regResponse = Test-Endpoint "Register New User" "POST" "$API_URL/auth/register" @{} "{`"name`":`"Test User`",`"email`":`"$testEmail`",`"password`":`"password123`",`"phone`":`"+1234567890`"}"

if ($regResponse) {
    $customerToken = $regResponse.data.token
    $customerId = $regResponse.data.user.id
    $customerHeaders = @{ Authorization = "Bearer $customerToken" }
} else {
    Write-Host "   [ERROR] Cannot continue without customer token" -ForegroundColor Red
    exit 1
}

# Login as admin
$adminLoginResponse = Test-Endpoint "Admin Login" "POST" "$API_URL/auth/login" @{} '{"email":"admin@garage.com","password":"admin123"}'
if ($adminLoginResponse) {
    $adminToken = $adminLoginResponse.data.token
    $adminId = $adminLoginResponse.data.user.id
    $adminHeaders = @{ Authorization = "Bearer $adminToken" }
}

Write-Host ""

# Test 2: Vehicle CRUD Operations
Write-Host "TEST 2: Vehicle Management" -ForegroundColor Yellow

$vehicleData = '{"make":"Toyota","model":"Camry","year":2020,"plateNumber":"TEST123","color":"Silver"}'
$vehicle = Test-Endpoint "Create Vehicle" "POST" "$API_URL/vehicles" $customerHeaders $vehicleData

if ($vehicle) {
    $vehicleId = $vehicle.data.vehicle.id
    
    $vehicleList = Test-Endpoint "Get Customer Vehicles" "GET" "$API_URL/vehicles" $customerHeaders
    
    $updateData = '{"make":"Toyota","model":"Camry","year":2021,"plateNumber":"TEST123","color":"Blue"}'
    $updated = Test-Endpoint "Update Vehicle" "PUT" "$API_URL/vehicles/$vehicleId" $customerHeaders $updateData
    
    # Try to delete vehicle (should work if no repairs)
    Test-Endpoint "Delete Vehicle (No Repairs)" "DELETE" "$API_URL/vehicles/$vehicleId" $customerHeaders
    
    # Recreate for further tests
    $vehicle = Test-Endpoint "Recreate Vehicle" "POST" "$API_URL/vehicles" $customerHeaders $vehicleData
    $vehicleId = $vehicle.data.vehicle.id
}

Write-Host ""

# Test 3: Repair Order Workflow
Write-Host "TEST 3: Repair Order Workflow" -ForegroundColor Yellow

$repairData = "{`"vehicleId`":`"$vehicleId`",`"problemDescription`":`"Engine makes strange noise`",`"handoverDate`":`"2024-12-01`",`"handoverTime`":`"10:00`"}"
$repair = Test-Endpoint "Create Repair Order" "POST" "$API_URL/repairs" $customerHeaders $repairData

if ($repair) {
    $repairId = $repair.data.repairOrder.id
    
    # Customer edits (should work - SUBMITTED status)
    $editData = "{`"problemDescription`":`"Engine makes very strange noise and smells`",`"handoverDate`":`"2024-12-01`",`"handoverTime`":`"10:00`"}"
    Test-Endpoint "Customer Edit Repair (SUBMITTED)" "PUT" "$API_URL/repairs/$repairId/customer" $customerHeaders $editData
    
    # Admin diagnoses
    $diagnoseData = '{"diagnosis":"Timing belt issue","requiredWork":"Replace timing belt and tensioner","estimatedCost":500,"status":"DIAGNOSED"}'
    Test-Endpoint "Admin Diagnose Repair" "PATCH" "$API_URL/repairs/$repairId" $adminHeaders $diagnoseData
    
    # Customer tries to edit (should fail - not SUBMITTED anymore)
    Write-Host "   [TEST] Customer Edit After Diagnosis (should fail):" -ForegroundColor Cyan
    try {
        Invoke-RestMethod -Uri "$API_URL/repairs/$repairId/customer" -Method PUT -Headers $customerHeaders -ContentType "application/json" -Body $editData
        $script:warnings += "Customer was able to edit repair after diagnosis - Should be blocked"
        Write-Host "   [WARN] Should have been blocked" -ForegroundColor Yellow
    } catch {
        Write-Host "   [PASS] Correctly blocked" -ForegroundColor Green
    }
    
    # Get repair details
    Test-Endpoint "Get Repair Details" "GET" "$API_URL/repairs/$repairId" $customerHeaders
}

Write-Host ""

# Test 4: Invoice and Payment Flow
Write-Host "TEST 4: Payment Workflow" -ForegroundColor Yellow

# Admin creates invoice
$invoiceData = "{`"repairOrderId`":`"$repairId`",`"customerId`":`"$customerId`",`"amount`":500,`"currency`":`"EUR`"}"
$invoice = Test-Endpoint "Create Invoice" "POST" "$API_URL/invoices" $adminHeaders $invoiceData

if ($invoice) {
    $invoiceId = $invoice.data.invoice.id
    
    # Customer gets invoices
    $customerInvoices = Test-Endpoint "Get Customer Invoices" "GET" "$API_URL/invoices/customer/$customerId" $customerHeaders
    
    # Customer pays
    $payment = Test-Endpoint "Customer Pay Invoice" "POST" "$API_URL/invoices/$invoiceId/pay" $customerHeaders "{}"
    
    if ($payment -and $payment.data.invoice.status -eq "PROCESSING") {
        Write-Host "   [INFO] Invoice status: PROCESSING" -ForegroundColor Cyan
        
        # Admin gets all invoices
        $allInvoices = Test-Endpoint "Admin Get All Invoices" "GET" "$API_URL/invoices" $adminHeaders
        
        # Admin confirms payment
        $confirmed = Test-Endpoint "Admin Confirm Payment" "POST" "$API_URL/invoices/$invoiceId/confirm" $adminHeaders "{}"
        
        if ($confirmed -and $confirmed.data.invoice.status -eq "PAID") {
            Write-Host "   [INFO] Invoice status: PAID" -ForegroundColor Cyan
        }
    }
}

Write-Host ""

# Test 5: Notification System
Write-Host "TEST 5: Notification System" -ForegroundColor Yellow

Start-Sleep -Seconds 2  # Wait for async notifications

$customerNotifs = Test-Endpoint "Get Customer Notifications" "GET" "$API_URL/notifications" $customerHeaders
$adminNotifs = Test-Endpoint "Get Admin Notifications" "GET" "$API_URL/notifications" $adminHeaders

if ($customerNotifs) {
    Write-Host "   [INFO] Customer notifications: $($customerNotifs.data.notifications.Count)" -ForegroundColor Cyan
    $unreadCustomer = $customerNotifs.data.notifications | Where-Object { -not $_.isRead }
    Write-Host "   [INFO] Unread: $($unreadCustomer.Count)" -ForegroundColor Cyan
    
    # Mark one as read
    if ($unreadCustomer.Count -gt 0) {
        $notifId = $unreadCustomer[0].id
        Test-Endpoint "Mark Notification Read" "PATCH" "$API_URL/notifications/$notifId/read" $customerHeaders
    }
}

if ($adminNotifs) {
    Write-Host "   [INFO] Admin notifications: $($adminNotifs.data.notifications.Count)" -ForegroundColor Cyan
    $unreadAdmin = $adminNotifs.data.notifications | Where-Object { -not $_.isRead }
    Write-Host "   [INFO] Unread: $($unreadAdmin.Count)" -ForegroundColor Cyan
}

Write-Host ""

# Test 6: Deletion Constraints
Write-Host "TEST 6: Deletion Constraints" -ForegroundColor Yellow

# Try to delete vehicle with repairs (should fail)
Write-Host "   [TEST] Delete Vehicle with Repairs (should fail):" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$API_URL/vehicles/$vehicleId" -Method DELETE -Headers $customerHeaders
    $script:errors += "Deleted vehicle with repairs - Should be blocked"
    Write-Host "   [FAIL] Should have been blocked" -ForegroundColor Red
} catch {
    Write-Host "   [PASS] Correctly blocked" -ForegroundColor Green
}

# Try customer deleting repair after diagnosis (should fail)
Write-Host "   [TEST] Customer Delete Repair (not SUBMITTED) (should fail):" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$API_URL/repairs/$repairId" -Method DELETE -Headers $customerHeaders
    $script:warnings += "Customer deleted repair after diagnosis - Should be blocked"
    Write-Host "   [WARN] Should have been blocked" -ForegroundColor Yellow
} catch {
    Write-Host "   [PASS] Correctly blocked" -ForegroundColor Green
}

# Admin tries to delete repair with confirmed payment (should fail)
Write-Host "   [TEST] Admin Delete Repair with Confirmed Payment (should fail):" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$API_URL/repairs/$repairId" -Method DELETE -Headers $adminHeaders
    $script:errors += "Admin deleted repair with confirmed payment - Should be blocked"
    Write-Host "   [FAIL] Should have been blocked" -ForegroundColor Red
} catch {
    Write-Host "   [PASS] Correctly blocked" -ForegroundColor Green
}

Write-Host ""

# Test 7: Authorization Tests
Write-Host "TEST 7: Authorization Tests" -ForegroundColor Yellow

# Customer tries to access admin endpoints
Write-Host "   [TEST] Customer Access Admin Endpoints (should fail):" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$API_URL/repairs/$repairId" -Method PATCH -Headers $customerHeaders -ContentType "application/json" -Body '{"status":"APPROVED"}'
    $script:errors += "Customer was able to update repair status - Should be admin only"
    Write-Host "   [FAIL] Should be blocked" -ForegroundColor Red
} catch {
    Write-Host "   [PASS] Correctly blocked" -ForegroundColor Green
}

# Customer tries to access another customer's data
Write-Host "   [TEST] Customer Access Other Customer Data (should fail):" -ForegroundColor Cyan
try {
    Invoke-RestMethod -Uri "$API_URL/invoices/customer/$adminId" -Method GET -Headers $customerHeaders
    $script:warnings += "Customer accessed another customer's invoices"
    Write-Host "   [WARN] Should be blocked" -ForegroundColor Yellow
} catch {
    Write-Host "   [PASS] Correctly blocked" -ForegroundColor Green
}

Write-Host ""

# Summary
Write-Host "=== TEST SUMMARY ===" -ForegroundColor Cyan
Write-Host ""

if ($errors.Count -eq 0) {
    Write-Host "ERRORS: None" -ForegroundColor Green
} else {
    Write-Host "ERRORS: $($errors.Count)" -ForegroundColor Red
    foreach ($err in $errors) {
        Write-Host "  - $err" -ForegroundColor Red
    }
}

Write-Host ""

if ($warnings.Count -eq 0) {
    Write-Host "WARNINGS: None" -ForegroundColor Green
} else {
    Write-Host "WARNINGS: $($warnings.Count)" -ForegroundColor Yellow
    foreach ($warn in $warnings) {
        Write-Host "  - $warn" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Test completed!" -ForegroundColor Cyan
