import "dotenv/config";

const SUPABASE_URL =
  process.env.SUPABASE_CLOUD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_CLOUD_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

interface FacilityRow {
  country: string;
  latitude: number | null;
}

async function rpc<T>(fn: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = `${SUPABASE_URL}/rest/v1/rpc/${fn}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!resp.ok) {
    throw new Error(`RPC ${fn} failed: ${resp.status} - ${await resp.text()}`);
  }

  return resp.json();
}

async function fetchAllFacilities(): Promise<FacilityRow[]> {
  // Use the get_facilities RPC function with pagination to fetch all facilities
  const allFacilities: FacilityRow[] = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const batch = await rpc<FacilityRow[]>("get_facilities", {
      p_limit: pageSize,
      p_offset: offset,
    });

    allFacilities.push(...batch);

    if (batch.length < pageSize) {
      break; // No more data
    }
    offset += pageSize;
  }

  return allFacilities;
}

async function stats() {
  const data = await fetchAllFacilities();

  const total = data.length;
  const geocoded = data.filter((f) => f.latitude !== null).length;

  const byCountry: Record<string, { total: number; geocoded: number }> = {};
  for (const f of data) {
    if (!byCountry[f.country]) byCountry[f.country] = { total: 0, geocoded: 0 };
    byCountry[f.country].total++;
    if (f.latitude !== null) byCountry[f.country].geocoded++;
  }

  console.log("\n📊 Final Geocoding Report");
  console.log("─".repeat(50));
  console.log(`Total facilities:     ${total}`);
  console.log(
    `Geocoded (on map):    ${geocoded} (${((geocoded / total) * 100).toFixed(1)}%)`
  );
  console.log(`Missing coordinates:  ${total - geocoded}`);
  console.log("\n📍 By Country:");
  for (const [country, s] of Object.entries(byCountry).sort(
    (a, b) => b[1].total - a[1].total
  )) {
    const pct = ((s.geocoded / s.total) * 100).toFixed(1);
    console.log(`   ${country.padEnd(10)} ${s.geocoded}/${s.total} (${pct}%)`);
  }
}

stats();
