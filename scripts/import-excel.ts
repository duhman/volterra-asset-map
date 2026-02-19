/**
 * Import Excel data into Supabase
 *
 * Parses the Asset Register Excel file and imports:
 * 1. Facilities (unique facility names with aggregated charger counts)
 * 2. Chargers (individual charger records)
 *
 * Usage:
 *   npx tsx scripts/import-excel.ts /path/to/data.xlsx
 *
 * Environment:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Service role key for admin access
 */

import * as XLSX from "xlsx";
import { config } from "dotenv";

// Load .env file (override shell env vars which may point to wrong Supabase)
config({ override: true });

// Configuration
const BATCH_SIZE = 100;
const SUPABASE_URL =
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Validate environment
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing environment variables:");
  console.error("  SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL");
  console.error("  SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

// Native fetch helper for RPC calls (bypasses supabase-js schema cache issues)
async function rpc<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<{ data: T | null; error: Error | null }> {
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/${functionName}`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(params),
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        data: null,
        error: new Error(
          `RPC ${functionName} failed: ${response.status} ${errorText}`,
        ),
      };
    }

    const data = await response.json();
    return { data: data as T, error: null };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// Types from Excel
interface ExcelRow {
  "Serial Number": string;
  Country: string;
  "Charger Type": string | null;
  Vendor: string | null;
  Model: string | null;
  "Current Status": string | null;
  "Facility Name": string;
  "Current Subscription Type": string | null;
  Ownership: string | null;
  "Charger Installed Date": string | number | null;
  Chargers: number;
}

// Parse Excel date
function parseDate(value: string | number | null): string | null {
  if (!value) return null;

  // Excel serial date number
  if (typeof value === "number") {
    const date = new Date((value - 25569) * 86400 * 1000);
    return date.toISOString().split("T")[0];
  }

  // String date - try to parse
  const date = new Date(value);
  if (isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

// Normalize status to match DB enum
function normalizeStatus(
  status: string | null,
): "Enabled" | "Disabled" | "Out of order" | null {
  if (!status) return null;
  const s = status.trim();
  if (s === "Enabled") return "Enabled";
  if (s === "Disabled") return "Disabled";
  if (s === "Out of order" || s === "Out of Order") return "Out of order";
  console.warn(`Unknown status: ${s}`);
  return null;
}

// Normalize charger type
function normalizeChargerType(
  type: string | null,
): "Private" | "Shared" | null {
  if (!type) return null;
  const t = type.trim();
  if (t === "Private") return "Private";
  if (t === "Shared") return "Shared";
  console.warn(`Unknown charger type: ${t}`);
  return null;
}

// Normalize ownership
function normalizeOwnership(
  ownership: string | null,
): "Driver" | "Housing Association" | "Volterra" | null {
  if (!ownership) return null;
  const o = ownership.trim();
  if (o === "Driver") return "Driver";
  if (o === "Housing Association" || o === "Housing association")
    return "Housing Association";
  if (o === "Volterra") return "Volterra";
  console.warn(`Unknown ownership: ${o}`);
  return null;
}

async function importExcel(filePath: string) {
  console.log(`\n📊 Reading Excel file: ${filePath}\n`);

  // Read Excel file
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet);

  console.log(`Found ${rows.length.toLocaleString()} charger rows\n`);

  // Group by facility
  const facilityMap = new Map<
    string,
    { country: string; chargerCount: number; chargers: ExcelRow[] }
  >();

  for (const row of rows) {
    const facilityName = row["Facility Name"]?.trim();
    if (!facilityName) continue;

    const existing = facilityMap.get(facilityName);
    if (existing) {
      existing.chargerCount += 1;
      existing.chargers.push(row);
    } else {
      facilityMap.set(facilityName, {
        country: row.Country,
        chargerCount: 1,
        chargers: [row],
      });
    }
  }

  console.log(`Found ${facilityMap.size.toLocaleString()} unique facilities\n`);

  // Insert facilities using RPC function
  console.log("📍 Inserting facilities...");
  const facilityIds = new Map<string, string>();
  const facilitiesData = Array.from(facilityMap.entries()).map(
    ([name, data]) => ({
      name,
      country: data.country,
      charger_count: data.chargerCount,
      geocode_status: "pending",
    }),
  );

  // Insert in batches using RPC
  let insertedFacilities = 0;
  for (let i = 0; i < facilitiesData.length; i += BATCH_SIZE) {
    const batch = facilitiesData.slice(i, i + BATCH_SIZE);

    const { data, error } = await rpc<
      { facility_id: string; facility_name: string }[]
    >("import_facilities", { p_facilities: batch });

    if (error) {
      console.error(
        `Error inserting facilities batch ${i / BATCH_SIZE + 1}:`,
        error,
      );
      continue;
    }

    // Store IDs for charger foreign keys
    if (data) {
      for (const f of data) {
        facilityIds.set(f.facility_name, f.facility_id);
      }
      insertedFacilities += data.length;
    }

    process.stdout.write(
      `\r  Progress: ${insertedFacilities.toLocaleString()} / ${facilitiesData.length.toLocaleString()}`,
    );
  }
  console.log(
    `\n  ✅ Inserted ${insertedFacilities.toLocaleString()} facilities\n`,
  );

  // Insert chargers using RPC function
  console.log("🔌 Inserting chargers...");
  const chargersData: {
    serial_number: string;
    facility_id: string | null;
    country: string;
    charger_type: string | null;
    vendor: string | null;
    model: string | null;
    status: string | null;
    subscription_type: string | null;
    ownership: string | null;
    installed_date: string | null;
  }[] = [];

  for (const row of rows) {
    const facilityName = row["Facility Name"]?.trim();
    const facilityId = facilityName ? facilityIds.get(facilityName) : undefined;

    chargersData.push({
      serial_number: row["Serial Number"],
      facility_id: facilityId || null,
      country: row.Country,
      charger_type: normalizeChargerType(row["Charger Type"]),
      vendor: row.Vendor?.trim() || null,
      model: row.Model?.trim() || null,
      status: normalizeStatus(row["Current Status"]),
      subscription_type: row["Current Subscription Type"]?.trim() || null,
      ownership: normalizeOwnership(row.Ownership),
      installed_date: parseDate(row["Charger Installed Date"]),
    });
  }

  // Insert in batches using RPC
  let insertedChargers = 0;
  let skippedChargers = 0;

  for (let i = 0; i < chargersData.length; i += BATCH_SIZE) {
    const batch = chargersData.slice(i, i + BATCH_SIZE);

    const { data, error } = await rpc<number>("import_chargers", {
      p_chargers: batch,
    });

    if (error) {
      console.error(
        `Error inserting chargers batch ${i / BATCH_SIZE + 1}:`,
        error,
      );
      skippedChargers += batch.length;
      continue;
    }

    if (data !== null) {
      insertedChargers += data;
    }

    process.stdout.write(
      `\r  Progress: ${(insertedChargers + skippedChargers).toLocaleString()} / ${chargersData.length.toLocaleString()}`,
    );
  }

  console.log(`\n  ✅ Inserted ${insertedChargers.toLocaleString()} chargers`);
  if (skippedChargers > 0) {
    console.log(
      `  ⚠️  Skipped ${skippedChargers.toLocaleString()} (duplicates or errors)`,
    );
  }

  // Summary
  console.log("\n📊 Import Summary:");
  console.log("─".repeat(40));

  // Get stats by country
  interface FacilityStats {
    total_chargers: number;
    facility_count: number;
    by_country: Record<string, number> | null;
  }
  const { data: stats } = await rpc<FacilityStats>("get_facility_stats", {});

  if (stats) {
    console.log(`Total Chargers: ${stats.total_chargers.toLocaleString()}`);
    console.log(`Total Facilities: ${stats.facility_count}`);
    if (stats.by_country) {
      console.log("\nBy Country:");
      for (const [country, count] of Object.entries(stats.by_country).sort(
        (a, b) => b[1] - a[1],
      )) {
        console.log(`  ${country}: ${count.toLocaleString()}`);
      }
    }
  }

  console.log("\n✅ Import complete!\n");
}

// Main
const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/import-excel.ts /path/to/data.xlsx");
  process.exit(1);
}

importExcel(filePath).catch(console.error);
