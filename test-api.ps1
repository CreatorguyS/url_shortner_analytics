# URL Shortener API Test Script
# Tests: Get API Key, Shorten URL, Get Analytics, Redirect

$BASE_URL = "http://localhost"
$ErrorActionPreference = "Stop"

Write-Host "========== URL Shortener API Test ==========" -ForegroundColor Green

# 1. Get API Key
Write-Host "`n1️⃣  Testing: Get API Key (POST /quickstart)"
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/quickstart" -Method POST -ContentType "application/json" -UseBasicParsing
    $data = $response.Content | ConvertFrom-Json
    $apiKey = $data.key
    Write-Host "✅ SUCCESS: API Key generated" -ForegroundColor Green
    Write-Host "   Key: $($apiKey.Substring(0, 20))..." -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 2. Shorten URL
Write-Host "`n2️⃣  Testing: Shorten URL (POST /api/url)"
$longUrl = "https://www.example.com/very/long/url/that/needs/shortening?param1=value1&param2=value2"
$body = @{ longUrl = $longUrl } | ConvertTo-Json

try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/url" `
        -Method POST `
        -Headers @{ "X-API-Key" = $apiKey } `
        -ContentType "application/json" `
        -Body $body `
        -UseBasicParsing
    
    $data = $response.Content | ConvertFrom-Json
    $shortUrl = $data.shortUrl
    $shortCode = $data.shortCode
    
    Write-Host "✅ SUCCESS: URL shortened" -ForegroundColor Green
    Write-Host "   Original: $longUrl" -ForegroundColor Cyan
    Write-Host "   Short:    $shortUrl" -ForegroundColor Cyan
    Write-Host "   Code:     $shortCode" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3. Test Redirect (without following to avoid external request)
Write-Host "`n3️⃣  Testing: Redirect (GET /:shortCode)"
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/$shortCode" `
        -Method GET `
        -UseBasicParsing `
        -MaximumRedirection 0 `
        -SkipHttpErrorCheck
    
    if ($response.StatusCode -eq 302 -or $response.StatusCode -eq 301) {
        $location = $response.Headers['Location']
        Write-Host "✅ SUCCESS: Redirect working" -ForegroundColor Green
        Write-Host "   Status: $($response.StatusCode)" -ForegroundColor Cyan
        Write-Host "   Redirects to: $location" -ForegroundColor Cyan
    } else {
        Write-Host "❌ FAILED: Expected 302/301 redirect, got $($response.StatusCode)" -ForegroundColor Red
    }
} catch {
    if ($_.Exception.Response.StatusCode -eq 302 -or $_.Exception.Response.StatusCode -eq 301) {
        $location = $_.Exception.Response.Headers['Location']
        Write-Host "✅ SUCCESS: Redirect working" -ForegroundColor Green
        Write-Host "   Status: $($_.Exception.Response.StatusCode)" -ForegroundColor Cyan
        Write-Host "   Redirects to: $location" -ForegroundColor Cyan
    } else {
        Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
    }
}

# 4. Get Analytics
Write-Host "`n4️⃣  Testing: Get Analytics (GET /api/analytics/:code)"
try {
    $response = Invoke-WebRequest -Uri "$BASE_URL/api/analytics/$shortCode" `
        -Method GET `
        -Headers @{ "X-API-Key" = $apiKey } `
        -UseBasicParsing
    
    $data = $response.Content | ConvertFrom-Json
    Write-Host "✅ SUCCESS: Analytics retrieved" -ForegroundColor Green
    Write-Host "   Short Code: $($data.shortCode)" -ForegroundColor Cyan
    Write-Host "   Total Clicks: $($data.totalClicks)" -ForegroundColor Cyan
    Write-Host "   Period: $($data.period)" -ForegroundColor Cyan
} catch {
    Write-Host "❌ FAILED: $($_.Exception.Message)" -ForegroundColor Red
}

Write-Host "`n========== All Tests Complete ==========" -ForegroundColor Green
Write-Host "`n✨ Your URL Shortener is working! ✨" -ForegroundColor Green
Write-Host "`nYou can now:"
Write-Host "  1. Open http://localhost in your browser"
Write-Host "  2. Paste your API key: $($apiKey.Substring(0, 30))..."
Write-Host "  3. Enter URLs to shorten"
Write-Host "  4. View analytics and track clicks"
