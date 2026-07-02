param(
    [string]$OutputDir = "backups",
    [string]$Container = "vitma_postgres"
)

$ErrorActionPreference = "Stop"

function Get-EnvValue([string]$Name, [string]$Default) {
    $envFile = Join-Path (Get-Location) ".env"
    if (Test-Path $envFile) {
        $line = Get-Content $envFile | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -First 1
        if ($line) {
            return ($line -replace "^\s*$Name\s*=\s*", "").Trim("'`" ")
        }
    }

    return $Default
}

$dbName = Get-EnvValue "DB_NAME" "db"
$dbUser = Get-EnvValue "DB_USER" "user"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$fileName = "$dbName-$timestamp.dump"
$containerPath = "/tmp/$fileName"
$localPath = Join-Path $OutputDir $fileName

docker exec $Container pg_dump -U $dbUser -d $dbName -Fc -f $containerPath
docker cp "${Container}:$containerPath" $localPath
docker exec $Container rm -f $containerPath | Out-Null

Write-Host "Database backup created: $localPath"
