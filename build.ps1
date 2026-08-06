#Requires -Version 5.1
<#
.SYNOPSIS
    Builds Remote Dispatch mod for Derail Valley.

.DESCRIPTION
    Restores NuGet packages and builds the project in Release configuration.
    Creates Directory.Build.targets from template if it doesn't exist.

.PARAMETER Configuration
    Build configuration. Default: Release

.PARAMETER Install
    If specified, copies the built DLL to the game's mod folder.

.EXAMPLE
    .\build.ps1
    .\build.ps1 -Install
    .\build.ps1 -Configuration Debug
#>
param(
    [ValidateSet("Debug", "Release")]
    [string]$Configuration = "Release",

    [switch]$Install
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Remote Dispatch - Build Script" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Check for .NET SDK
$dotnet = Get-Command dotnet -ErrorAction SilentlyContinue
if (-not $dotnet) {
    Write-Host "ERROR: .NET SDK not found." -ForegroundColor Red
    Write-Host ""
    Write-Host "Install from: https://dotnet.microsoft.com/download"
    Write-Host "Any .NET 6, 7, or 8 SDK will work."
    exit 1
}

$sdkVersion = & dotnet --version 2>$null
Write-Host "Using .NET SDK: $sdkVersion"

# Create Directory.Build.targets from template if missing
$targetsFile = Join-Path $PSScriptRoot "Directory.Build.targets"
$templateFile = Join-Path $PSScriptRoot "Directory.Build.targets.template"

if (-not (Test-Path $targetsFile)) {
    if (Test-Path $templateFile) {
        Copy-Item $templateFile $targetsFile
        Write-Host "Created Directory.Build.targets from template." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "If the build fails because the game path was not auto-detected,"
        Write-Host "edit Directory.Build.targets and set DerailValleyDir."
        Write-Host ""
    }
    else {
        Write-Host "ERROR: Directory.Build.targets.template not found." -ForegroundColor Red
        Write-Host "Ensure you are running this from the repository root."
        exit 1
    }
}

# Clean
Write-Host "Cleaning..." -ForegroundColor Gray
& dotnet clean -c $Configuration -v q --nologo 2>$null

# Restore
Write-Host "Restoring NuGet packages..." -ForegroundColor Gray
& dotnet restore --nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "ERROR: NuGet restore failed." -ForegroundColor Red
    exit 1
}

# Build
Write-Host "Building $Configuration..." -ForegroundColor Gray
Write-Host ""
& dotnet build -c $Configuration --no-restore --nologo
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Red
    Write-Host " BUILD FAILED" -ForegroundColor Red
    Write-Host "============================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Common fixes:"
    Write-Host "  1. Edit Directory.Build.targets and set DerailValleyDir"
    Write-Host "  2. Ensure Derail Valley is installed"
    Write-Host "  3. Ensure .NET SDK is installed"
    exit 1
}

$dllPath = Join-Path $PSScriptRoot "bin\$Configuration\netstandard2.0\RemoteDispatch.dll"

Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host " BUILD SUCCEEDED" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Output: $dllPath"

# Install if requested
if ($Install) {
    # Try to read DerailValleyDir from the targets file
    [xml]$targets = Get-Content $targetsFile
    $gameDir = $null

    # Try common auto-detect paths
    $searchPaths = @(
        "C:\Program Files (x86)\Steam\steamapps\common\Derail Valley",
        "C:\Program Files\Steam\steamapps\common\Derail Valley",
        "D:\Steam\steamapps\common\Derail Valley",
        "D:\SteamLibrary\steamapps\common\Derail Valley",
        "E:\SteamLibrary\steamapps\common\Derail Valley",
        "F:\SteamLibrary\steamapps\common\Derail Valley",
        "C:\GOG Games\Derail Valley"
    )

    foreach ($path in $searchPaths) {
        if (Test-Path (Join-Path $path "DerailValley_Data")) {
            $gameDir = $path
            break
        }
    }

    if ($gameDir) {
        $modDir = Join-Path $gameDir "Mods\RemoteDispatch"
        if (-not (Test-Path $modDir)) {
            New-Item -ItemType Directory -Path $modDir -Force | Out-Null
        }
        Copy-Item $dllPath $modDir -Force
        Write-Host ""
        Write-Host "Installed to: $modDir\RemoteDispatch.dll" -ForegroundColor Green
    }
    else {
        Write-Host ""
        Write-Host "Could not find Derail Valley installation for auto-install." -ForegroundColor Yellow
        Write-Host "Manually copy RemoteDispatch.dll to your Mods\RemoteDispatch\ folder."
    }
}
else {
    Write-Host ""
    Write-Host "To install, copy RemoteDispatch.dll to:"
    Write-Host "  <Derail Valley>\Mods\RemoteDispatch\RemoteDispatch.dll"
    Write-Host ""
    Write-Host "Or run: .\build.ps1 -Install"
}

Write-Host ""
