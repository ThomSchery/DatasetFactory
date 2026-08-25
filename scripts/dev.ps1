[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$frontendRoot = Join-Path $repositoryRoot "frontend"
$envPath = Join-Path $repositoryRoot ".env"
$pythonPath = Join-Path $repositoryRoot ".venv\Scripts\python.exe"
$vitePath = Join-Path $frontendRoot "node_modules\vite\bin\vite.js"
$backendProcess = $null
$frontendProcess = $null
$processJob = $null
$failed = $false

if ($null -eq ("DatasetFactoryKillOnCloseJob" -as [type])) {
    Add-Type -TypeDefinition @"
using System;
using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

public sealed class DatasetFactoryKillOnCloseJob : IDisposable
{
    private const uint JobObjectLimitKillOnJobClose = 0x00002000;
    private const int JobObjectExtendedLimitInformationClass = 9;
    private readonly SafeFileHandle handle;

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectBasicLimitInformation
    {
        public long PerProcessUserTimeLimit;
        public long PerJobUserTimeLimit;
        public uint LimitFlags;
        public UIntPtr MinimumWorkingSetSize;
        public UIntPtr MaximumWorkingSetSize;
        public uint ActiveProcessLimit;
        public UIntPtr Affinity;
        public uint PriorityClass;
        public uint SchedulingClass;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct IoCounters
    {
        public ulong ReadOperationCount;
        public ulong WriteOperationCount;
        public ulong OtherOperationCount;
        public ulong ReadTransferCount;
        public ulong WriteTransferCount;
        public ulong OtherTransferCount;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct JobObjectExtendedLimitInformation
    {
        public JobObjectBasicLimitInformation BasicLimitInformation;
        public IoCounters IoInfo;
        public UIntPtr ProcessMemoryLimit;
        public UIntPtr JobMemoryLimit;
        public UIntPtr PeakProcessMemoryUsed;
        public UIntPtr PeakJobMemoryUsed;
    }

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr CreateJobObject(IntPtr jobAttributes, string name);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool SetInformationJobObject(
        IntPtr job,
        int informationClass,
        ref JobObjectExtendedLimitInformation information,
        uint informationLength);

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

    public DatasetFactoryKillOnCloseJob()
    {
        IntPtr rawHandle = CreateJobObject(IntPtr.Zero, null);
        if (rawHandle == IntPtr.Zero)
        {
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Nie mozna utworzyc Windows Job Object.");
        }

        handle = new SafeFileHandle(rawHandle, true);
        JobObjectExtendedLimitInformation information = new JobObjectExtendedLimitInformation();
        information.BasicLimitInformation.LimitFlags = JobObjectLimitKillOnJobClose;
        uint length = (uint)Marshal.SizeOf(typeof(JobObjectExtendedLimitInformation));
        if (!SetInformationJobObject(rawHandle, JobObjectExtendedLimitInformationClass, ref information, length))
        {
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            throw new Win32Exception(error, "Nie mozna ustawic cleanupu Windows Job Object.");
        }
    }

    public void Add(Process process)
    {
        if (!AssignProcessToJobObject(handle.DangerousGetHandle(), process.Handle))
        {
            throw new Win32Exception(
                Marshal.GetLastWin32Error(),
                "Nie mozna przypisac procesu " + process.Id + " do Windows Job Object.");
        }
    }

    public void Dispose()
    {
        handle.Dispose();
    }
}
"@
}

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

function Stop-ProcessTree {
    param([System.Diagnostics.Process]$Process, [string]$Name)

    if ($null -eq $Process) {
        return
    }
    Write-Host "[dev] Zatrzymywanie $Name (PID $($Process.Id))..."
    $previousErrorAction = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & taskkill.exe /PID $Process.Id /T /F 2> $null | Out-Null
    }
    finally {
        $ErrorActionPreference = $previousErrorAction
    }
}

try {
    Import-DotEnv -Path $envPath
    if ($null -eq (Get-Command "node" -ErrorAction SilentlyContinue)) {
        throw "Brak polecenia node. Zainstaluj Node.js zgodnie z README."
    }
    if (-not (Test-Path -LiteralPath $pythonPath -PathType Leaf)) {
        throw "Brak .venv. Uruchom najpierw scripts/bootstrap.ps1."
    }
    if (-not (Test-Path -LiteralPath $vitePath -PathType Leaf)) {
        throw "Brak frontend/node_modules. Uruchom najpierw scripts/bootstrap.ps1."
    }

    $cacheDir = [Environment]::GetEnvironmentVariable("DF_CACHE_DIR", "Process")
    if (-not [string]::IsNullOrWhiteSpace($cacheDir)) {
        $env:UV_CACHE_DIR = Join-Path $cacheDir "uv"
        $env:NPM_CONFIG_CACHE = Join-Path $cacheDir "npm"
    }

    $hostName = [Environment]::GetEnvironmentVariable("DF_HOST", "Process")
    $port = [Environment]::GetEnvironmentVariable("DF_PORT", "Process")
    if ([string]::IsNullOrWhiteSpace($hostName)) { $hostName = "127.0.0.1" }
    if ([string]::IsNullOrWhiteSpace($port)) { $port = "8000" }

    $processJob = [DatasetFactoryKillOnCloseJob]::new()

    Write-Host "[dev] Backend: http://${hostName}:$port"
    $backendProcess = Start-Process -FilePath $pythonPath -ArgumentList @(
        "-m", "uvicorn", "backend.app.main:app",
        "--host", $hostName, "--port", $port
    ) -WorkingDirectory $repositoryRoot -NoNewWindow -PassThru
    $processJob.Add($backendProcess)

    Write-Host "[dev] Frontend: http://127.0.0.1:5173"
    $frontendProcess = Start-Process -FilePath "node" -ArgumentList @($vitePath, "--host", "127.0.0.1") `
        -WorkingDirectory $frontendRoot -NoNewWindow -PassThru
    $processJob.Add($frontendProcess)

    Write-Host "[dev] Oba procesy dzialaja. Nacisnij Ctrl+C, aby je zatrzymac."
    while ($true) {
        Start-Sleep -Milliseconds 500
        $backendProcess.Refresh()
        $frontendProcess.Refresh()
        if ($backendProcess.HasExited) {
            throw "Backend zakonczyl sie nieoczekiwanie (exit $($backendProcess.ExitCode))."
        }
        if ($frontendProcess.HasExited) {
            throw "Frontend zakonczyl sie nieoczekiwanie (exit $($frontendProcess.ExitCode))."
        }
    }
}
catch {
    $failed = $true
    Write-Host "[dev] BLAD: $($_.Exception.Message)" -ForegroundColor Red
}
finally {
    Stop-ProcessTree -Process $frontendProcess -Name "Vite"
    Stop-ProcessTree -Process $backendProcess -Name "uvicorn"
    if ($null -ne $processJob) {
        $processJob.Dispose()
    }
    Write-Host "[dev] Zakonczono oba procesy deweloperskie."
}

if ($failed) {
    exit 1
}
exit 0
