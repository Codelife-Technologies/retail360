# API Testing Script for /api/categories
# Usage: .\test-api.ps1

$baseUrl = "http://localhost:5000/api/categories"

Write-Host "=== Testing Categories API ===" -ForegroundColor Cyan
Write-Host ""

# Test 1: Health Check
Write-Host "1. Testing Health Check..." -ForegroundColor Yellow
try {
    $health = Invoke-RestMethod -Uri "http://localhost:5000/api/health" -Method GET
    Write-Host "   ✓ Server is running" -ForegroundColor Green
    Write-Host "   Database Status: $($health.database)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Server is not running or not accessible" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
Write-Host ""

# Test 2: GET all categories
Write-Host "2. Testing GET /api/categories..." -ForegroundColor Yellow
try {
    $categories = Invoke-RestMethod -Uri $baseUrl -Method GET
    Write-Host "   ✓ Successfully retrieved categories" -ForegroundColor Green
    Write-Host "   Total categories: $($categories.Count)" -ForegroundColor Green
    if ($categories.Count -gt 0) {
        Write-Host "   First category: $($categories[0].name)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ✗ Failed to retrieve categories" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 3: GET with search parameter
Write-Host "3. Testing GET /api/categories?search=test..." -ForegroundColor Yellow
try {
    $searchResults = Invoke-RestMethod -Uri "$baseUrl?search=test" -Method GET
    Write-Host "   ✓ Search query executed successfully" -ForegroundColor Green
    Write-Host "   Results found: $($searchResults.Count)" -ForegroundColor Green
} catch {
    Write-Host "   ✗ Search failed" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Test 4: POST create category (test)
Write-Host "4. Testing POST /api/categories..." -ForegroundColor Yellow
$testCategory = @{
    name = "Test Category $(Get-Date -Format 'yyyyMMddHHmmss')"
    hsnCode = "999999"
} | ConvertTo-Json

try {
    $newCategory = Invoke-RestMethod -Uri $baseUrl -Method POST -Body $testCategory -ContentType "application/json"
    Write-Host "   ✓ Category created successfully" -ForegroundColor Green
    Write-Host "   Category ID: $($newCategory._id)" -ForegroundColor Gray
    Write-Host "   Category Name: $($newCategory.name)" -ForegroundColor Gray
    $createdCategoryId = $newCategory._id
    
    # Test 5: GET single category
    Write-Host ""
    Write-Host "5. Testing GET /api/categories/:id..." -ForegroundColor Yellow
    try {
        $singleCategory = Invoke-RestMethod -Uri "$baseUrl/$createdCategoryId" -Method GET
        Write-Host "   ✓ Successfully retrieved single category" -ForegroundColor Green
        Write-Host "   Category Name: $($singleCategory.name)" -ForegroundColor Gray
    } catch {
        Write-Host "   ✗ Failed to retrieve single category" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test 6: PUT update category
    Write-Host ""
    Write-Host "6. Testing PUT /api/categories/:id..." -ForegroundColor Yellow
    $updateData = @{
        name = "Updated Test Category"
        hsnCode = "999999"
    } | ConvertTo-Json
    
    try {
        $updatedCategory = Invoke-RestMethod -Uri "$baseUrl/$createdCategoryId" -Method PUT -Body $updateData -ContentType "application/json"
        Write-Host "   ✓ Category updated successfully" -ForegroundColor Green
        Write-Host "   Updated Name: $($updatedCategory.name)" -ForegroundColor Gray
    } catch {
        Write-Host "   ✗ Failed to update category" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    # Test 7: DELETE category
    Write-Host ""
    Write-Host "7. Testing DELETE /api/categories/:id..." -ForegroundColor Yellow
    try {
        $deleteResult = Invoke-RestMethod -Uri "$baseUrl/$createdCategoryId" -Method DELETE
        Write-Host "   ✓ Category deleted successfully" -ForegroundColor Green
        Write-Host "   Message: $($deleteResult.message)" -ForegroundColor Gray
    } catch {
        Write-Host "   ✗ Failed to delete category" -ForegroundColor Red
        Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "   Note: Category may be in use by products/subcategories" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "   ✗ Failed to create category" -ForegroundColor Red
    Write-Host "   Error: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "   Response: $responseBody" -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Testing Complete ===" -ForegroundColor Cyan

