<#
.SYNOPSIS
    Automated regression script for the Picker Vision load generator.

.DESCRIPTION
    Checks the server-side assertion endpoint to verify the system is
    processing scan events correctly.  Designed to run in GitHub Actions
    or locally after a load-gen session has been run.

    Exit code 0 = all assertions passed.
    Exit code 1 = one or more assertions failed.

.PARAMETER BaseUrl
    Base URL of the API gateway (default: http://192.168.11.213).

.PARAMETER ApiKey
    API key for protected endpoints (default: changeme).

.PARAMETER ScansExpected
    Minimum number of scan events the server should have received.
    Set to 0 to skip the scans_sent check (default: 0).

.PARAMETER PicksExpected
    Minimum number of picks the load gen should have confirmed.
    Checked client-side only via the assertion endpoint context.
    (default: 0).

.PARAMETER PickerCount
    Expected number of active picker WebSocket connections.
    Set to 0 to skip the socket check (default: 0).

.PARAMETER WaitSeconds
    Seconds to wait before calling the assertion endpoint, allowing
    in-flight events to be processed (default: 0 — assert immediately).

.EXAMPLE
    # Run after a 3-picker load-gen session, wait 10s for stragglers:
    .\load-gen-assert.ps1 -PickerCount 3 -ScansExpected 30 -WaitSeconds 10

.EXAMPLE
    # CI smoke test — just verify the endpoint is reachable and processing:
    .\load-gen-assert.ps1 -BaseUrl "http://192.168.11.213" -ApiKey "changeme"
#>

param(
    [string] $BaseUrl       = "http://192.168.11.213",
    [string] $ApiKey        = "changeme",
    [int]    $ScansExpected = 0,
    [int]    $PicksExpected = 0,
    [int]    $PickerCount   = 0,
    [int]    $WaitSeconds   = 0
)

$ErrorActionPreference = "Stop"

# ── Banner ─────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "=== Picker Vision — Load Gen Regression Assert ===" -ForegroundColor Cyan
Write-Host "    Target : $BaseUrl"
Write-Host "    Params : scans_expected=$ScansExpected  picks_expected=$PicksExpected  picker_count=$PickerCount"
Write-Host ""

# ── Optional wait ──────────────────────────────────────────────────────────────

if ($WaitSeconds -gt 0) {
    Write-Host "Waiting ${WaitSeconds}s for in-flight events to settle..." -ForegroundColor DarkGray
    Start-Sleep -Seconds $WaitSeconds
}

# ── Build query string ─────────────────────────────────────────────────────────

$query = "scans_sent=$ScansExpected&picks_confirmed=$PicksExpected"
if ($PickerCount -gt 0) {
    $query += "&picker_count=$PickerCount"
}

$url     = "$BaseUrl/api/load-gen/assert?$query"
$headers = @{ "X-API-Key" = $ApiKey }

# ── Call endpoint ──────────────────────────────────────────────────────────────

Write-Host "Calling: $url" -ForegroundColor DarkGray

try {
    $response = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing
    $body     = $response.Content | ConvertFrom-Json
} catch {
    Write-Host ""
    Write-Host "ERROR: Could not reach assertion endpoint." -ForegroundColor Red
    Write-Host "       $($_.Exception.Message)"
    Write-Host ""
    exit 1
}

# ── Print results ──────────────────────────────────────────────────────────────

Write-Host ""
Write-Host ("{0,-45} {1,-12} {2,-12} {3}" -f "Check", "Expected", "Actual", "Result")
Write-Host ("-" * 85)

$allPassed = $true

foreach ($check in $body.checks) {
    $icon   = if ($check.pass) { "[PASS]" } else { "[FAIL]" }
    $color  = if ($check.pass) { "Green" } else { "Red" }
    $line   = "{0,-45} {1,-12} {2,-12} {3}" -f $check.name, $check.expected, $check.actual, $icon
    Write-Host $line -ForegroundColor $color
    if (-not $check.pass) { $allPassed = $false }
}

Write-Host ("-" * 85)

if ($allPassed) {
    Write-Host ""
    Write-Host "OVERALL: PASS" -ForegroundColor Green
    Write-Host ""
    exit 0
} else {
    Write-Host ""
    Write-Host "OVERALL: FAIL" -ForegroundColor Red
    Write-Host ""
    exit 1
}
