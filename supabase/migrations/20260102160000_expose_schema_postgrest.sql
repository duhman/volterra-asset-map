-- Expose asset_map schema to PostgREST
-- This allows the supabase-js client to access tables in the asset_map schema
-- Notify PostgREST to reload config
NOTIFY pgrst,
'reload config';

-- Grant usage on schema to roles
GRANT USAGE ON SCHEMA asset_map TO anon,
authenticated,
service_role;

-- Grant access to tables
GRANT
SELECT
,
  INSERT,
UPDATE,
DELETE ON ALL TABLES IN SCHEMA asset_map TO anon,
authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA asset_map TO service_role;

-- Grant access to sequences
GRANT USAGE,
SELECT
  ON ALL SEQUENCES IN SCHEMA asset_map TO anon,
  authenticated,
  service_role;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA asset_map
GRANT
SELECT
,
  INSERT,
UPDATE,
DELETE ON TABLES TO anon,
authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA asset_map
GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA asset_map
GRANT USAGE,
SELECT
  ON SEQUENCES TO anon,
  authenticated,
  service_role;
