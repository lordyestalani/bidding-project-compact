$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    docker compose --profile tools --profile tests stop
    if ($LASTEXITCODE -ne 0) { throw 'Stop failed.' }
    Write-Host 'Stopped. Projects and FX data are preserved.'
} finally { Pop-Location }
