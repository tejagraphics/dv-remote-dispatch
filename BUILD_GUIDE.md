# Building Remote Dispatch

## Prerequisites

| Requirement | Version | Download |
|-------------|---------|----------|
| .NET SDK | 6.0, 7.0, or 8.0 | [dotnet.microsoft.com/download](https://dotnet.microsoft.com/download) |
| Derail Valley | Installed via Steam or GOG | Required for game DLLs |

> **Note:** You need the .NET **SDK**, not just the Runtime. Verify with `dotnet --version`.

## Quick Start

### Windows (batch script)
```
git clone https://github.com/tejagraphics/dv-remote-dispatch.git
cd dv-remote-dispatch
build.bat
```

### Windows (PowerShell)
```powershell
git clone https://github.com/tejagraphics/dv-remote-dispatch.git
cd dv-remote-dispatch
.\build.ps1
```

### Manual
```
git clone https://github.com/tejagraphics/dv-remote-dispatch.git
cd dv-remote-dispatch
copy Directory.Build.targets.template Directory.Build.targets
dotnet build -c Release
```

## Game Path Configuration

The build needs to find Derail Valley's game DLLs. It checks these locations automatically:

| Platform | Path |
|----------|------|
| Steam (default) | `C:\Program Files (x86)\Steam\steamapps\common\Derail Valley` |
| Steam (alt) | `C:\Program Files\Steam\steamapps\common\Derail Valley` |
| Steam (D:) | `D:\Steam\steamapps\common\Derail Valley` |
| Steam (library) | `D:\SteamLibrary\steamapps\common\Derail Valley` |
| Steam (E:, F:) | `E:\SteamLibrary\...`, `F:\SteamLibrary\...` |
| GOG | `C:\GOG Games\Derail Valley` |

**If your game is not at any of these paths:**

1. Open `Directory.Build.targets`
2. Uncomment and edit the `DerailValleyDir` line:
```xml
<DerailValleyDir>X:\Your\Path\To\Derail Valley</DerailValleyDir>
```

> **Tip:** In Steam, right-click Derail Valley → Manage → Browse Local Files to find your path.

## Output

After a successful build:

```
bin\Release\netstandard2.0\RemoteDispatch.dll
```

## Installation

Copy the built DLL to your mod folder:

```
<Derail Valley>\Mods\RemoteDispatch\RemoteDispatch.dll
```

Or use the PowerShell script with auto-install:
```powershell
.\build.ps1 -Install
```

Your mod folder should look like:
```
Mods\RemoteDispatch\
├── info.json              ← keep existing
├── RemoteDispatch.dll     ← replace with built version
└── Settings.xml           ← keep existing (your settings)
```

Delete any `.cache` files — the game regenerates them.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `DerailValleyDir not found` | Game path not detected | Set `DerailValleyDir` in `Directory.Build.targets` |
| `Assembly-CSharp.dll not found` | Wrong game path | Verify the path contains `DerailValley.exe` |
| `dotnet: command not found` | .NET SDK not installed | Install from [dotnet.microsoft.com](https://dotnet.microsoft.com/download) |
| `NuGet restore failed` | No internet connection | NuGet packages need to be downloaded once |
| `NU1701 warnings` | Expected — NuGet TFM mismatch | These are suppressed and harmless |
| Old UI still shows | Browser cache | Hard refresh: `Ctrl+Shift+R` |

## Project Structure

```
RemoteDispatch.csproj              C# project file
Directory.Build.targets.template   Build config template (tracked by git)
Directory.Build.targets            Your local build config (NOT tracked by git)
build.bat                          Windows build script
build.ps1                          PowerShell build script
*.cs                               C# source files
index.html, main.js, style.css     Web UI (embedded into DLL at build time)
```

## Dependencies

### From NuGet (downloaded automatically)
- `UnityModManager 0.27.2` → Unity Mod Manager API + Harmony (transitive)
- `Krafs.Publicizer 2.2.1` → Compile-time access to internal game members

### From Game Installation (via `Directory.Build.targets`)
- `Assembly-CSharp.dll` — Core game assembly
- `DV.BrakeSystem.dll`, `DV.Common.dll`, `DV.Interaction.dll`, `DV.PointSet.dll`, `DV.RailTrack.dll`, `DV.Simulation.dll`, `DV.ThingTypes.dll`, `DV.Utils.dll` — Game subsystem DLLs
- `Newtonsoft.Json.dll`, `Microsoft.CSharp.dll` — .NET libraries shipped with the game
- `net.smkd.vector3d.dll`, `WorldStreamer.dll` — Third-party game dependencies
- `UnityEngine.CoreModule.dll`, `UnityEngine.IMGUIModule.dll` — Unity engine
