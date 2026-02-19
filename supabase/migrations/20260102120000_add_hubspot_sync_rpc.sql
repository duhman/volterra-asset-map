-- Migration: add_hubspot_sync_rpc
-- RPC functions for HubSpot address sync
-- Function to get facilities without addresses
CREATE OR REPLACE FUNCTION public.asset_map_get_facilities_for_sync (
  p_limit INTEGER DEFAULT 5000,
  p_country TEXT DEFAULT NULL
) RETURNS TABLE (
  id UUID,
  name TEXT,
  country TEXT,
  address TEXT,
  city TEXT,
  postal_code TEXT,
  hubspot_id TEXT
) LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path TO 'asset_map',
  'public' AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.country,
    f.address,
    f.city,
    f.postal_code,
    f.hubspot_id
  FROM asset_map.facilities f
  WHERE f.address IS NULL
    AND f.hubspot_id IS NULL
    AND (p_country IS NULL OR f.country = p_country)
  ORDER BY f.name
  LIMIT p_limit;
END;
$$;

-- Function to update facility with HubSpot data
CREATE OR REPLACE FUNCTION public.asset_map_update_facility_from_hubspot (
  p_facility_id UUID,
  p_hubspot_id TEXT,
  p_address TEXT,
  p_city TEXT,
  p_postal_code TEXT
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET
  search_path TO 'asset_map',
  'public' AS $$
BEGIN
  UPDATE asset_map.facilities
  SET
    hubspot_id = p_hubspot_id,
    address = p_address,
    city = p_city,
    postal_code = p_postal_code,
    updated_at = NOW()
  WHERE id = p_facility_id;
END;
$$;

-- Grant execute permissions
GRANT
EXECUTE ON FUNCTION public.asset_map_get_facilities_for_sync TO anon,
authenticated,
service_role;

GRANT
EXECUTE ON FUNCTION public.asset_map_update_facility_from_hubspot TO service_role;
