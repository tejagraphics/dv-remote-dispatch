using Newtonsoft.Json.Linq;
using System;
using UnityEngine;

namespace DvMod.RemoteDispatch
{
    public static class World
    {
        public readonly struct Position
        {
            public readonly float x;
            public readonly float z;

            public Position(float x, float z)
            {
                this.x = x;
                this.z = z;
            }

            public Position(Vector3 position) : this(position.x, position.z) { }
            public Position(Transform transform) : this(transform.position) { }

            public LatLon ToLatLon() => LatLon.From(this);
        }

        public readonly struct LatLon
        {
            private const int DecimalPlaces = 8; // 1.11 mm
            private const float EarthCircumference = 40e6f;
            private const float DegreesPerMeter = 360f / EarthCircumference;

            public readonly float latitude;
            public readonly float longitude;

            public LatLon(float latitude, float longitude)
            {
                this.latitude = (float)Math.Round(latitude, DecimalPlaces);
                this.longitude = (float)Math.Round(longitude, DecimalPlaces);
            }

            public static LatLon From(Position p) => new LatLon(DegreesPerMeter * p.z, DegreesPerMeter * p.x);

            public JToken ToJson() => new JArray(latitude, longitude);
        }
    }
}
