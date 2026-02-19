export type Database = {
  asset_map: {
    Tables: {
      facilities: {
        Row: {
          id: string;
          hubspot_id: string | null;
          name: string;
          address: string | null;
          city: string | null;
          postal_code: string | null;
          country: string;
          latitude: number | null;
          longitude: number | null;
          geocode_status: "pending" | "success" | "failed" | "manual";
          geocode_confidence: number | null;
          charger_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          hubspot_id?: string | null;
          name: string;
          address?: string | null;
          city?: string | null;
          postal_code?: string | null;
          country: string;
          latitude?: number | null;
          longitude?: number | null;
          geocode_status?: "pending" | "success" | "failed" | "manual";
          geocode_confidence?: number | null;
          charger_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          hubspot_id?: string | null;
          name?: string;
          address?: string | null;
          city?: string | null;
          postal_code?: string | null;
          country?: string;
          latitude?: number | null;
          longitude?: number | null;
          geocode_status?: "pending" | "success" | "failed" | "manual";
          geocode_confidence?: number | null;
          charger_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      chargers: {
        Row: {
          id: string;
          serial_number: string;
          facility_id: string | null;
          country: string;
          charger_type: "Private" | "Shared" | null;
          vendor: string | null;
          model: string | null;
          status: "Enabled" | "Disabled" | "Out of order" | null;
          subscription_type: string | null;
          ownership: "Driver" | "Housing Association" | "Volterra" | null;
          installed_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          serial_number: string;
          facility_id?: string | null;
          country: string;
          charger_type?: "Private" | "Shared" | null;
          vendor?: string | null;
          model?: string | null;
          status?: "Enabled" | "Disabled" | "Out of order" | null;
          subscription_type?: string | null;
          ownership?: "Driver" | "Housing Association" | "Volterra" | null;
          installed_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          serial_number?: string;
          facility_id?: string | null;
          country?: string;
          charger_type?: "Private" | "Shared" | null;
          vendor?: string | null;
          model?: string | null;
          status?: "Enabled" | "Disabled" | "Out of order" | null;
          subscription_type?: string | null;
          ownership?: "Driver" | "Housing Association" | "Volterra" | null;
          installed_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      geocode_cache: {
        Row: {
          id: string;
          address_hash: string;
          original_address: string;
          latitude: number | null;
          longitude: number | null;
          provider: string | null;
          confidence: number | null;
          raw_response: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          address_hash: string;
          original_address: string;
          latitude?: number | null;
          longitude?: number | null;
          provider?: string | null;
          confidence?: number | null;
          raw_response?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          address_hash?: string;
          original_address?: string;
          latitude?: number | null;
          longitude?: number | null;
          provider?: string | null;
          confidence?: number | null;
          raw_response?: Record<string, unknown> | null;
          created_at?: string;
        };
      };
    };
  };
};

// Convenience types
export type Facility = Database["asset_map"]["Tables"]["facilities"]["Row"];
export type FacilityInsert =
  Database["asset_map"]["Tables"]["facilities"]["Insert"];
export type Charger = Database["asset_map"]["Tables"]["chargers"]["Row"];
export type ChargerInsert =
  Database["asset_map"]["Tables"]["chargers"]["Insert"];

// GeoJSON types for map
export interface FacilityGeoJSON {
  type: "FeatureCollection";
  features: FacilityFeature[];
}

export interface FacilityFeature {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number]; // [lng, lat]
  };
  properties: {
    id: string;
    name: string;
    country: string;
    charger_count: number;
    enabled_count: number;
    disabled_count: number;
    address?: string;
    city?: string;
  };
}

// Filter types
export interface MapFilters {
  countries: string[];
  statuses: string[];
  vendors: string[];
  chargerTypes: string[];
  ownerships: string[];
  searchQuery: string;
}
