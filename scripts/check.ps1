[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $repositoryRoot "frontend"
$envPath = Join-Path $repositoryRoot ".env"
$results = New-Object System.Collections.Generic.List[object]
$failure = $null

function Import-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Brak pliku .env. Skopiuj .env.example do .env i uruchom scripts/bootstrap.ps1."
    }
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
            continue
        }
        if ($trimmed -notmatch "^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$") {
            throw "Niepoprawny wpis w .env: '$trimmed'."
        }
        $value = $Matches.value.Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        [Environment]::SetEnvironmentVariable($Matches.key, $value, "Process")
    }
}

function Invoke-Gate {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$DisplayCommand,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    Write-Host ""
    Write-Host "[check] START: $Name"
    Write-Host "[check] > $DisplayCommand"
    $startedAt = Get-Date
    $exitCode = 1
    $detail = $null
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        $exitCode = $LASTEXITCODE
    }
    catch {
        $detail = $_.Exception.Message
    }
    finally {
        Pop-Location
    }

    $duration = [math]::Round(((Get-Date) - $startedAt).TotalSeconds, 1)
    if ($exitCode -eq 0 -and $null -eq $detail) {
        $results.Add([pscustomobject]@{ Name = $Name; Status = "PASS"; Seconds = $duration })
        Write-Host "[check] PASS: $Name (${duration}s)" -ForegroundColor Green
        return
    }

    if ($null -eq $detail) {
        $detail = "exit $exitCode"
    }
    $results.Add([pscustomobject]@{ Name = $Name; Status = "FAIL"; Seconds = $duration })
    $script:failure = "$Name ($detail)"
    Write-Host "[check] FAIL: $script:failure" -ForegroundColor Red
}

$gates = @(
    [pscustomobject]@{ Name = "backend format"; Command = "ruff format --check"; Root = $repositoryRoot; File = "uv"; Args = @("run", "--frozen", "ruff", "format", "--check") },
    [pscustomobject]@{ Name = "backend lint"; Command = "ruff check"; Root = $repositoryRoot; File = "uv"; Args = @("run", "--frozen", "ruff", "check") },
    [pscustomobject]@{ Name = "backend typy"; Command = "python -m mypy"; Root = $repositoryRoot; File = "uv"; Args = @("run", "--frozen", "python", "-m", "mypy") },
    [pscustomobject]@{ Name = "backend testy"; Command = "pytest"; Root = $repositoryRoot; File = "uv"; Args = @("run", "--frozen", "pytest") },
    [pscustomobject]@{ Name = "frontend typy"; Command = "npm run typecheck"; Root = $frontendRoot; File = "npm.cmd"; Args = @("run", "typecheck") },
    [pscustomobject]@{ Name = "frontend testy"; Command = "npm test"; Root = $frontendRoot; File = "npm.cmd"; Args = @("test") },
    [pscustomobject]@{ Name = "frontend build"; Command = "npm run build"; Root = $frontendRoot; File = "npm.cmd"; Args = @("run", "build") },
    [pscustomobject]@{ Name = "E2E"; Command = "npm run e2e"; Root = $frontendRoot; File = "npm.cmd"; Args = @("run", "e2e") },
    [pscustomobject]@{ Name = "E2E root safety"; Command = "npm run test:e2e-root"; Root = $frontendRoot; File = "npm.cmd"; Args = @("run", "test:e2e-root") }
)

try {
    Import-DotEnv -Path $envPath
    $cacheDir = [Environment]::GetEnvironmentVariable("DF_CACHE_DIR", "Process")
    if ([string]::IsNullOrWhiteSpace($cacheDir)) {
        throw "Brak DF_CACHE_DIR w .env."
    }
    if ([System.IO.Path]::GetPathRoot($cacheDir) -ne "D:\") {
        throw "DF_CACHE_DIR musi wskazywac katalog na D:. Otrzymano: $cacheDir"
    }

    $env:UV_CACHE_DIR = Join-Path $cacheDir "uv"
    $env:NPM_CONFIG_CACHE = Join-Path $cacheDir "npm"
    $env:DATASETFACTORY_CACHE_ROOT = $cacheDir
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $cacheDir "ms-playwright"

    foreach ($gate in $gates) {
        Invoke-Gate -Name $gate.Name -DisplayCommand $gate.Command `
            -WorkingDirectory $gate.Root -FilePath $gate.File -Arguments $gate.Args
        if ($null -ne $failure) {
            break
        }
    }
}
catch {
    $failure = "przygotowanie bramek ($($_.Exception.Message))"
}
finally {
    Write-Host ""
    Write-Host "[check] PODSUMOWANIE"
    foreach ($result in $results) {
        Write-Host ("[check] {0,-4} {1} ({2}s)" -f $result.Status, $result.Name, $result.Seconds)
    }
    $skipped = $gates.Count - $results.Count
    if ($skipped -gt 0) {
        Write-Host "[check] SKIP $skipped pozostalych bramek."
    }
    if ($null -ne $failure) {
        Write-Host "[check] WYNIK: FAIL - $failure" -ForegroundColor Red
    }
    else {
        Write-Host "[check] WYNIK: PASS - wszystkie $($gates.Count) bramki sa zielone." -ForegroundColor Green
    }
}

if ($null -ne $failure) {
    exit 1
}
exit 0
