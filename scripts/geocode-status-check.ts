/**
 * Check geocoding status using RPC functions
 */
import "dotenv/config";

const SUPABASE_URL =
  process.env.SUPABASE_CLOUD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_CLOUD_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

interface GeocodeStats {
  total_facilities: number;
  geocoded: number;
  needs_geocoding: number;
  no_address: number;
  norway_needs: number;
  sweden_needs: number;
  denmark_needs: number;
}

interface FacilityToGeocode {
  id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
}

async function rpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY as string,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (resp.status !== 200) {
    const text = await resp.text();
    throw new Error(`RPC ${fn} failed: ${resp.status} - ${text}`);
  }

  return resp.json() as Promise<T>;
}

async function main() {
  console.log("📊 Facility Geocoding Status");
  console.log("─".repeat(50));

  // Get stats
  const stats = await rpc<GeocodeStats[]>("asset_map_get_geocode_stats");
  const s = stats[0];

  console.log(`Total facilities:        ${s.total_facilities}`);
  console.log(`Already geocoded:        ${s.geocoded} (${((s.geocoded / s.total_facilities) * 100).toFixed(1)}%)`);
  console.log(`Need geocoding:          ${s.needs_geocoding}`);
  console.log(`No address (skip):       ${s.no_address}`);

  console.log("\n📍 Need Geocoding by Country:");
  console.log(`   Norway:   ${s.norway_needs}`);
  console.log(`   Sweden:   ${s.sweden_needs}`);
  console.log(`   Denmark:  ${s.denmark_needs}`);

  // Get samples
  console.log("\n📝 Sample Facilities Needing Geocoding:");
  const samples = await rpc<FacilityToGeocode[]>("asset_map_get_facilities_for_geocoding", {
    p_limit: 5,
  });

  for (const f of samples) {
    console.log(`   ${f.name}`);
    console.log(`      ${f.address}, ${f.postal_code} ${f.city}, ${f.country}`);
  }
}

main().catch(console.error);
