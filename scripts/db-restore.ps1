param(
    [Parameter(Mandatory = $true)]
    [string]$DumpPath,

    [string]$Container = "vitma_postgres",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $Force) {
    throw "Restore rewrites database objects. Re-run with -Force when you are sure."
}

if (-not (Test-Path $DumpPath)) {
    throw "Dump file not found: $DumpPath"
}

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
$containerPath = "/tmp/learn-bot-restore.dump"

docker cp $DumpPath "${Container}:$containerPath"
docker exec $Container pg_restore -U $dbUser -d $dbName --clean --if-exists --no-owner $containerPath
docker exec $Container rm -f $containerPath | Out-Null

Write-Host "Database restored from: $DumpPath"
