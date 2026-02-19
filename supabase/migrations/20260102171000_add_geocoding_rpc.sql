-- Migration: add_geocoding_rpc
-- RPC functions for geocoding status and batch geocoding

-- Function to get geocoding statistics
CREATE OR REPLACE FUNCTION public.asset_map_get_geocode_stats()
RETURNS TABLE (
  total_facilities BIGINT,
  geocoded BIGINT,
  needs_geocoding BIGINT,
  no_address BIGINT,
  norway_needs BIGINT,
  sweden_needs BIGINT,
  denmark_needs BIGINT
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'asset_map', 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_facilities,
    COUNT(*) FILTER (WHERE f.latitude IS NOT NULL)::BIGINT as geocoded,
    COUNT(*) FILTER (WHERE f.address IS NOT NULL AND f.latitude IS NULL)::BIGINT as needs_geocoding,
    COUNT(*) FILTER (WHERE f.address IS NULL)::BIGINT as no_address,
    COUNT(*) FILTER (WHERE f.address IS NOT NULL AND f.latitude IS NULL AND f.country = 'Norway')::BIGINT as norway_needs,
    COUNT(*) FILTER (WHERE f.address IS NOT NULL AND f.latitude IS NULL AND f.country = 'Sweden')::BIGINT as sweden_needs,
    COUNT(*) FILTER (WHERE f.address IS NOT NULL AND f.latitude IS NULL AND f.country = 'Denmark')::BIGINT as denmark_needs
  FROM asset_map.facilities f;
END;
$$;

-- Function to get facilities needing geocoding
CREATE OR REPLACE FUNCTION public.asset_map_get_facilities_for_geocoding(
  p_country TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT
) LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'asset_map', 'public' AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.address,
    f.city,
    f.postal_code,
    f.country
  FROM asset_map.facilities f
  WHERE f.address IS NOT NULL
    AND f.latitude IS NULL
    AND (p_country IS NULL OR f.country = p_country)
  ORDER BY f.country, f.name
  LIMIT p_limit;
END;
$$;

-- Function to update facility with geocoding results
CREATE OR REPLACE FUNCTION public.asset_map_update_facility_geocode(
  p_facility_id UUID,
  p_latitude DECIMAL(10, 8),
  p_longitude DECIMAL(11, 8),
  p_geocode_status TEXT DEFAULT 'success',
  p_geocode_confidence DECIMAL(3, 2) DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'asset_map', 'public' AS $$
BEGIN
  UPDATE asset_map.facilities
  SET
    latitude = p_latitude,
    longitude = p_longitude,
    geocode_status = p_geocode_status,
    geocode_confidence = p_geocode_confidence,
    updated_at = NOW()
  WHERE id = p_facility_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.asset_map_get_geocode_stats TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asset_map_get_facilities_for_geocoding TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.asset_map_update_facility_geocode TO service_role;
