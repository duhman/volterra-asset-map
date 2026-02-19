"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type MapLibreGL from "maplibre-gl";
import { Building2, Zap, X } from "lucide-react";
import { useMap, MapPopup } from "@/components/ui/map";
import type { Facility } from "@/lib/supabase/types";
import {
  facilitiesToGeoJSON,
  getCountryColor,
  type FacilityProperties,
} from "@/lib/utils/geojson";
import { cn } from "@/lib/utils";

const SOURCE_ID = "facilities-source";
const CLUSTER_LAYER_ID = "facility-clusters";
const CLUSTER_COUNT_LAYER_ID = "facility-cluster-count";
const UNCLUSTERED_LAYER_ID = "facility-unclustered";

type FacilityClusterLayerProps = {
  facilities: Facility[];
  selectedFacility: Facility | null;
  onFacilitySelect: (facility: Facility | null) => void;
};

function FacilityPopupContent({ facility }: { facility: Facility }) {
  return (
    <div className="min-w-[200px] max-w-[280px] bg-card text-card-foreground rounded-xl p-4 shadow-lg">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div className="min-w-0">
          <h3 className="font-semibold text-sm leading-tight truncate">
            {facility.name}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {facility.city}, {facility.country}
          </p>
        </div>
      </div>

      {facility.address && (
        <p className="text-xs text-muted-foreground mb-3">
          {facility.address}
          {facility.postal_code && `, ${facility.postal_code}`}
        </p>
      )}

      <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
        <Zap className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium">
          {facility.charger_count} chargers
        </span>
      </div>
    </div>
  );
}

export function FacilityClusterLayer({
  facilities,
  selectedFacility,
  onFacilitySelect,
}: FacilityClusterLayerProps) {
  const { map, isLoaded } = useMap();
  const [popupFacility, setPopupFacility] = useState<Facility | null>(null);
  const sourceAdded = useRef(false);
  const hasFitBounds = useRef(false);

  // Add source and layers on mount
  useEffect(() => {
    if (!isLoaded || !map || sourceAdded.current) return;

    // Add GeoJSON source with clustering
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: facilitiesToGeoJSON(facilities),
      cluster: true,
      clusterMaxZoom: 14, // Max zoom to cluster points
      clusterRadius: 60, // Radius of each cluster (px)
      clusterProperties: {
        // Aggregate charger counts for clusters
        total_chargers: ["+", ["get", "charger_count"]],
        // Track country distribution
        norway_count: [
          "+",
          ["case", ["==", ["get", "country"], "Norway"], 1, 0],
        ],
        sweden_count: [
          "+",
          ["case", ["==", ["get", "country"], "Sweden"], 1, 0],
        ],
        denmark_count: [
          "+",
          ["case", ["==", ["get", "country"], "Denmark"], 1, 0],
        ],
      },
    });

    // Cluster circle layer
    map.addLayer({
      id: CLUSTER_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        // Color based on dominant country or mixed
        "circle-color": [
          "case",
          // If mostly Norway
          [">", ["get", "norway_count"], ["+", ["get", "sweden_count"], ["get", "denmark_count"]]],
          "#3B82F6", // blue
          // If mostly Sweden
          [">", ["get", "sweden_count"], ["+", ["get", "norway_count"], ["get", "denmark_count"]]],
          "#EAB308", // yellow
          // Mixed or Denmark
          "#6366F1", // indigo
        ],
        // Size based on point count
        "circle-radius": [
          "step",
          ["get", "point_count"],
          20, // base size
          10,
          25, // 10+ points
          50,
          30, // 50+ points
          100,
          35, // 100+ points
          300,
          40, // 300+ points
        ],
        "circle-stroke-width": 3,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    // Cluster count label
    map.addLayer({
      id: CLUSTER_COUNT_LAYER_ID,
      type: "symbol",
      source: SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": "{point_count_abbreviated}",
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
      },
      paint: {
        "text-color": "#ffffff",
      },
    });

    // Unclustered point layer
    map.addLayer({
      id: UNCLUSTERED_LAYER_ID,
      type: "circle",
      source: SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        // Color by country
        "circle-color": [
          "match",
          ["get", "country"],
          "Norway",
          "#3B82F6",
          "Sweden",
          "#EAB308",
          "Denmark",
          "#EF4444",
          "#6366F1", // default
        ],
        // Size by charger count
        "circle-radius": [
          "interpolate",
          ["linear"],
          ["get", "charger_count"],
          1,
          8,
          10,
          12,
          20,
          16,
          50,
          20,
        ],
        "circle-stroke-width": 2,
        "circle-stroke-color": "#ffffff",
        "circle-opacity": 0.9,
      },
    });

    sourceAdded.current = true;

    return () => {
      try {
        if (map.getLayer(CLUSTER_COUNT_LAYER_ID))
          map.removeLayer(CLUSTER_COUNT_LAYER_ID);
        if (map.getLayer(CLUSTER_LAYER_ID)) map.removeLayer(CLUSTER_LAYER_ID);
        if (map.getLayer(UNCLUSTERED_LAYER_ID))
          map.removeLayer(UNCLUSTERED_LAYER_ID);
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
        sourceAdded.current = false;
      } catch {
        // ignore cleanup errors
      }
    };
  }, [isLoaded, map]);

  // Update source data when facilities change
  useEffect(() => {
    if (!isLoaded || !map || !sourceAdded.current) return;

    const source = map.getSource(SOURCE_ID) as MapLibreGL.GeoJSONSource;
    if (source) {
      source.setData(facilitiesToGeoJSON(facilities));
    }
  }, [facilities, isLoaded, map]);

  // Handle cluster click - zoom in
  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleClusterClick = (
      e: MapLibreGL.MapMouseEvent & {
        features?: MapLibreGL.MapGeoJSONFeature[];
      }
    ) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [CLUSTER_LAYER_ID],
      });

      if (!features.length) return;

      const clusterId = features[0].properties?.cluster_id;
      const source = map.getSource(SOURCE_ID) as MapLibreGL.GeoJSONSource;

      // Use Promise-based API (MapLibre GL 3.x+)
      source.getClusterExpansionZoom(clusterId).then((zoom: number) => {
        const geometry = features[0].geometry;
        if (geometry.type === "Point") {
          map.easeTo({
            center: geometry.coordinates as [number, number],
            zoom: zoom ?? 14,
            duration: 500,
          });
        }
      }).catch(() => {
        // Ignore errors
      });
    };

    map.on("click", CLUSTER_LAYER_ID, handleClusterClick);

    return () => {
      map.off("click", CLUSTER_LAYER_ID, handleClusterClick);
    };
  }, [isLoaded, map]);

  // Handle unclustered point click - show popup
  useEffect(() => {
    if (!isLoaded || !map) return;

    const handlePointClick = (
      e: MapLibreGL.MapMouseEvent & {
        features?: MapLibreGL.MapGeoJSONFeature[];
      }
    ) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [UNCLUSTERED_LAYER_ID],
      });

      if (!features.length) return;

      const props = features[0].properties as FacilityProperties;
      const geometry = features[0].geometry;

      if (geometry.type === "Point") {
        // Find the full facility data
        const facility = facilities.find((f) => f.id === props.id);
        if (facility) {
          setPopupFacility(facility);
          onFacilitySelect(facility);
        }
      }
    };

    map.on("click", UNCLUSTERED_LAYER_ID, handlePointClick);

    return () => {
      map.off("click", UNCLUSTERED_LAYER_ID, handlePointClick);
    };
  }, [isLoaded, map, facilities, onFacilitySelect]);

  // Handle cursor styles
  useEffect(() => {
    if (!isLoaded || !map) return;

    const handleMouseEnterCluster = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeaveCluster = () => {
      map.getCanvas().style.cursor = "";
    };

    const handleMouseEnterPoint = () => {
      map.getCanvas().style.cursor = "pointer";
    };

    const handleMouseLeavePoint = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("mouseenter", CLUSTER_LAYER_ID, handleMouseEnterCluster);
    map.on("mouseleave", CLUSTER_LAYER_ID, handleMouseLeaveCluster);
    map.on("mouseenter", UNCLUSTERED_LAYER_ID, handleMouseEnterPoint);
    map.on("mouseleave", UNCLUSTERED_LAYER_ID, handleMouseLeavePoint);

    return () => {
      map.off("mouseenter", CLUSTER_LAYER_ID, handleMouseEnterCluster);
      map.off("mouseleave", CLUSTER_LAYER_ID, handleMouseLeaveCluster);
      map.off("mouseenter", UNCLUSTERED_LAYER_ID, handleMouseEnterPoint);
      map.off("mouseleave", UNCLUSTERED_LAYER_ID, handleMouseLeavePoint);
    };
  }, [isLoaded, map]);

  // Fly to selected facility
  useEffect(() => {
    if (!isLoaded || !map || !selectedFacility) return;
    if (selectedFacility.latitude && selectedFacility.longitude) {
      map.flyTo({
        center: [selectedFacility.longitude, selectedFacility.latitude],
        zoom: 14,
        duration: 1500,
      });
      setPopupFacility(selectedFacility);
    }
  }, [selectedFacility, map, isLoaded]);

  // Fit bounds to show all facilities on initial load only
  useEffect(() => {
    if (!isLoaded || !map || facilities.length === 0) return;
    if (hasFitBounds.current) return; // Only fit once

    const validFacilities = facilities.filter((f) => f.latitude && f.longitude);
    if (validFacilities.length === 0) return;

    // Calculate bounds
    const lngs = validFacilities.map((f) => f.longitude!);
    const lats = validFacilities.map((f) => f.latitude!);

    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lngs), Math.min(...lats)],
      [Math.max(...lngs), Math.max(...lats)],
    ];

    // Only fit if there are multiple points spread apart
    const lngSpread = Math.max(...lngs) - Math.min(...lngs);
    const latSpread = Math.max(...lats) - Math.min(...lats);

    if (lngSpread > 0.01 || latSpread > 0.01) {
      map.fitBounds(bounds, {
        padding: { top: 50, bottom: 50, left: 50, right: 50 },
        maxZoom: 12,
        duration: 1000,
      });
      hasFitBounds.current = true;
    }
  }, [facilities, map, isLoaded]);

  return (
    <>
      {popupFacility && popupFacility.latitude && popupFacility.longitude && (
        <MapPopup
          longitude={popupFacility.longitude}
          latitude={popupFacility.latitude}
          onClose={() => {
            setPopupFacility(null);
            onFacilitySelect(null);
          }}
          closeButton
        >
          <FacilityPopupContent facility={popupFacility} />
        </MapPopup>
      )}
    </>
  );
}
