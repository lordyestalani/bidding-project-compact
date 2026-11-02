[CmdletBinding()]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
Push-Location $PSScriptRoot
try {
    if (-not (Test-Path -LiteralPath '.env')) {
        function New-Secret { -join (1..48 | ForEach-Object { '0123456789abcdef'[(Get-Random -Maximum 16)] }) }
        $fernetBytes = New-Object byte[] 32
        $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
        $rng.GetBytes($fernetBytes)
        $rng.Dispose()
        $fernet = [Convert]::ToBase64String($fernetBytes).Replace('+','-').Replace('/','_')
        @("POSTGRES_PASSWORD=$(New-Secret)","AIRFLOW_PASSWORD=$(New-Secret)","AIRFLOW_JWT_SECRET=$(New-Secret)","AIRFLOW_FERNET_KEY=$fernet",'WEB_PORT=15180','API_PORT=18080','AIRFLOW_PORT=18081') | Set-Content -LiteralPath '.env' -Encoding ascii
    }
    foreach ($key in @('POSTGRES_PASSWORD','AIRFLOW_PASSWORD','AIRFLOW_JWT_SECRET','AIRFLOW_FERNET_KEY')) {
        if (-not (Select-String -LiteralPath '.env' -Pattern "^$key=.+$" -Quiet)) { throw "Existing .env is missing $key. Keep existing credentials and fill the missing setting; do not regenerate the file." }
    }
    docker compose config --quiet
    if ($LASTEXITCODE -ne 0) { throw 'Compose configuration failed.' }
    if (-not $SkipBuild) {
        docker compose build api web setup
        if ($LASTEXITCODE -ne 0) { throw 'Image build failed.' }
    }
    docker compose up -d --wait postgres
    if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL did not become ready.' }
    docker compose run --rm setup
    if ($LASTEXITCODE -ne 0) { throw 'Schema/reporting setup failed. Saved data has not been reset.' }
    docker compose up -d --wait api web airflow
    if ($LASTEXITCODE -ne 0) { throw 'Some services are not ready. Inspect docker compose logs.' }
    $webPort = (Select-String -LiteralPath '.env' -Pattern '^WEB_PORT=(.+)$').Matches.Groups[1].Value
    Write-Host "Open http://localhost:$webPort. Airflow login: admin; password is AIRFLOW_PASSWORD in your ignored .env."
} finally { Pop-Location }
