param([switch]$Review)
$env:NODE_ENV = 'test'
$env:BOT_TOKEN = 'ci-offline-telegram-token'
$env:BOT_POLLING_ENABLED = 'false'
$env:MAX_BOT_TOKEN = ''
$env:OUTBOUND_DELIVERY_WORKER_ENABLED = 'false'
$env:DB_HOST = '127.0.0.1'
$env:DB_PORT = '55437'
$env:DB_NAME = 'vitma_fe1b_application'
$env:DB_USER = 'vitma_fe1b'
$env:DB_PASS = 'fe1b_local_test_only'
$env:TEST_DB_HOST = $env:DB_HOST
$env:TEST_DB_PORT = $env:DB_PORT
$env:TEST_DB_NAME = 'vitma_fe1b_test'
$env:TEST_DB_USER = $env:DB_USER
$env:TEST_DB_PASS = $env:DB_PASS
$env:FILE_STORAGE_ROOT = Join-Path ([System.IO.Path]::GetTempPath()) 'vitma-fe1b-storage'
if ($Review) {
    $env:TEST_DB_NAME = 'vitma_fe1b_review_test'
    $env:FILE_STORAGE_ROOT = Join-Path ([System.IO.Path]::GetTempPath()) 'vitma-fe1b-review-storage'
}
$env:SERVE_BUILT_UI = 'true'
$env:INTEGRATION_BRIDGE_KEY = ''
$env:CORS_ORIGINS = 'http://localhost:5173,http://localhost:5174'
$env:PORT = '3000'
