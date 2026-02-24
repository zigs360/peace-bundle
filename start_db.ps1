$pgCtl = "C:\Program Files\PostgreSQL\16\bin\pg_ctl.exe"
$dataDir = "c:\Users\7410\peace bundle\db_data"
$logFile = "c:\Users\7410\peace bundle\db.log"

if (Test-Path $pgCtl) {
    Write-Host "Starting PostgreSQL..."
    & $pgCtl -D $dataDir -o "-p 5433" -l $logFile start
    Write-Host "PostgreSQL start command issued."
} else {
    Write-Host "Error: pg_ctl.exe not found at $pgCtl"
}
