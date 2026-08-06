@echo off
setlocal

echo ============================================
echo  Remote Dispatch - Build Script
echo ============================================
echo.

:: Check for .NET SDK
where dotnet >nul 2>&1
if errorlevel 1 (
    echo ERROR: .NET SDK not found.
    echo.
    echo Install it from: https://dotnet.microsoft.com/download
    echo Any .NET 6, 7, or 8 SDK will work.
    echo.
    pause
    exit /b 1
)

:: Check for Directory.Build.targets
if not exist "Directory.Build.targets" (
    echo Directory.Build.targets not found. Creating from template...
    if exist "Directory.Build.targets.template" (
        copy "Directory.Build.targets.template" "Directory.Build.targets" >nul
        echo Created Directory.Build.targets from template.
        echo.
        echo If the build fails because the game path was not auto-detected,
        echo edit Directory.Build.targets and set DerailValleyDir to your
        echo Derail Valley installation folder.
        echo.
    ) else (
        echo ERROR: Directory.Build.targets.template not found.
        echo Ensure you are running this from the repository root.
        pause
        exit /b 1
    )
)

:: Clean
echo Cleaning...
dotnet clean -c Release -v q --nologo 2>nul

:: Restore NuGet packages
echo Restoring NuGet packages...
dotnet restore --nologo
if errorlevel 1 (
    echo.
    echo ERROR: NuGet restore failed. Check your internet connection.
    pause
    exit /b 1
)

:: Build
echo Building Release...
echo.
dotnet build -c Release --no-restore --nologo
if errorlevel 1 (
    echo.
    echo ============================================
    echo  BUILD FAILED
    echo ============================================
    echo.
    echo Common fixes:
    echo   1. Edit Directory.Build.targets and set DerailValleyDir
    echo   2. Ensure Derail Valley is installed
    echo   3. Ensure .NET SDK is installed
    echo.
    pause
    exit /b 1
)

echo.
echo ============================================
echo  BUILD SUCCEEDED
echo ============================================
echo.
echo Output: bin\Release\netstandard2.0\RemoteDispatch.dll
echo.
echo To install, copy RemoteDispatch.dll to:
echo   ^<Derail Valley^>\Mods\RemoteDispatch\RemoteDispatch.dll
echo.

pause
