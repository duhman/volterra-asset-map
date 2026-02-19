-- Fix column reference ambiguity - use different return column names
DROP FUNCTION IF EXISTS public.import_facilities (JSONB);

CREATE OR REPLACE FUNCTION public.import_facilities (p_facilities JSONB) RETURNS TABLE (facility_id UUID, facility_name TEXT) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO asset_map.facilities (
    name,
    country,
    charger_count,
    geocode_status
  )
  SELECT
    (f->>'name')::TEXT,
    (f->>'country')::TEXT,
    COALESCE((f->>'charger_count')::INTEGER, 0),
    COALESCE(f->>'geocode_status', 'pending')::TEXT
  FROM jsonb_array_elements(p_facilities) AS f
  ON CONFLICT (name) DO UPDATE SET
    country = EXCLUDED.country,
    charger_count = EXCLUDED.charger_count,
    updated_at = NOW()
  RETURNING asset_map.facilities.id, asset_map.facilities.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT
EXECUTE ON FUNCTION public.import_facilities (JSONB) TO service_role;
