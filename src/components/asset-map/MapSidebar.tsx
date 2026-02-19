"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  Zap,
  Building2,
  MapPin,
  Filter,
  BarChart3,
  ArrowUpDown,
  MapPinOff,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MapFilters, Facility } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type SortOption = "name" | "chargers-desc" | "chargers-asc" | "city";
type GeoFilter = "all" | "geocoded" | "not-geocoded";

type MapSidebarProps = {
  isOpen: boolean;
  onToggle: () => void;
  filters: MapFilters;
  onFilterChange: (filters: Partial<MapFilters>) => void;
  onClearFilters: () => void;
  facilities: Facility[];
  selectedFacility: Facility | null;
  onFacilitySelect: (facility: Facility | null) => void;
  stats: {
    total: number;
    byCountry: Record<string, number>;
    facilitiesByCountry: Record<string, number>;
    facilityCount: number;
    geocodedCount: number;
    pendingCount: number;
  };
};

const COUNTRIES = ["Norway", "Sweden", "Denmark"];

const COUNTRY_FLAGS: Record<string, string> = {
  Norway: "🇳🇴",
  Sweden: "🇸🇪",
  Denmark: "🇩🇰",
};

function CountryFilter({
  selected,
  onChange,
}: {
  selected: string[];
  onChange: (countries: string[]) => void;
}) {
  const toggleCountry = (country: string) => {
    if (selected.includes(country)) {
      onChange(selected.filter((c) => c !== country));
    } else {
      onChange([...selected, country]);
    }
  };

  return (
    <div className="space-y-2">
      <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Countries
      </Label>
      <div className="flex flex-wrap gap-2">
        {COUNTRIES.map((country) => (
          <button
            key={country}
            onClick={() => toggleCountry(country)}
            className={cn(
              "px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
              "border",
              selected.includes(country)
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-foreground border-border hover:bg-muted",
            )}
          >
            {COUNTRY_FLAGS[country]} {country}
          </button>
        ))}
      </div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: MapSidebarProps["stats"] }) {
  const geocodePercent = stats.facilityCount > 0
    ? Math.round((stats.geocodedCount / stats.facilityCount) * 100)
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-muted-foreground">
        <BarChart3 className="w-4 h-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          Statistics
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold">
            {stats.total.toLocaleString()}
          </div>
          <div className="text-xs text-muted-foreground">Total Chargers</div>
        </div>
        <div className="p-3 bg-muted/50 rounded-lg">
          <div className="text-2xl font-bold">{stats.facilityCount}</div>
          <div className="text-xs text-muted-foreground">Facilities</div>
        </div>
      </div>

      {/* Geocoding Progress */}
      <div className="p-3 bg-muted/50 rounded-lg space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Geocoded</span>
          <span className="font-medium">
            {stats.geocodedCount} / {stats.facilityCount}
            <span className="text-muted-foreground ml-1">({geocodePercent}%)</span>
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 transition-all duration-300"
            style={{ width: `${geocodePercent}%` }}
          />
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1 text-green-600">
            <CheckCircle2 className="w-3 h-3" />
            <span>{stats.geocodedCount} on map</span>
          </div>
          <div className="flex items-center gap-1 text-amber-600">
            <AlertCircle className="w-3 h-3" />
            <span>{stats.pendingCount} pending</span>
          </div>
        </div>
      </div>

      {/* Country Breakdown with Visual Bars */}
      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Chargers by Country
        </Label>
        {Object.entries(stats.byCountry)
          .sort(([, a], [, b]) => b - a)
          .map(([country, count]) => {
            const percent = stats.total > 0 ? (count / stats.total) * 100 : 0;
            const facilitiesInCountry = stats.facilitiesByCountry[country] || 0;
            const countryColors: Record<string, string> = {
              Norway: "bg-blue-500",
              Sweden: "bg-yellow-500",
              Denmark: "bg-red-500",
            };
            return (
              <div key={country} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-1.5">
                    <span>{COUNTRY_FLAGS[country]}</span>
                    <span>{country}</span>
                  </span>
                  <div className="text-right">
                    <span className="font-medium tabular-nums">
                      {count.toLocaleString()}
                      <span className="text-muted-foreground ml-1 text-xs">
                        ({percent.toFixed(1)}%)
                      </span>
                    </span>
                    <div className="text-xs text-muted-foreground">
                      {facilitiesInCountry} facilities
                    </div>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full transition-all duration-500",
                      countryColors[country] || "bg-indigo-500",
                    )}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function FacilityList({
  facilities,
  selectedFacility,
  onFacilitySelect,
}: {
  facilities: Facility[];
  selectedFacility: Facility | null;
  onFacilitySelect: (facility: Facility | null) => void;
}) {
  const [sortBy, setSortBy] = useState<SortOption>("chargers-desc");
  const [geoFilter, setGeoFilter] = useState<GeoFilter>("all");

  // Filter by geocode status
  const filteredFacilities = useMemo(() => {
    if (geoFilter === "all") return facilities;
    if (geoFilter === "geocoded") {
      return facilities.filter((f) => f.latitude !== null && f.longitude !== null);
    }
    return facilities.filter((f) => f.latitude === null || f.longitude === null);
  }, [facilities, geoFilter]);

  // Sort facilities
  const sortedFacilities = useMemo(() => {
    const sorted = [...filteredFacilities];
    switch (sortBy) {
      case "name":
        sorted.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "chargers-desc":
        sorted.sort((a, b) => b.charger_count - a.charger_count);
        break;
      case "chargers-asc":
        sorted.sort((a, b) => a.charger_count - b.charger_count);
        break;
      case "city":
        sorted.sort((a, b) => (a.city || "").localeCompare(b.city || ""));
        break;
    }
    return sorted;
  }, [filteredFacilities, sortBy]);

  const geocodedCount = facilities.filter((f) => f.latitude !== null).length;
  const notGeocodedCount = facilities.length - geocodedCount;

  return (
    <div className="space-y-3 w-full max-w-full">
      {/* Sort and Filter Controls */}
      <div className="grid grid-cols-2 gap-2 w-full">
        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
          <SelectTrigger className="h-8 text-xs">
            <ArrowUpDown className="w-3 h-3 mr-1 shrink-0" />
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="chargers-desc">Most Chargers</SelectItem>
            <SelectItem value="chargers-asc">Least Chargers</SelectItem>
            <SelectItem value="name">Name (A-Z)</SelectItem>
            <SelectItem value="city">City</SelectItem>
          </SelectContent>
        </Select>

        <Select value={geoFilter} onValueChange={(v) => setGeoFilter(v as GeoFilter)}>
          <SelectTrigger className="h-8 text-xs">
            <MapPin className="w-3 h-3 mr-1 shrink-0" />
            <SelectValue placeholder="Location" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All ({facilities.length})</SelectItem>
            <SelectItem value="geocoded">
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                On Map ({geocodedCount})
              </span>
            </SelectItem>
            <SelectItem value="not-geocoded">
              <span className="flex items-center gap-1">
                <MapPinOff className="w-3 h-3 text-amber-500" />
                Missing ({notGeocodedCount})
              </span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filteredFacilities.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <Building2 className="w-12 h-12 text-muted-foreground/50 mb-3" />
          <p className="text-sm text-muted-foreground">No facilities found</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Try adjusting your filters
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {sortedFacilities.slice(0, 50).map((facility) => {
            const hasLocation = facility.latitude !== null && facility.longitude !== null;
            return (
              <button
                key={facility.id}
                onClick={() => onFacilitySelect(facility)}
                className={cn(
                  "w-full p-3 rounded-lg text-left transition-colors",
                  "hover:bg-muted/80",
                  selectedFacility?.id === facility.id
                    ? "bg-primary/10 border border-primary/20"
                    : "bg-muted/30",
                  !hasLocation && "opacity-60",
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium text-sm truncate">
                        {facility.name}
                      </span>
                      {!hasLocation && (
                        <span title="No location data">
                          <MapPinOff className="w-3 h-3 text-amber-500 shrink-0" />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      <span className="truncate">
                        {facility.city || "Unknown city"}, {facility.country}
                      </span>
                    </div>
                    {facility.postal_code && (
                      <div className="text-xs text-muted-foreground/70 mt-0.5">
                        {facility.postal_code}
                      </div>
                    )}
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    <Zap className="w-3 h-3 mr-1" />
                    {facility.charger_count}
                  </Badge>
                </div>
              </button>
            );
          })}

          {sortedFacilities.length > 50 && (
            <div className="text-center py-2 text-xs text-muted-foreground">
              Showing 50 of {sortedFacilities.length} facilities
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MapSidebar({
  isOpen,
  onToggle,
  filters,
  onFilterChange,
  onClearFilters,
  facilities,
  selectedFacility,
  onFacilitySelect,
  stats,
}: MapSidebarProps) {
  const [activeTab, setActiveTab] = useState<"filters" | "list">("filters");

  const hasActiveFilters =
    filters.countries.length > 0 ||
    filters.statuses.length > 0 ||
    filters.vendors.length > 0 ||
    filters.searchQuery;

  return (
    <>
      {/* Toggle button when sidebar is closed */}
      <AnimatePresence>
        {!isOpen && (
          <motion.button
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            onClick={onToggle}
            className="absolute left-4 top-4 z-20 p-2 bg-background border rounded-lg shadow-lg hover:bg-muted transition-colors"
          >
            <ChevronRight className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            initial={{ x: -360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -360, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="absolute left-0 top-0 h-full w-[360px] bg-background border-r flex flex-col overflow-hidden z-20 shadow-xl"
          >
            {/* Header */}
            <div className="p-4 border-b shrink-0">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <h1 className="font-semibold text-sm">Asset Register</h1>
                    <p className="text-xs text-muted-foreground">
                      {stats.total.toLocaleString()} chargers
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={onToggle}>
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search facilities..."
                  value={filters.searchQuery}
                  onChange={(e) =>
                    onFilterChange({ searchQuery: e.target.value })
                  }
                  className="pl-9 pr-9"
                />
                {filters.searchQuery && (
                  <button
                    onClick={() => onFilterChange({ searchQuery: "" })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex border-b shrink-0">
              <button
                onClick={() => setActiveTab("filters")}
                className={cn(
                  "flex-1 py-2 px-4 text-sm font-medium transition-colors",
                  activeTab === "filters"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Filter className="w-4 h-4 inline mr-2" />
                Filters
                {hasActiveFilters && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-primary inline-block" />
                )}
              </button>
              <button
                onClick={() => setActiveTab("list")}
                className={cn(
                  "flex-1 py-2 px-4 text-sm font-medium transition-colors",
                  activeTab === "list"
                    ? "text-primary border-b-2 border-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Building2 className="w-4 h-4 inline mr-2" />
                Facilities
                <Badge variant="secondary" className="ml-2">
                  {facilities.length}
                </Badge>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
              <div className="p-4 space-y-6">
                {activeTab === "filters" ? (
                  <>
                    <CountryFilter
                      selected={filters.countries}
                      onChange={(countries) => onFilterChange({ countries })}
                    />

                    <Separator />

                    <StatsPanel stats={stats} />

                    {hasActiveFilters && (
                      <>
                        <Separator />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onClearFilters}
                          className="w-full"
                        >
                          <X className="w-4 h-4 mr-2" />
                          Clear all filters
                        </Button>
                      </>
                    )}
                  </>
                ) : (
                  <FacilityList
                    facilities={facilities}
                    selectedFacility={selectedFacility}
                    onFacilitySelect={onFacilitySelect}
                  />
                )}
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>
    </>
  );
}
