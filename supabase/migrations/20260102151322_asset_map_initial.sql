-- Asset Map Schema
-- Schema for the Volterra Asset Register Map application
-- Enable pg_trgm for fuzzy search (must be before index creation)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create dedicated schema for asset map data
CREATE SCHEMA IF NOT EXISTS asset_map;

-- Facilities table (housing associations)
CREATE TABLE asset_map.facilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hubspot_id TEXT UNIQUE,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geocode_status TEXT DEFAULT 'pending' CHECK (
    geocode_status IN ('pending', 'success', 'failed', 'manual')
  ),
  geocode_confidence DECIMAL(3, 2),
  charger_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chargers table
CREATE TABLE asset_map.chargers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  serial_number TEXT UNIQUE NOT NULL,
  facility_id UUID REFERENCES asset_map.facilities (id) ON DELETE SET NULL,
  country TEXT NOT NULL,
  charger_type TEXT CHECK (charger_type IN ('Private', 'Shared')),
  vendor TEXT,
  model TEXT,
  status TEXT CHECK (status IN ('Enabled', 'Disabled', 'Out of order')),
  subscription_type TEXT,
  ownership TEXT CHECK (
    ownership IN ('Driver', 'Housing Association', 'Volterra')
  ),
  installed_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Geocode cache (avoid duplicate API calls)
CREATE TABLE asset_map.geocode_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  address_hash TEXT UNIQUE NOT NULL,
  original_address TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  provider TEXT,
  confidence DECIMAL(3, 2),
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_facilities_country ON asset_map.facilities (country);

CREATE INDEX idx_facilities_coords ON asset_map.facilities (latitude, longitude)
WHERE
  latitude IS NOT NULL
  AND longitude IS NOT NULL;

CREATE INDEX idx_facilities_name ON asset_map.facilities USING gin (name extensions.gin_trgm_ops);

CREATE INDEX idx_chargers_facility ON asset_map.chargers (facility_id);

CREATE INDEX idx_chargers_status ON asset_map.chargers (status);

CREATE INDEX idx_chargers_vendor ON asset_map.chargers (vendor);

CREATE INDEX idx_chargers_country ON asset_map.chargers (country);

CREATE INDEX idx_geocode_cache_hash ON asset_map.geocode_cache (address_hash);

-- Updated at trigger function
CREATE OR REPLACE FUNCTION asset_map.set_updated_at () RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
CREATE TRIGGER set_facilities_updated_at BEFORE
UPDATE ON asset_map.facilities FOR EACH ROW
EXECUTE FUNCTION asset_map.set_updated_at ();

CREATE TRIGGER set_chargers_updated_at BEFORE
UPDATE ON asset_map.chargers FOR EACH ROW
EXECUTE FUNCTION asset_map.set_updated_at ();

-- RPC function to get facilities as GeoJSON for the map
CREATE OR REPLACE FUNCTION asset_map.get_facilities_geojson (
  p_countries TEXT[] DEFAULT NULL,
  p_search_query TEXT DEFAULT NULL
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = 'asset_map',
  'public' AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'type', 'FeatureCollection',
    'features', COALESCE(jsonb_agg(
      jsonb_build_object(
        'type', 'Feature',
        'geometry', jsonb_build_object(
          'type', 'Point',
          'coordinates', jsonb_build_array(longitude, latitude)
        ),
        'properties', jsonb_build_object(
          'id', id,
          'name', name,
          'country', country,
          'city', city,
          'address', address,
          'charger_count', charger_count
        )
      )
    ), '[]'::jsonb)
  )
  INTO result
  FROM asset_map.facilities
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND (p_countries IS NULL OR country = ANY(p_countries))
    AND (p_search_query IS NULL OR
         name ILIKE '%' || p_search_query || '%' OR
         city ILIKE '%' || p_search_query || '%' OR
         address ILIKE '%' || p_search_query || '%');

  RETURN result;
END;
$$;

-- RPC function to get facility stats
CREATE OR REPLACE FUNCTION asset_map.get_facility_stats () RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = 'asset_map',
  'public' AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_chargers', COALESCE(SUM(charger_count), 0),
    'facility_count', COUNT(*),
    'by_country', jsonb_object_agg(country, country_total)
  )
  INTO result
  FROM (
    SELECT country, SUM(charger_count) as country_total
    FROM asset_map.facilities
    GROUP BY country
  ) country_stats;

  RETURN result;
END;
$$;

-- RPC function to update facility charger count from chargers table
CREATE OR REPLACE FUNCTION asset_map.update_facility_charger_counts () RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path = 'asset_map',
  'public' AS $$
BEGIN
  UPDATE asset_map.facilities f
  SET charger_count = (
    SELECT COUNT(*)
    FROM asset_map.chargers c
    WHERE c.facility_id = f.id
  );
END;
$$;

-- Grant access (adjust based on your RLS needs)
-- For internal tool, we'll use service role key, so minimal RLS
COMMENT ON SCHEMA asset_map IS 'Asset Register Map - EV charger visualization';

COMMENT ON TABLE asset_map.facilities IS 'Housing associations with aggregated charger counts';

COMMENT ON TABLE asset_map.chargers IS 'Individual EV chargers with status and metadata';

COMMENT ON TABLE asset_map.geocode_cache IS 'Cached geocoding results to avoid duplicate API calls';
