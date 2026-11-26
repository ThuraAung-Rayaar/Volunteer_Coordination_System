# scripts/db_diagnostics/run_db_diagnostics.ps1
# PowerShell runner for PostgreSQL Diagnostic Pack
# Strictly READ-ONLY. Zero PII. Refuses non-loopback connections.

param(
    [string]$Database = "volunteer_coordination_db",
    [string]$Host = "127.0.0.1",
    [string]$Port = "5432",
    [string]$User = "postgres",
    [switch]$AllowNonLoopback
)

$ErrorActionPreference = "Stop"

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "VCS Database Diagnostics - PowerShell Guarded Runner" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan

# Safety guard: loopback host verification
$isLoopback = ($Host -eq "127.0.0.1" -or $Host -eq "localhost" -or $Host -eq "::1")
if (-not $isLoopback -and -not $AllowNonLoopback) {
    Write-Error "[SAFETY REFUSAL] Target host '$Host' is not a loopback address. Refusing execution."
    exit 1
}

$repoRoot = Resolve-Path "$PSScriptRoot\..\.."
$pythonExe = "$repoRoot\.venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}

$runnerScript = "$PSScriptRoot\run_db_diagnostics.py"

$extraArgs = @()
if ($AllowNonLoopback) {
    $extraArgs += "--allow-non-loopback"
}

& $pythonExe $runnerScript `
    --db-name $Database `
    --db-host $Host `
    --db-port $Port `
    --db-user $User `
    @extraArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "[RESULT] Diagnostics encountered issues (exit code $LASTEXITCODE)." -ForegroundColor Yellow
    exit $LASTEXITCODE
} else {
    Write-Host "[RESULT] Diagnostics passed successfully." -ForegroundColor Green
    exit 0
}
