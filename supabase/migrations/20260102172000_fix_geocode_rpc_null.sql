-- Migration: fix_geocode_rpc_null
-- Fix the geocode update function to handle NULL coordinates for failures

CREATE OR REPLACE FUNCTION public.asset_map_update_facility_geocode(
  p_facility_id UUID,
  p_latitude DECIMAL(10, 8) DEFAULT NULL,
  p_longitude DECIMAL(11, 8) DEFAULT NULL,
  p_geocode_status TEXT DEFAULT 'success',
  p_geocode_confidence DECIMAL(3, 2) DEFAULT NULL
) RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'asset_map', 'public' AS $$
BEGIN
  UPDATE asset_map.facilities
  SET
    latitude = COALESCE(p_latitude, latitude),
    longitude = COALESCE(p_longitude, longitude),
    geocode_status = p_geocode_status,
    geocode_confidence = p_geocode_confidence,
    updated_at = NOW()
  WHERE id = p_facility_id;
END;
$$;
