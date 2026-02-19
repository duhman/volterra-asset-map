"use client";

import { useMemo } from "react";
import { Map, MapControls } from "@/components/ui/map";
import { FacilityClusterLayer } from "./FacilityClusterLayer";
import type { Facility } from "@/lib/supabase/types";

// Nordic center - good default view showing Norway and Sweden
const NORDIC_CENTER: [number, number] = [12.0, 62.0];
const DEFAULT_ZOOM = 5;

type AssetMapProps = {
  facilities: Facility[];
  selectedFacility: Facility | null;
  onFacilitySelect: (facility: Facility | null) => void;
};

export function AssetMap({
  facilities,
  selectedFacility,
  onFacilitySelect,
}: AssetMapProps) {
  // Calculate center from facilities or use default
  const center = useMemo(() => {
    const validFacilities = facilities.filter((f) => f.latitude && f.longitude);
    if (validFacilities.length === 0) return NORDIC_CENTER;

    const avgLng =
      validFacilities.reduce((sum, f) => sum + f.longitude!, 0) /
      validFacilities.length;
    const avgLat =
      validFacilities.reduce((sum, f) => sum + f.latitude!, 0) /
      validFacilities.length;

    return [avgLng, avgLat] as [number, number];
  }, [facilities]);

  return (
    <div className="w-full h-full">
      <Map center={center} zoom={DEFAULT_ZOOM}>
        <MapControls position="bottom-right" showZoom showFullscreen showLocate />
        <FacilityClusterLayer
          facilities={facilities}
          selectedFacility={selectedFacility}
          onFacilitySelect={onFacilitySelect}
        />
      </Map>
    </div>
  );
}
