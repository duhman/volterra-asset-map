-- Public wrapper for get_facility_stats
CREATE OR REPLACE FUNCTION public.get_facility_stats () RETURNS JSONB AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'total_chargers', (SELECT COUNT(*) FROM asset_map.chargers),
    'facility_count', (SELECT COUNT(*) FROM asset_map.facilities),
    'by_country', (
      SELECT jsonb_object_agg(country, cnt)
      FROM (
        SELECT country, COUNT(*) as cnt
        FROM asset_map.chargers
        GROUP BY country
        ORDER BY cnt DESC
      ) sub
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT
EXECUTE ON FUNCTION public.get_facility_stats () TO anon,
authenticated,
service_role;
