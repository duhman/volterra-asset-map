import type { Facility } from "@/lib/supabase/types";
import type { FeatureCollection, Point, Feature } from "geojson";

export interface FacilityProperties {
  id: string;
  name: string;
  country: string;
  city: string | null;
  address: string | null;
  postal_code: string | null;
  charger_count: number;
}

export type FacilityFeature = Feature<Point, FacilityProperties>;
export type FacilitiesGeoJSON = FeatureCollection<Point, FacilityProperties>;

/**
 * Convert facilities array to GeoJSON FeatureCollection
 * Only includes facilities with valid coordinates
 */
export function facilitiesToGeoJSON(facilities: Facility[]): FacilitiesGeoJSON {
  const features: FacilityFeature[] = facilities
    .filter((f) => f.latitude !== null && f.longitude !== null)
    .map((f) => ({
      type: "Feature" as const,
      properties: {
        id: f.id,
        name: f.name,
        country: f.country,
        city: f.city,
        address: f.address,
        postal_code: f.postal_code,
        charger_count: f.charger_count,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [f.longitude!, f.latitude!],
      },
    }));

  return {
    type: "FeatureCollection",
    features,
  };
}

/**
 * Get country color for cluster/marker styling
 */
export function getCountryColor(country: string): string {
  switch (country) {
    case "Norway":
      return "#3B82F6"; // blue-500
    case "Sweden":
      return "#EAB308"; // yellow-500
    case "Denmark":
      return "#EF4444"; // red-500
    default:
      return "#6366F1"; // indigo-500
  }
}
