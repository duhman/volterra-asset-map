/**
 * Check geocoding status of facilities
 */

import "dotenv/config";

const SUPABASE_URL =
  process.env.SUPABASE_CLOUD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_CLOUD_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

async function countFacilities(filter: string): Promise<number> {
  const url = `${SUPABASE_URL}/rest/v1/facilities?select=id${filter ? "&" + filter : ""}`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Accept-Profile": "asset_map",
      Prefer: "count=exact",
    },
  });

  const range = resp.headers.get("content-range");
  if (range) {
    const total = range.split("/")[1];
    return parseInt(total, 10);
  }
  return 0;
}

async function countByCountry(filter: string): Promise<Record<string, number>> {
  const url = `${SUPABASE_URL}/rest/v1/facilities?select=country${filter ? "&" + filter : ""}`;
  const resp = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Accept-Profile": "asset_map",
    },
  });

  const data = (await resp.json()) as { country: string }[];
  const counts: Record<string, number> = {};
  for (const row of data) {
    counts[row.country] = (counts[row.country] || 0) + 1;
  }
  return counts;
}

async function main() {
  console.log("📊 Facility Geocoding Status");
  console.log("─".repeat(50));

  const total = await countFacilities("");
  const geocoded = await countFacilities("latitude=not.is.null");
  const needsGeo = await countFacilities("address=not.is.null&latitude=is.null");
  const noAddress = await countFacilities("address=is.null");

  console.log(`Total facilities:        ${total}`);
  console.log(`Already geocoded:        ${geocoded}`);
  console.log(`Need geocoding:          ${needsGeo}`);
  console.log(`No address (skip):       ${noAddress}`);

  console.log("\n📍 Need Geocoding by Country:");
  const byCountry = await countByCountry("address=not.is.null&latitude=is.null");
  for (const [country, count] of Object.entries(byCountry).sort(
    (a, b) => b[1] - a[1]
  )) {
    console.log(`   ${country}: ${count}`);
  }

  // Sample facilities needing geocoding
  console.log("\n📝 Sample Facilities Needing Geocoding:");
  const sampleUrl = `${SUPABASE_URL}/rest/v1/facilities?select=name,address,city,country&address=not.is.null&latitude=is.null&limit=5`;
  const sampleResp = await fetch(sampleUrl, {
    headers: {
      apikey: SUPABASE_KEY!,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Accept-Profile": "asset_map",
    },
  });
  const samples = (await sampleResp.json()) as {
    name: string;
    address: string;
    city: string;
    country: string;
  }[];

  for (const s of samples) {
    console.log(`   ${s.name}`);
    console.log(`      ${s.address}, ${s.city}, ${s.country}`);
  }
}

main().catch(console.error);
