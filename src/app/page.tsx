"use client";

import { useState, useCallback, useMemo } from "react";
import { AssetMap } from "@/components/asset-map/AssetMap";
import { MapSidebar } from "@/components/asset-map/MapSidebar";
import { useFacilities } from "@/lib/hooks/useFacilities";
import type { MapFilters, Facility } from "@/lib/supabase/types";
import { Loader2 } from "lucide-react";

const defaultFilters: MapFilters = {
  countries: [],
  statuses: [],
  vendors: [],
  chargerTypes: [],
  ownerships: [],
  searchQuery: "",
};

export default function AssetMapPage() {
  const [filters, setFilters] = useState<MapFilters>(defaultFilters);
  const [selectedFacility, setSelectedFacility] = useState<Facility | null>(
    null,
  );
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Fetch all facilities from Supabase (paginated automatically)
  const { facilities, loading, error } = useFacilities();

  // Filter facilities based on current filters
  const filteredFacilities = useMemo(() => {
    return facilities.filter((facility) => {
      // Country filter
      if (
        filters.countries.length > 0 &&
        !filters.countries.includes(facility.country)
      ) {
        return false;
      }

      // Search query - includes name, city, address, and postal code
      if (filters.searchQuery) {
        const query = filters.searchQuery.toLowerCase();
        const matchesName = facility.name.toLowerCase().includes(query);
        const matchesCity = facility.city?.toLowerCase().includes(query);
        const matchesAddress = facility.address?.toLowerCase().includes(query);
        const matchesPostalCode = facility.postal_code?.toLowerCase().includes(query);
        if (!matchesName && !matchesCity && !matchesAddress && !matchesPostalCode) {
          return false;
        }
      }

      return true;
    });
  }, [facilities, filters]);

  const handleFilterChange = useCallback((newFilters: Partial<MapFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  }, []);

  const handleFacilitySelect = useCallback((facility: Facility | null) => {
    setSelectedFacility(facility);
  }, []);

  const handleClearFilters = useCallback(() => {
    setFilters(defaultFilters);
  }, []);

  // Stats for sidebar
  const stats = useMemo(() => {
    const total = filteredFacilities.reduce(
      (sum, f) => sum + f.charger_count,
      0,
    );
    const byCountry = filteredFacilities.reduce(
      (acc, f) => {
        acc[f.country] = (acc[f.country] || 0) + f.charger_count;
        return acc;
      },
      {} as Record<string, number>,
    );
    // Facilities by country (count of facilities, not chargers)
    const facilitiesByCountry = filteredFacilities.reduce(
      (acc, f) => {
        acc[f.country] = (acc[f.country] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    // Geocoding stats
    const geocodedCount = filteredFacilities.filter(
      (f) => f.latitude !== null && f.longitude !== null,
    ).length;
    const pendingCount = filteredFacilities.length - geocodedCount;

    return {
      total,
      byCountry,
      facilitiesByCountry,
      facilityCount: filteredFacilities.length,
      geocodedCount,
      pendingCount,
    };
  }, [filteredFacilities]);

  return (
    <div className="h-screen w-screen relative overflow-hidden">
      {/* Map - full screen */}
      <div className="absolute inset-0">
        <AssetMap
          facilities={filteredFacilities}
          selectedFacility={selectedFacility}
          onFacilitySelect={handleFacilitySelect}
        />

        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Loading {facilities.length > 0 ? "more " : ""}facilities...
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="absolute top-4 right-4 bg-destructive/90 text-destructive-foreground px-4 py-2 rounded-lg shadow-lg z-50">
            <p className="text-sm font-medium">Failed to load facilities</p>
            <p className="text-xs opacity-80">{error}</p>
          </div>
        )}
      </div>

      {/* Sidebar - overlay on top of map */}
      <MapSidebar
        isOpen={isSidebarOpen}
        onToggle={() => setIsSidebarOpen(!isSidebarOpen)}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClearFilters={handleClearFilters}
        facilities={filteredFacilities}
        selectedFacility={selectedFacility}
        onFacilitySelect={handleFacilitySelect}
        stats={stats}
      />
    </div>
  );
}
