using DV.PointSet;
using Newtonsoft.Json.Linq;
using Newtonsoft.Json;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using System;
using UnityEngine;

namespace DvMod.RemoteDispatch
{
    public static class RailTracks
    {
        private const float SimplifiedResolution = 40f;
        private const int MinPointsForSubdivision = 3;

        private static IEnumerable<World.LatLon> NormalizeTrackPoints(IEnumerable<World.Position> positions) => positions.Select(p => p.ToLatLon());

        public static Dictionary<RailTrack, IEnumerable<World.LatLon>> GetNormalizedTrackCoordinates() =>
            GetAllTrackPoints().ToDictionary(kvp => kvp.Key, kvp => NormalizeTrackPoints(kvp.Value));

        public static Dictionary<RailTrack, IEnumerable<World.Position>> GetAllTrackPoints(float resolution = SimplifiedResolution)
        {
            if (!WorldStreamingInit.Instance || !WorldStreamingInit.IsLoaded)
                throw new Exception("World not yet loaded");
            var tracks = Component.FindObjectsOfType<RailTrack>();
            Main.DebugLog(() => $"Found {tracks.Length} RailTracks.");
            return tracks.ToDictionary(track => track, track => GetTrackPoints(track, resolution));
        }

        private static IEnumerable<World.Position> GetTrackPoints(RailTrack track, float resolution = SimplifiedResolution)
        {
            var pointSet = track.GetKinkedPointSet();
            EquiPointSet simplified = EquiPointSet.ResampleEquidistant(
                pointSet,
                Mathf.Min(resolution, (float)pointSet.span / MinPointsForSubdivision));

            foreach (var pt in simplified.points)
                yield return new World.Position((float)pt.position.x, (float)pt.position.z);
        }

        private static string? trackPointJson;

        private static string GenerateTrackPointJson()
        {
            trackPointJson = JsonConvert.SerializeObject(
                GetNormalizedTrackCoordinates().ToDictionary(
                    kvp => kvp.Key.LogicTrack().ID,
                    kvp => kvp.Value.Select(ll => ll.ToJson())));
            return trackPointJson;
        }

        public static async Task<string> GetTrackPointJson()
        {
            if (trackPointJson != null)
                return trackPointJson;
            if (!WorldStreamingInit.Instance)
                throw new Exception("World not yet loaded");

            if (WorldStreamingInit.IsLoaded)
                return GenerateTrackPointJson();

            var tcs = new TaskCompletionSource<string>();
            WorldStreamingInit.LoadingFinished += () => tcs.TrySetResult(GenerateTrackPointJson());
            if (WorldStreamingInit.IsLoaded)
                return GenerateTrackPointJson();

            return await tcs.Task.ConfigureAwait(false);
        }
    }

    public static class Junctions
    {
        private static string junctionPointJson = string.Empty;

        public static string GetJunctionPointJson()
        {
            if (!WorldStreamingInit.Instance || !WorldStreamingInit.IsLoaded)
                throw new Exception("World not yet loaded");
            if (string.IsNullOrEmpty(junctionPointJson))
            {
                junctionPointJson = JsonConvert.SerializeObject(
                    RailTrackRegistry.Instance.OrderedJunctions.Select(j =>
                    {
                        var moved = j.position - WorldMover.currentMove;
                        return new JObject(
                            new JProperty("position", new World.Position(moved.x, moved.z).ToLatLon().ToJson()),
                            new JProperty("branches", j.outBranches.Select(b => b.track.LogicTrack().ID.ToString()))
                        );
                    })
                );
            }
            return junctionPointJson;
        }

        public static IEnumerable<byte> GetAllJunctionStates()
        {
            if (!WorldStreamingInit.Instance || !WorldStreamingInit.IsLoaded)
                throw new Exception("World not yet loaded");
            return RailTrackRegistry.Instance.OrderedJunctions.Select(j => j.selectedBranch);
        }

        public static string GetJunctionStateJson()
        {
            return JsonConvert.SerializeObject(GetAllJunctionStates());
        }
    }
}