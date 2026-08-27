[CmdletBinding()]
param(
    [switch]$BuildOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $repositoryRoot "frontend"
$spaDir = Join-Path $frontendRoot "dist"

function Assert-CommandAvailable {
    param([Parameter(Mandatory = $true)][string]$Name)

    if ($null -eq (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Brak polecenia '$Name'. Uruchom najpierw scripts/bootstrap.ps1."
    }
}

try {
    Assert-CommandAvailable -Name "npm.cmd"
    Assert-CommandAvailable -Name "uv"

    Write-Host "[package-local] Budowanie SPA..."
    Push-Location $frontendRoot
    try {
        & npm.cmd run build
        if ($LASTEXITCODE -ne 0) {
            throw "npm run build zakonczyl sie kodem $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }

    $indexPath = Join-Path $spaDir "index.html"
    $assetsPath = Join-Path $spaDir "assets"
    if (-not (Test-Path -LiteralPath $indexPath -PathType Leaf) -or
        -not (Test-Path -LiteralPath $assetsPath -PathType Container)) {
        throw "Build SPA nie zawiera index.html i katalogu assets."
    }

    $forbiddenOcrArtifacts = @(
        Get-ChildItem -LiteralPath $spaDir -Recurse -File | Where-Object {
            $_.Extension -in @(".exe", ".traineddata") -or $_.Name -match "(?i)tesseract"
        }
    )
    if ($forbiddenOcrArtifacts.Count -gt 0) {
        throw "Pakiet zawiera niedozwolony runtime lub model OCR."
    }

    Write-Host "[package-local] OK: SPA zbudowana bez binarki i modelu OCR."
    if ($BuildOnly) {
        exit 0
    }

    $env:DF_SPA_DIR = $spaDir
    Write-Host "[package-local] Start FastAPI + SPA pod adresem DF_HOST/DF_PORT (bez Vite)."
    Push-Location $repositoryRoot
    try {
        & uv run --frozen python -m backend.app.packaged
        if ($LASTEXITCODE -ne 0) {
            throw "Packaged-local zakonczyl sie kodem $LASTEXITCODE."
        }
    }
    finally {
        Pop-Location
    }
}
catch {
    Write-Host ""
    Write-Host "[package-local] BLAD: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
