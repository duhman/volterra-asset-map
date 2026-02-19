-- RPC function to fetch facilities with optional filters
CREATE OR REPLACE FUNCTION public.get_facilities (
  p_countries TEXT[] DEFAULT NULL,
  p_search TEXT DEFAULT NULL,
  p_geocoded_only BOOLEAN DEFAULT FALSE,
  p_limit INTEGER DEFAULT 1000,
  p_offset INTEGER DEFAULT 0
) RETURNS TABLE (
  id UUID,
  hubspot_id TEXT,
  name TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  country TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  geocode_status TEXT,
  geocode_confidence DECIMAL(3, 2),
  charger_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.hubspot_id,
    f.name,
    f.address,
    f.city,
    f.postal_code,
    f.country,
    f.latitude,
    f.longitude,
    f.geocode_status,
    f.geocode_confidence,
    f.charger_count,
    f.created_at,
    f.updated_at
  FROM asset_map.facilities f
  WHERE
    -- Country filter
    (p_countries IS NULL OR f.country = ANY(p_countries))
    -- Search filter
    AND (p_search IS NULL OR f.name ILIKE '%' || p_search || '%')
    -- Geocoded only filter
    AND (NOT p_geocoded_only OR (f.latitude IS NOT NULL AND f.longitude IS NOT NULL))
  ORDER BY f.charger_count DESC, f.name
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- RPC function to get a single facility with its chargers
CREATE OR REPLACE FUNCTION public.get_facility_with_chargers (p_facility_id UUID) RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'facility', (
      SELECT row_to_json(f.*)
      FROM asset_map.facilities f
      WHERE f.id = p_facility_id
    ),
    'chargers', (
      SELECT COALESCE(jsonb_agg(row_to_json(c.*)), '[]'::JSONB)
      FROM asset_map.chargers c
      WHERE c.facility_id = p_facility_id
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execute permissions
GRANT
EXECUTE ON FUNCTION public.get_facilities (TEXT[], TEXT, BOOLEAN, INTEGER, INTEGER) TO anon,
authenticated,
service_role;

GRANT
EXECUTE ON FUNCTION public.get_facility_with_chargers (UUID) TO anon,
authenticated,
service_role;
