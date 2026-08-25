[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $repositoryRoot ".env"
$frontendRoot = Join-Path $repositoryRoot "frontend"

function Import-DotEnv {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Brak pliku .env. Skopiuj .env.example do .env i ustaw lokalne sciezki na D:."
    }

    $values = @{}
    foreach ($line in Get-Content -LiteralPath $Path -Encoding UTF8) {
        $trimmed = $line.Trim()
        if ($trimmed.Length -eq 0 -or $trimmed.StartsWith("#")) {
            continue
        }
        if ($trimmed -notmatch "^(?<key>[A-Za-z_][A-Za-z0-9_]*)=(?<value>.*)$") {
            throw "Niepoprawny wpis w .env: '$trimmed'. Oczekiwany format to KLUCZ=WARTOSC."
        }

        $value = $Matches.value.Trim()
        if ($value.Length -ge 2) {
            $first = $value.Substring(0, 1)
            $last = $value.Substring($value.Length - 1, 1)
            if (($first -eq '"' -and $last -eq '"') -or ($first -eq "'" -and $last -eq "'")) {
                $value = $value.Substring(1, $value.Length - 2)
            }
        }
        $key = $Matches.key
        $values[$key] = $value
        [Environment]::SetEnvironmentVariable($key, $value, "Process")
    }
    return $values
}

function Get-RequiredEnvironmentValue {
    param(
        [Parameter(Mandatory = $true)][hashtable]$Values,
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$SourcePath
    )

    if (-not $Values.ContainsKey($Name) -or [string]::IsNullOrWhiteSpace($Values[$Name])) {
        throw "Brak wymaganego klucza $Name w pliku '$SourcePath'."
    }
    return $Values[$Name]
}

function Assert-PathOnDDrive {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path
    )

    $root = [System.IO.Path]::GetPathRoot($Path)
    if ($root -ne "D:\") {
        throw "$Name musi wskazywac katalog lub plik na D:. Otrzymano: $Path"
    }
}

function Assert-Executable {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string[]]$Arguments,
        [Parameter(Mandatory = $true)][string]$InstallHint
    )

    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Brak $Name pod sciezka '$Path'. $InstallHint"
    }

    $exitCode = 1
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $Path @Arguments 1> $null 2> $null
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
    if ($exitCode -ne 0) {
        throw "$Name istnieje pod '$Path', ale nie uruchamia sie poprawnie (exit $exitCode). $InstallHint"
    }
    Write-Host "[bootstrap] OK: wykryto $Name pod '$Path'."
}

function Assert-Sha256 {
    param(
        [Parameter(Mandatory = $true)][string]$Name,
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$ExpectedHash
    )

    if ($ExpectedHash -notmatch "^[0-9A-Fa-f]{64}$") {
        throw "${Name}: suma SHA-256 w .env musi zawierac 64 znaki szesnastkowe."
    }
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Brak $Name pod sciezka '$Path'. Umiesc zweryfikowany artefakt dev-only na D: i popraw .env."
    }

    $actualHash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash
    if ($actualHash -ne $ExpectedHash) {
        throw "$Name ma niezgodna sume SHA-256. Oczekiwano $ExpectedHash, otrzymano $actualHash. Nie uzywaj tego artefaktu."
    }
    Write-Host "[bootstrap] OK: $Name ma oczekiwana sume SHA-256 $actualHash."
}

function Assert-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Brak polecenia '$Name'. Zainstaluj je zgodnie z README, a potem uruchom bootstrap ponownie."
    }
}

try {
    $dotenvValues = Import-DotEnv -Path $envPath
    $requiredValueParameters = @{
        Values = $dotenvValues
        SourcePath = $envPath
    }

    $workspaceDir = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_WORKSPACE_DIR"
    $cacheDir = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_CACHE_DIR"
    $ffmpegPath = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_FFMPEG_PATH"
    $ffprobePath = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_FFPROBE_PATH"
    $tesseractPath = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_TESSERACT_PATH"
    $tesseractModelPath = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_TESSERACT_MODEL_PATH"
    $runtimeHash = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_TESSERACT_RUNTIME_SHA256"
    $modelHash = Get-RequiredEnvironmentValue @requiredValueParameters -Name "DF_TESSERACT_MODEL_SHA256"

    Assert-PathOnDDrive -Name "DF_WORKSPACE_DIR" -Path $workspaceDir
    Assert-PathOnDDrive -Name "DF_CACHE_DIR" -Path $cacheDir
    Assert-PathOnDDrive -Name "DF_TESSERACT_PATH" -Path $tesseractPath
    Assert-PathOnDDrive -Name "DF_TESSERACT_MODEL_PATH" -Path $tesseractModelPath

    $ffmpegHint = "Rozpakuj portable FFmpeg do D:\tools\ffmpeg i ustaw DF_FFMPEG_PATH oraz DF_FFPROBE_PATH; bootstrap nie instaluje go globalnie."
    $tesseractHint = "Umiesc zweryfikowany runtime dev-only w D:\tools\tesseract-5.5.3 i ustaw sciezki oraz sumy SHA-256 w .env; bootstrap nie instaluje go globalnie."
    Assert-Executable -Name "FFmpeg" -Path $ffmpegPath -Arguments @("-version") -InstallHint $ffmpegHint
    Assert-Executable -Name "ffprobe" -Path $ffprobePath -Arguments @("-version") -InstallHint $ffmpegHint
    Assert-Sha256 -Name "runtime Tesseract" -Path $tesseractPath -ExpectedHash $runtimeHash
    Assert-Sha256 -Name "model Tesseract" -Path $tesseractModelPath -ExpectedHash $modelHash
    Assert-Executable -Name "Tesseract" -Path $tesseractPath -Arguments @("--version") -InstallHint $tesseractHint

    Assert-CommandAvailable -Name "uv"
    Assert-CommandAvailable -Name "node"
    Assert-CommandAvailable -Name "npm.cmd"

    New-Item -ItemType Directory -Force -Path $workspaceDir, $cacheDir | Out-Null
    $env:UV_CACHE_DIR = Join-Path $cacheDir "uv"
    $env:NPM_CONFIG_CACHE = Join-Path $cacheDir "npm"
    $env:DATASETFACTORY_CACHE_ROOT = $cacheDir
    $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $cacheDir "ms-playwright"

    Write-Host "[bootstrap] Synchronizacja lockowanych zaleznosci Python z uv.lock..."
    Push-Location $repositoryRoot
    try {
        & uv sync --frozen
        if ($LASTEXITCODE -ne 0) {
            throw "uv sync --frozen zakonczyl sie kodem $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    Write-Host "[bootstrap] Instalacja lokalnych zaleznosci frontendowych z package-lock.json..."
    Push-Location $frontendRoot
    try {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) {
            throw "npm ci zakonczyl sie kodem $LASTEXITCODE."
        }
        & npm.cmd run e2e:install
        if ($LASTEXITCODE -ne 0) {
            throw "npm run e2e:install zakonczyl sie kodem $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "[bootstrap] SUKCES: srodowisko lokalne jest gotowe."
    Write-Host "[bootstrap] Nic nie zostalo zainstalowane globalnie ani dopisane do systemowego PATH."
    exit 0
}
catch {
    Write-Host ""
    Write-Host "[bootstrap] BLAD: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "[bootstrap] Popraw konfiguracje zgodnie z README i docs/RUNBOOK.md, a nastepnie uruchom skrypt ponownie."
    exit 1
}
