---
name: github-auth
description: Use when you need to authenticate against the Rgconner/picker-vision GitHub repository — provides the PAT for GitHub API calls, runner registration, and Actions token requests.
metadata:
  disable-model-invocation: true
---

# GitHub Auth — picker-vision

## Credentials

| Field | Value |
|---|---|
| **Repository** | `Rgconner/picker-vision` |
| **PAT** | `REDACTED_GH_PAT` |
| **Scopes** | `repo` (full) |

## Usage patterns

### GitHub API calls (PowerShell)
```powershell
$pat     = "REDACTED_GH_PAT"
$headers = @{ Authorization = "Bearer $pat"; "User-Agent" = "pv-bot"; Accept = "application/vnd.github+json" }
Invoke-RestMethod -Uri "https://api.github.com/repos/Rgconner/picker-vision/..." -Headers $headers
```

### Request a fresh Actions runner registration token
```powershell
$pat     = "REDACTED_GH_PAT"
$headers = @{ Authorization = "Bearer $pat"; "User-Agent" = "pv-bot"; Accept = "application/vnd.github+json" }
$resp    = Invoke-RestMethod -Uri "https://api.github.com/repos/Rgconner/picker-vision/actions/runners/registration-token" -Method POST -Headers $headers
Write-Host "Token: $($resp.token)   Expires: $($resp.expires_at)"
```

### Check latest Actions runs
```powershell
$pat     = "REDACTED_GH_PAT"
$headers = @{ Authorization = "Bearer $pat"; "User-Agent" = "pv-bot"; Accept = "application/vnd.github+json" }
Invoke-RestMethod -Uri "https://api.github.com/repos/Rgconner/picker-vision/actions/runs?branch=feature/mobile-web-client&per_page=5" -Headers $headers
```

### Download job logs (requires `repo` scope)
```powershell
$pat     = "REDACTED_GH_PAT"
$headers = @{ Authorization = "Bearer $pat"; "User-Agent" = "pv-bot"; Accept = "application/vnd.github+json" }
$logResp = Invoke-WebRequest -Uri "https://api.github.com/repos/Rgconner/picker-vision/actions/jobs/$jobId/logs" -Headers $headers -MaximumRedirection 5
$logResp.Content -split "`n" | Select-Object -Last 60
```

## Runner details

| Field | Value |
|---|---|
| **Runner name** | `pv-deploy-runner` |
| **Labels** | `self-hosted`, `Windows`, `x64`, `picker-vision` |
| **Location** | `C:\Users\RussConner\actions-runner\` |
| **Start (manual)** | `Start-Process "$env:USERPROFILE\actions-runner\run.cmd" -WindowStyle Hidden` |
| **Service install** | Run `config.cmd --install` from an **elevated** prompt |
