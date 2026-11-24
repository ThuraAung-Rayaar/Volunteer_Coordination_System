# scripts/db_diagnostics/test_disposable_bootstrap.ps1
# Helper script to test canonical bootstrap on an explicitly named disposable DB
# Refuses to run against volunteer_coordination_db.

param(
    [Parameter(Mandatory=$true)]
    [string]$DisposableDbName,
    [string]$Host = "127.0.0.1",
    [string]$Port = "5432",
    [string]$User = "postgres"
)

$ErrorActionPreference = "Stop"

$PROHIBITED_DBS = @(
    "volunteer_coordination_db",
    "test_volunteer_coordination_db",
    "production",
    "postgres",
    "template1"
)

if ($PROHIBITED_DBS -contains $DisposableDbName.ToLower()) {
    Write-Error "[SAFETY REFUSAL] Cannot run bootstrap test against protected database '$DisposableDbName'."
    exit 1
}

Write-Host "============================================================" -ForegroundColor Yellow
Write-Host "Disposable Database Bootstrap Helper" -ForegroundColor Yellow
Write-Host "Target Disposable DB: $DisposableDbName on $Host`:$Port" -ForegroundColor Yellow
Write-Host "============================================================" -ForegroundColor Yellow

$confirm = Read-Host "Are you sure you want to create and bootstrap disposable DB '$DisposableDbName'? (type 'yes' to proceed)"
if ($confirm -ne "yes") {
    Write-Host "Operation cancelled by operator."
    exit 0
}

Write-Host "Executing bootstrap commands for $DisposableDbName..."
# 1. Create DB
createdb -h $Host -p $Port -U $User $DisposableDbName
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create database $DisposableDbName"
    exit $LASTEXITCODE
}

Write-Host "Disposable DB $DisposableDbName created. Applying bootstrap SQL..."
psql -X -v ON_ERROR_STOP=1 -h $Host -p $Port -U $User -d $DisposableDbName -f "postgres_sql\updated_volunteer_coordination_system_Database.sql"

Write-Host "Bootstrap completed. Inspect catalog and drop when done."
