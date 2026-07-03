# Test script to verify categories API is working
Write-Host "Testing Categories API..." -ForegroundColor Cyan
Write-Host ""

# Test 1: Health check
Write-Host "1. Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method GET
    Write-Host "   ✓ Server is running" -ForegroundColor Green
    Write-Host "   Database Status: $($health.database)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Server is not running" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Please start the server first:" -ForegroundColor Yellow
    Write-Host "  cd server" -ForegroundColor Yellow
    Write-Host "  npm start" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

# Test 2: GET categories
Write-Host "2. Testing GET /api/categories..." -ForegroundColor Yellow
try {
    $categories = Invoke-RestMethod -Uri "http://localhost:5000/api/categories" -Method GET
    Write-Host "   ✓ GET request successful" -ForegroundColor Green
    Write-Host "   Categories found: $($categories.Count)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ GET request failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   Response: $($_.Exception.Response)" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host ""
        Write-Host "   ⚠ Routes are not registered. Please restart the server!" -ForegroundColor Yellow
    }
}
Write-Host ""

# Test 3: POST category
Write-Host "3. Testing POST /api/categories..." -ForegroundColor Yellow
$testCategory = @{
    name = "Test Category $(Get-Date -Format 'yyyyMMddHHmmss')"
    hsnCode = "999999"
} | ConvertTo-Json

try {
    $newCategory = Invoke-RestMethod -Uri "http://localhost:5000/api/categories" -Method POST -Body $testCategory -ContentType "application/json"
    Write-Host "   ✓ POST request successful" -ForegroundColor Green
    Write-Host "   Category ID: $($newCategory._id)" -ForegroundColor Gray
    Write-Host "   Category Name: $($newCategory.name)" -ForegroundColor Gray
    
    # Clean up - delete the test category
    Write-Host ""
    Write-Host "4. Cleaning up test category..." -ForegroundColor Yellow
    try {
        Invoke-RestMethod -Uri "http://localhost:5000/api/categories/$($newCategory._id)" -Method DELETE | Out-Null
        Write-Host "   ✓ Test category deleted" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠ Could not delete test category (ID: $($newCategory._id))" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ✗ POST request failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response.StatusCode -eq 404) {
        Write-Host ""
        Write-Host "   ⚠ Routes are not registered. Please restart the server!" -ForegroundColor Yellow
        Write-Host ""
        Write-Host "To restart the server:" -ForegroundColor Yellow
        Write-Host "  1. Stop the current server (Ctrl+C)" -ForegroundColor Yellow
        Write-Host "  2. Run: cd server" -ForegroundColor Yellow
        Write-Host "  3. Run: npm start" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "=== Test Complete ===" -ForegroundColor Cyan

