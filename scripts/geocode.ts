/**
 * Batch geocoding script for facilities
 *
 * Uses:
 * - Kartverket API for Norway (free, authoritative)
 * - HERE API for Sweden/Denmark (30K free/month)
 */
import "dotenv/config";

const SUPABASE_URL =
  process.env.SUPABASE_CLOUD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_CLOUD_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const HERE_API_KEY = process.env.HERE_API_KEY;

// Rate limiting
const KARTVERKET_DELAY = 200; // 5 req/s to be polite
const HERE_DELAY = 250; // 4 req/s (under 5 req/s limit)

interface FacilityToGeocode {
  id: string;
  name: string;
  address: string;
  city: string;
  postal_code: string;
  country: string;
}

interface GeocodeResult {
  latitude: number;
  longitude: number;
  confidence: number;
  provider: string;
}

interface KartverketResult {
  adresser: Array<{
    representasjonspunkt: {
      lat: number;
      lon: number;
    };
    adressetekst: string;
    postnummer: string;
    poststed: string;
  }>;
}

interface HereResult {
  items: Array<{
    position: {
      lat: number;
      lng: number;
    };
    scoring: {
      queryScore: number;
    };
    address: {
      label: string;
    };
  }>;
}

// Sleep helper
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// RPC helper
async function rpc<T>(
  fn: string,
  params: Record<string, unknown> = {},
): Promise<T> {
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

  // 200 = success with data, 204 = success with no content (VOID functions)
  if (resp.status !== 200 && resp.status !== 204) {
    const text = await resp.text();
    throw new Error(`RPC ${fn} failed: ${resp.status} - ${text}`);
  }

  // 204 returns no body
  if (resp.status === 204) {
    return undefined as T;
  }

  return resp.json() as Promise<T>;
}

// Kartverket geocoder for Norway
async function geocodeKartverket(
  facility: FacilityToGeocode,
): Promise<GeocodeResult | null> {
  // Build search query: address + postal code
  const searchQuery = `${facility.address} ${facility.postal_code}`.trim();

  const url = new URL("https://ws.geonorge.no/adresser/v1/sok");
  url.searchParams.set("sok", searchQuery);
  url.searchParams.set("treffPerSide", "5");
  url.searchParams.set("utkoordsys", "4258"); // WGS84

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) {
      console.error(`   Kartverket error: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as KartverketResult;

    if (data.adresser && data.adresser.length > 0) {
      const best = data.adresser[0];
      // Calculate confidence based on postal code match
      const postalMatch = best.postnummer === facility.postal_code;
      const confidence = postalMatch ? 0.95 : 0.75;

      return {
        latitude: best.representasjonspunkt.lat,
        longitude: best.representasjonspunkt.lon,
        confidence,
        provider: "kartverket",
      };
    }

    // Fallback: try with just city name
    url.searchParams.set("sok", `${facility.address} ${facility.city}`);
    const resp2 = await fetch(url.toString());
    if (resp2.ok) {
      const data2 = (await resp2.json()) as KartverketResult;
      if (data2.adresser && data2.adresser.length > 0) {
        const best = data2.adresser[0];
        return {
          latitude: best.representasjonspunkt.lat,
          longitude: best.representasjonspunkt.lon,
          confidence: 0.6,
          provider: "kartverket",
        };
      }
    }

    return null;
  } catch (err) {
    console.error(`   Kartverket exception: ${err}`);
    return null;
  }
}

// HERE geocoder for Sweden/Denmark
async function geocodeHere(
  facility: FacilityToGeocode,
): Promise<GeocodeResult | null> {
  if (!HERE_API_KEY) {
    console.error("   HERE_API_KEY not set");
    return null;
  }

  // Build full address
  const addressParts = [
    facility.address,
    facility.postal_code,
    facility.city,
    facility.country,
  ].filter(Boolean);

  const url = new URL("https://geocode.search.hereapi.com/v1/geocode");
  url.searchParams.set("q", addressParts.join(", "));
  url.searchParams.set("apiKey", HERE_API_KEY);

  try {
    const resp = await fetch(url.toString());
    if (!resp.ok) {
      console.error(`   HERE error: ${resp.status}`);
      return null;
    }

    const data = (await resp.json()) as HereResult;

    if (data.items && data.items.length > 0) {
      const best = data.items[0];
      return {
        latitude: best.position.lat,
        longitude: best.position.lng,
        confidence: best.scoring?.queryScore || 0.7,
        provider: "here",
      };
    }

    return null;
  } catch (err) {
    console.error(`   HERE exception: ${err}`);
    return null;
  }
}

// Main geocoding function
async function geocodeFacility(
  facility: FacilityToGeocode,
): Promise<GeocodeResult | null> {
  if (facility.country === "Norway") {
    return geocodeKartverket(facility);
  } else {
    return geocodeHere(facility);
  }
}

// Update facility with geocode result
async function updateFacilityGeocode(
  facilityId: string,
  result: GeocodeResult,
): Promise<void> {
  await rpc("asset_map_update_facility_geocode", {
    p_facility_id: facilityId,
    p_latitude: result.latitude,
    p_longitude: result.longitude,
    p_geocode_status: "success",
    p_geocode_confidence: result.confidence,
  });
}

// Mark facility as failed
async function markFacilityFailed(facilityId: string): Promise<void> {
  await rpc("asset_map_update_facility_geocode", {
    p_facility_id: facilityId,
    p_latitude: null,
    p_longitude: null,
    p_geocode_status: "failed",
    p_geocode_confidence: null,
  });
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const countryFilter = args.find((a) => a.startsWith("--country="))?.split("=")[1];
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : 100;
  const dryRun = args.includes("--dry-run");

  console.log("🌍 Geocoding Pipeline");
  console.log("─".repeat(50));
  console.log(`   Country filter: ${countryFilter || "all"}`);
  console.log(`   Limit: ${limit}`);
  console.log(`   Dry run: ${dryRun}`);

  if (!HERE_API_KEY && (!countryFilter || countryFilter !== "Norway")) {
    console.warn("⚠️  HERE_API_KEY not set - Sweden/Denmark geocoding will fail");
  }

  // Fetch facilities needing geocoding
  const facilities = await rpc<FacilityToGeocode[]>(
    "asset_map_get_facilities_for_geocoding",
    {
      p_country: countryFilter || null,
      p_limit: limit,
    },
  );

  console.log(`\n📍 Found ${facilities.length} facilities to geocode\n`);

  if (facilities.length === 0) {
    console.log("✅ No facilities to geocode!");
    return;
  }

  let success = 0;
  let failed = 0;

  for (let i = 0; i < facilities.length; i++) {
    const facility = facilities[i];
    const progress = `[${i + 1}/${facilities.length}]`;

    process.stdout.write(
      `${progress} ${facility.name.slice(0, 40).padEnd(40)} ... `,
    );

    const result = await geocodeFacility(facility);

    if (result) {
      if (!dryRun) {
        await updateFacilityGeocode(facility.id, result);
      }
      console.log(
        `✅ ${result.latitude.toFixed(5)}, ${result.longitude.toFixed(5)} (${result.provider}, ${(result.confidence * 100).toFixed(0)}%)`,
      );
      success++;
    } else {
      if (!dryRun) {
        await markFacilityFailed(facility.id);
      }
      console.log("❌ No result");
      failed++;
    }

    // Rate limiting
    const delay = facility.country === "Norway" ? KARTVERKET_DELAY : HERE_DELAY;
    await sleep(delay);
  }

  console.log("\n" + "─".repeat(50));
  console.log("📊 Summary");
  console.log(`   Success: ${success} (${((success / facilities.length) * 100).toFixed(1)}%)`);
  console.log(`   Failed:  ${failed}`);
  console.log("✅ Geocoding complete!");
}

main().catch(console.error);
