# Remote Dispatch — Repository Analysis, Improvement Plan & Change Summary

## Phase 1: Repository Analysis

### Overview
Remote Dispatch is a Derail Valley mod that exposes an embedded HTTP server serving a Leaflet-based web map interface. The web UI displays railway tracks, junctions, train cars, jobs, and player positions in real time. Users can toggle junctions and remotely control locomotives through the browser.

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Browser (Leaflet Map UI)                                │
│  index.html + main.js + style.css                        │
│  leaflet.rotatedImageOverlay.js                          │
└────────────────────┬─────────────────────────────────────┘
                     │ HTTP (long-poll /updates/{sessionId})
                     │ GET /car, /job, /junction, /track, /player
                     │ POST /junction/{id}/toggle, /car/{guid}/control
┌────────────────────▼─────────────────────────────────────┐
│  HttpServer (MonoBehaviour on DontDestroyOnLoad GO)       │
│  System.Net.HttpListener on configurable port             │
│  Serves embedded resources + JSON API                     │
└────────────────────┬─────────────────────────────────────┘
                     │
     ┌───────────────┼───────────────┬───────────────────┐
     ▼               ▼               ▼                   ▼
 CarData        JobData         RailTracks/         PlayerData
 CarUpdater     (Harmony)       Junctions           (poll coroutine)
                                (Harmony)
     │               │               │                   │
     └───────┬───────┴───────┬───────┘                   │
             ▼               ▼                           │
         Sessions ◄──────────────────────────────────────┘
         (tag-based dirty tracking + long-poll via AsyncSet)
             │
             ▼
         Updater (MonoBehaviour)
         - Main-thread task queue (ConcurrentQueue<Action>)
         - Coroutines: player transform, trainset movement, deferred events
```

### Design Patterns
- **MonoBehaviour singletons** for HttpServer and Updater (manual lifecycle)
- **Tag-based pub/sub** via Sessions for dirty tracking
- **Long-polling** for real-time updates (not WebSocket)
- **Main-thread marshalling** via ConcurrentQueue + coroutine drain
- **Harmony patches** for intercepting game events
- **Embedded resources** for serving static web assets

---

## Phase 2: Identified Issues & Improvement Plan

### HIGH IMPACT — All Implemented ✅

| ID | Issue | Fix |
|----|-------|-----|
| H1 | `HandleCarRequest` POST falls through to `RenderEmpty(404)` after sending 204/400 — double response causes `ObjectDisposedException` | Added missing `return` after POST handler |
| H2 | `HandleCarRequest` and `HandleJunctionRequest` are `async void` — unhandled exceptions crash Unity | Changed to `async Task`, callers now `await` |
| H3 | `jobIdForCar` static field initializer calls `InitializeJobIdForCar()` before `JobsManager` exists | Changed to lazy property initialization |
| H4 | `HandleTrainsetRequest` uses `int.Parse` — throws on malformed input | Changed to `int.TryParse` with 400 response |
| H5 | `Permissions` constructor subscribes to `Sessions.OnSessionStarted` on every deserialization — event leak | Explicit `Subscribe()`/`Unsubscribe()` lifecycle |

### MEDIUM IMPACT — All Implemented ✅

| ID | Issue | Fix |
|----|-------|-----|
| M1 | `AsyncSet.Add` uses `queue.Contains` — O(n) linear scan | Added `HashSet<T>` for O(1) dedup |
| M2 | `MemoryStream` in gzip path never disposed | Added `using` blocks for both streams |
| M3 | `World` types embedded in `RailTracks.cs` but used across 4 files | Extracted to dedicated `World.cs` |
| M4 | Magic numbers throughout: `128`, `0.1f`, `40f`, `1e-3`, etc. | Replaced with named constants |
| M5 | Events fired under `allSessionsLock` — potential deadlock | Collect events, fire after lock release |
| M6 | `GetUsersWithActiveSessions` accesses dictionary without lock | Added lock |
| M7 | Dead UI code: `uncommittedPort` never applied, `message` never set | Port now applies, message removed |
| M8 | Naming: mix of `JSON` and `Json` suffixes | Standardized to `Json` |
| M9 | `allSesssionsLock` triple-s typo | Fixed to `allSessionsLock` |
| M10 | Empty catch block in `Main.Load` | Now logs the error message |
| M11 | `HandleTrainsetRequest` unnecessarily public | Changed to private |

---

## Phase 3-5: Implementation Summary — Files Changed

### New Files
| File | Purpose |
|------|---------|
| `World.cs` | Extracted `World.Position` and `World.LatLon` value types with `DegreesPerMeter` constant naming |

### Modified Files

| File | Changes |
|------|---------|
| `AsyncSet.cs` | Added `HashSet<T> itemSet` for O(1) dedup; maintain set in `Add`, `TakeAll`, `TryTakeAsync`; added trailing newline |
| `HttpServer.cs` | `GzipMinBytes` constant; `HandleCarRequest`/`HandleJunctionRequest` → `async Task`; callers now `await`; fixed double-response bug; `HandleTrainsetRequest` → private + `TryParse`; `MemoryStream` disposal; renamed JSON methods |
| `JobData.cs` | `jobIdForCar` → lazy property with backing `_jobIdForCar` field |
| `Main.cs` | `catch` now logs error; calls `settings.permissions.Subscribe()` |
| `PlayerData.cs` | `PositionEpsilon` constant replaces magic `1e-3` |
| `RailTracks.cs` | Removed `World` class (moved to `World.cs`); renamed constants to PascalCase; renamed all `*JSON` → `*Json` methods and fields |
| `Session.cs` | Fixed typo `allSesssionsLock` → `allSessionsLock`; fire events outside lock in `AddTag` and `GetTags`; added lock to `GetUsersWithActiveSessions` |
| `Settings.cs` | `MinPort`/`MaxPort` constants; port value now actually applied; removed dead `message` field; `Permissions` now has explicit `Subscribe()`/`Unsubscribe()` lifecycle |
| `Updater.cs` | `PlayerCheckIntervalSeconds` constant |

---

## Phase 6: Validation

- All old references (`GetJunctionPointJSON`, `allSesssionsLock`, `SIMPLIFIED_RESOLUTION`, etc.) verified removed via grep
- All new references consistent across files
- No orphaned using statements
- No broken cross-file references
- `World` types accessible from all consuming files via namespace

---

## Remaining Technical Debt

1. **`CarData.GetCarGuidDataJson` and `GetAllCarData` call `.Result` on Tasks** that dispatch to the main thread. Safe when called from HTTP threads, but would deadlock if ever called from the main thread. Consider making these `async Task<T>` throughout.

2. **`CheckTrainsetsCoro` iterates all trainsets every frame**. Could benefit from a fixed interval (e.g., every 0.5s) if performance profiling shows it as a bottleneck. However, the current behavior is intentional for smooth real-time car movement on the map.

3. **`Permissions.HasJunctionPermission` / `HasLocoControlPermission` use `List.Find`** — O(n). Could use a `Dictionary<string, PlayerPermissions>` for O(1) lookup, but the list is typically very small (few connected users).

4. **Frontend (`main.js`) is a single 955-line file** with no modularization. If the web UI grows, it would benefit from module splitting. However, since it's served as an embedded resource and the current scope is manageable, this is low priority.

5. **No request timeout on the HTTP server**. Long-running requests could theoretically hold connections open indefinitely.

6. **The `dynamic` usage in `JobData.GetAllJobData` for rural tasks** (`((dynamic)task).isLoading`, `((dynamic)task).stationId`) is a reflection-based pattern that's fragile and slow. This appears to be working around a type that isn't available at compile time, so changing it would require understanding the game's API better.

---

## Recommendations for Future Improvements

1. **WebSocket upgrade**: Replace long-polling with WebSocket for lower latency and reduced connection overhead. This would be a significant architectural change but would improve responsiveness, especially for locomotive control.

2. **Response caching for static data**: Track geometry and junction positions are computed once and cached, which is good. Consider adding HTTP cache headers (`Cache-Control`, `ETag`) so browsers can avoid re-downloading unchanged data.

3. **Structured logging**: Replace the `Func<string>` debug log pattern with a structured logging framework for better production diagnostics.

4. **Unit tests**: The `AsyncSet`, `World.Position`/`LatLon`, and `Sessions` classes have well-defined behavior that could be unit tested outside of Unity.

5. **Configuration validation**: Add validation when the HTTP server fails to start (e.g., port already in use) and surface the error to the user through the mod settings UI.
