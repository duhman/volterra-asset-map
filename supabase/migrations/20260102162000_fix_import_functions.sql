-- Fix column reference ambiguity in import functions
-- Drop and recreate import_facilities with proper column aliases
DROP FUNCTION IF EXISTS public.import_facilities (JSONB);

CREATE OR REPLACE FUNCTION public.import_facilities (p_facilities JSONB) RETURNS TABLE (id UUID, name TEXT) AS $$
BEGIN
  RETURN QUERY
  INSERT INTO asset_map.facilities (
    name,
    country,
    charger_count,
    geocode_status
  )
  SELECT
    (f->>'name')::TEXT AS facility_name,
    (f->>'country')::TEXT AS facility_country,
    COALESCE((f->>'charger_count')::INTEGER, 0) AS facility_charger_count,
    COALESCE(f->>'geocode_status', 'pending')::TEXT AS facility_geocode_status
  FROM jsonb_array_elements(p_facilities) AS f
  ON CONFLICT (name) DO UPDATE SET
    country = EXCLUDED.country,
    charger_count = EXCLUDED.charger_count,
    updated_at = NOW()
  RETURNING asset_map.facilities.id, asset_map.facilities.name;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and recreate import_chargers with proper column aliases
DROP FUNCTION IF EXISTS public.import_chargers (JSONB);

CREATE OR REPLACE FUNCTION public.import_chargers (p_chargers JSONB) RETURNS INTEGER AS $$
DECLARE
  inserted_count INTEGER;
BEGIN
  INSERT INTO asset_map.chargers (
    serial_number,
    facility_id,
    country,
    charger_type,
    vendor,
    model,
    status,
    subscription_type,
    ownership,
    installed_date
  )
  SELECT
    (c->>'serial_number')::TEXT,
    (c->>'facility_id')::UUID,
    (c->>'country')::TEXT,
    (c->>'charger_type')::TEXT,
    (c->>'vendor')::TEXT,
    (c->>'model')::TEXT,
    (c->>'status')::TEXT,
    (c->>'subscription_type')::TEXT,
    (c->>'ownership')::TEXT,
    (c->>'installed_date')::DATE
  FROM jsonb_array_elements(p_chargers) AS c
  ON CONFLICT (serial_number) DO UPDATE SET
    facility_id = EXCLUDED.facility_id,
    country = EXCLUDED.country,
    charger_type = EXCLUDED.charger_type,
    vendor = EXCLUDED.vendor,
    model = EXCLUDED.model,
    status = EXCLUDED.status,
    subscription_type = EXCLUDED.subscription_type,
    ownership = EXCLUDED.ownership,
    installed_date = EXCLUDED.installed_date,
    updated_at = NOW();

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT
EXECUTE ON FUNCTION public.import_facilities (JSONB) TO service_role;

GRANT
EXECUTE ON FUNCTION public.import_chargers (JSONB) TO service_role;
