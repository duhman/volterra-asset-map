/**
 * HubSpot Address Sync Script
 *
 * Syncs addresses from HubSpot Companies to facilities in Supabase.
 * Handles Nordic housing association naming conventions with smart matching.
 *
 * Usage:
 *   npx tsx scripts/sync-hubspot.ts [options]
 *
 * Options:
 *   --dry-run     Preview matches without updating database
 *   --limit N     Process only first N facilities
 *   --country XX  Filter by country (Norway, Sweden, Denmark)
 *   --verbose     Show detailed matching info
 */

import "dotenv/config";
import { Client } from "@hubspot/api-client";
import { FilterOperatorEnum } from "@hubspot/api-client/lib/codegen/crm/companies";

// Types
type Facility = {
  id: string;
  name: string;
  country: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  hubspot_id: string | null;
};

type HubSpotCompany = {
  id: string;
  properties: {
    name?: string;
    address?: string;
    city?: string;
    zip?: string;
    country?: string;
  };
};

type MatchResult = {
  facility: Facility;
  company: HubSpotCompany | null;
  matchType: "exact" | "normalized" | "token" | "fuzzy" | "none";
  confidence: number;
};

// Configuration
const HUBSPOT_API_KEY = process.env.HUBSPOT_API_KEY;
const SUPABASE_URL =
  process.env.SUPABASE_CLOUD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY =
  process.env.SUPABASE_CLOUD_SERVICE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

const BATCH_SIZE = 50;
const SEARCH_DELAY_MS = 200; // Rate limiting

// Housing association prefixes/suffixes by country
const HOUSING_PATTERNS = {
  Norway: {
    prefixes: [
      "Sameiet",
      "Borettslaget",
      "Boligsameiet",
      "AL",
      "AS",
      "Andelslaget",
    ],
    suffixes: [
      "Borettslag",
      "Sameie",
      "Boligsameie",
      "Garasjelag",
      "Garasjesameie",
      "SA",
      "AS",
    ],
  },
  Sweden: {
    prefixes: [
      "Bostadsrättsföreningen",
      "BRF",
      "Brf",
      "HSB Bostadsrättsförening",
      "Riksbyggen Bostadsrättsförening",
      "Riksbyggens Bostadsrättsförening",
      "Anläggningssamfälligheten",
    ],
    suffixes: [
      "Samfällighetsförening",
      "Bostadsrättsförening",
      "Samfällighet",
      "i Stockholm",
      "i Göteborg",
      "i Uppsala",
    ],
  },
  Denmark: {
    prefixes: ["Andelsboligforening", "A/B", "Ejerforening", "E/F"],
    suffixes: ["Andelsboligforening", "Ejerforening"],
  },
};

// Call Supabase RPC function
async function rpc<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`RPC ${functionName} failed: ${response.status} ${error}`);
  }

  // Handle VOID return type (empty response body)
  const text = await response.text();
  if (!text) {
    return undefined as T;
  }

  return JSON.parse(text) as T;
}

// Fetch facilities missing addresses using RPC function
async function fetchFacilitiesWithoutAddresses(
  limit?: number,
  country?: string,
): Promise<Facility[]> {
  return rpc<Facility[]>("asset_map_get_facilities_for_sync", {
    p_limit: limit || 5000,
    p_country: country || null,
  });
}

// Normalize facility name for matching
function normalizeName(name: string, country: string): string {
  let normalized = name.trim();

  const patterns =
    HOUSING_PATTERNS[country as keyof typeof HOUSING_PATTERNS] ||
    HOUSING_PATTERNS.Norway;

  // Remove prefixes
  for (const prefix of patterns.prefixes) {
    const regex = new RegExp(`^${prefix}\\s+`, "i");
    normalized = normalized.replace(regex, "");
  }

  // Remove suffixes
  for (const suffix of patterns.suffixes) {
    const regex = new RegExp(`\\s+${suffix}$`, "i");
    normalized = normalized.replace(regex, "");
  }

  // Remove common noise and suffixes
  normalized = normalized
    .replace(/\s+(I|II|III|IV|V|1|2|3|4|5)\s*$/i, "") // Roman numerals
    .replace(/\s*-\s*(Zaptec|Easee|laddboxar|all).*$/i, "") // Charger vendor suffixes + "- all"
    .replace(/\s*-\s*all\s*$/i, "") // "- all" suffix
    .replace(/\s+A\/L\s*$/i, "") // "A/L" suffix
    .replace(/\s+\(fellesplass\)\s*$/i, "") // "(fellesplass)" suffix
    .replace(
      /\s+i\s+(Stockholm|Göteborg|Uppsala|Malmö|Örebro|Sundbyberg|Sköndal|Lund|Karlstad|Linköping|Bromma|Årsta|Vaxholm)\s*$/i,
      "",
    ) // Swedish city suffixes
    .replace(/[,.:;!?]+/g, "") // Punctuation
    .replace(/\s+/g, " ") // Multiple spaces to single
    .trim();

  return normalized;
}

// Extract search tokens from name
function extractTokens(name: string): string[] {
  const normalized = name.toLowerCase();

  // Remove common stopwords and housing association prefixes
  const stopwords = [
    "i",
    "och",
    "og",
    "nr",
    "number",
    "ved",
    "på",
    "av",
    "til",
    "for",
    "all", // Common suffix
    "a/l",
    "al",
    "as",
    "sa",
    // Housing prefixes (already common in HubSpot, not distinctive)
    "sameiet",
    "borettslaget",
    "boligsameiet",
    "boligsameie",
    "borettslag",
    "sameie",
    "garasjelag",
    "garasjesameie",
    "brf",
    "bostadsrättsföreningen",
  ];

  return normalized
    .split(/[\s\-\/\(\)]+/)
    .filter((token) => token.length > 2)
    .filter((token) => !stopwords.includes(token))
    .slice(0, 4); // First 4 significant tokens
}

// Calculate string similarity (Levenshtein-based)
function similarity(a: string, b: string): number {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;

  if (longer.length === 0) return 1.0;

  const costs: number[] = [];
  for (let i = 0; i <= shorter.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= longer.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (shorter.charAt(i - 1) !== longer.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[longer.length] = lastValue;
  }

  return (longer.length - costs[longer.length]) / longer.length;
}

// Search HubSpot for matching company
async function searchHubSpotCompany(
  hubspot: Client,
  facility: Facility,
  verbose: boolean,
): Promise<MatchResult> {
  const normalizedName = normalizeName(facility.name, facility.country);
  const tokens = extractTokens(normalizedName);

  if (verbose) {
    console.log(`  Searching for: "${facility.name}"`);
    console.log(`  Normalized: "${normalizedName}"`);
    console.log(`  Tokens: ${tokens.join(", ")}`);
  }

  // Try exact name search first
  try {
    const exactResult = await hubspot.crm.companies.searchApi.doSearch({
      filterGroups: [
        {
          filters: [
            {
              propertyName: "name",
              operator: FilterOperatorEnum.Eq,
              value: facility.name,
            },
          ],
        },
      ],
      properties: ["name", "address", "city", "zip", "country"],
      limit: 5,
    });

    if (exactResult.results?.length > 0) {
      const match = exactResult.results[0];
      if (match.properties.address) {
        return {
          facility,
          company: match as unknown as HubSpotCompany,
          matchType: "exact",
          confidence: 1.0,
        };
      }
    }
  } catch (error) {
    if (verbose) console.log(`  Exact search failed: ${error}`);
  }

  // Try normalized name search
  if (normalizedName !== facility.name) {
    try {
      const normalizedResult = await hubspot.crm.companies.searchApi.doSearch({
        filterGroups: [
          {
            filters: [
              {
                propertyName: "name",
                operator: FilterOperatorEnum.ContainsToken,
                value: normalizedName.split(" ")[0],
              },
            ],
          },
        ],
        properties: ["name", "address", "city", "zip", "country"],
        limit: 20,
      });

      for (const company of normalizedResult.results || []) {
        const companyNormalized = normalizeName(
          company.properties.name || "",
          facility.country,
        );
        const sim = similarity(
          normalizedName.toLowerCase(),
          companyNormalized.toLowerCase(),
        );

        // Lower threshold from 85% to 65% - allows matches like:
        // "Alvim Borettslag - all" vs "Alvim Borettslag" (~75%)
        // "Bråten Borettslag A/L" vs "Bråten Borettslag" (~83%)
        if (sim > 0.65 && company.properties.address) {
          return {
            facility,
            company: company as unknown as HubSpotCompany,
            matchType: "normalized",
            confidence: sim,
          };
        }
      }
    } catch (error) {
      if (verbose) console.log(`  Normalized search failed: ${error}`);
    }
  }

  // Try token-based search with multiple tokens
  if (tokens.length > 0) {
    try {
      // Try each token until we get manageable results
      let tokenResult = null;
      let searchToken = tokens[0];

      for (const token of tokens) {
        const result = await hubspot.crm.companies.searchApi.doSearch({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "name",
                  operator: FilterOperatorEnum.ContainsToken,
                  value: token,
                },
              ],
            },
          ],
          properties: ["name", "address", "city", "zip", "country"],
          limit: 50,
        });

        // Use this token if results are manageable (<100) or it's our last option
        if (!tokenResult || (result.total || 0) < 100) {
          tokenResult = result;
          searchToken = token;
          if ((result.total || 0) < 100) break;
        }

        // Rate limiting between token searches
        await sleep(100);
      }

      if (verbose) {
        console.log(
          `  Token "${searchToken}" returned ${tokenResult?.total || 0} results`,
        );
      }

      // Score each result
      let bestMatch: HubSpotCompany | null = null;
      let bestScore = 0;

      for (const company of tokenResult?.results || []) {
        if (!company.properties.address) continue;

        const companyName = company.properties.name || "";
        const companyNormalized = normalizeName(companyName, facility.country);

        // Calculate token overlap
        const companyTokens = extractTokens(companyNormalized);
        const overlap = tokens.filter((t) =>
          companyTokens.some(
            (ct) => ct.includes(t) || t.includes(ct) || similarity(t, ct) > 0.8,
          ),
        ).length;

        const tokenScore = overlap / Math.max(tokens.length, 1);
        const nameScore = similarity(
          normalizedName.toLowerCase(),
          companyNormalized.toLowerCase(),
        );
        const combinedScore = tokenScore * 0.4 + nameScore * 0.6;

        // Lower threshold from 70% to 55% - more aggressive matching
        if (combinedScore > bestScore && combinedScore > 0.55) {
          bestScore = combinedScore;
          bestMatch = company as unknown as HubSpotCompany;
        }
      }

      if (bestMatch) {
        return {
          facility,
          company: bestMatch,
          matchType: "token",
          confidence: bestScore,
        };
      }
    } catch (error) {
      if (verbose) console.log(`  Token search failed: ${error}`);
    }
  }

  return {
    facility,
    company: null,
    matchType: "none",
    confidence: 0,
  };
}

// Update facility in Supabase via RPC
async function updateFacility(
  facility: Facility,
  company: HubSpotCompany,
): Promise<void> {
  await rpc("asset_map_update_facility_from_hubspot", {
    p_facility_id: facility.id,
    p_hubspot_id: company.id,
    p_address: company.properties.address || null,
    p_city: company.properties.city || null,
    p_postal_code: company.properties.zip || null,
  });
}

// Sleep helper for rate limiting
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Main sync function
async function syncHubSpotAddresses(options: {
  dryRun: boolean;
  limit?: number;
  country?: string;
  verbose: boolean;
}) {
  console.log("🔄 HubSpot Address Sync");
  console.log("─".repeat(50));

  // Validate environment
  if (!HUBSPOT_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error(
      "❌ Missing environment variables. Required: HUBSPOT_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY",
    );
    process.exit(1);
  }

  // Initialize HubSpot client
  const hubspot = new Client({ accessToken: HUBSPOT_API_KEY });

  // Fetch facilities
  console.log("\n📋 Fetching facilities without addresses...");
  const facilities = await fetchFacilitiesWithoutAddresses(
    options.limit,
    options.country,
  );
  console.log(`   Found ${facilities.length} facilities to process`);

  if (facilities.length === 0) {
    console.log("\n✅ All facilities already have addresses!");
    return;
  }

  // Process facilities
  const stats = {
    processed: 0,
    matched: 0,
    updated: 0,
    failed: 0,
    byMatchType: { exact: 0, normalized: 0, token: 0, fuzzy: 0, none: 0 },
    byCountry: {} as Record<string, { matched: number; total: number }>,
  };

  console.log("\n🔍 Searching HubSpot for matches...\n");

  for (let i = 0; i < facilities.length; i += BATCH_SIZE) {
    const batch = facilities.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(facilities.length / BATCH_SIZE);

    console.log(`📦 Batch ${batchNum}/${totalBatches} (${batch.length} items)`);

    for (const facility of batch) {
      stats.processed++;

      // Track by country
      if (!stats.byCountry[facility.country]) {
        stats.byCountry[facility.country] = { matched: 0, total: 0 };
      }
      stats.byCountry[facility.country].total++;

      try {
        const result = await searchHubSpotCompany(
          hubspot,
          facility,
          options.verbose,
        );
        stats.byMatchType[result.matchType]++;

        if (result.company) {
          stats.matched++;
          stats.byCountry[facility.country].matched++;

          if (options.verbose || options.dryRun) {
            console.log(`   ✓ ${facility.name}`);
            console.log(
              `     → ${result.company.properties.name} (${result.matchType}, ${(result.confidence * 100).toFixed(0)}%)`,
            );
            console.log(
              `     📍 ${result.company.properties.address}, ${result.company.properties.city}`,
            );
          }

          if (!options.dryRun) {
            await updateFacility(facility, result.company);
            stats.updated++;
          }
        } else if (options.verbose) {
          console.log(`   ✗ ${facility.name} - No match found`);
        }

        // Rate limiting
        await sleep(SEARCH_DELAY_MS);
      } catch (error) {
        stats.failed++;
        console.error(
          `   ❌ Error processing ${facility.name}: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Batch summary
    console.log(
      `   Matched: ${stats.matched}/${stats.processed} (${((stats.matched / stats.processed) * 100).toFixed(1)}%)\n`,
    );
  }

  // Final summary
  console.log("─".repeat(50));
  console.log("📊 Summary");
  console.log("─".repeat(50));
  console.log(`   Processed:  ${stats.processed}`);
  console.log(
    `   Matched:    ${stats.matched} (${((stats.matched / stats.processed) * 100).toFixed(1)}%)`,
  );
  console.log(`   Updated:    ${stats.updated}`);
  console.log(`   Failed:     ${stats.failed}`);

  console.log("\n   Match Types:");
  console.log(`     Exact:      ${stats.byMatchType.exact}`);
  console.log(`     Normalized: ${stats.byMatchType.normalized}`);
  console.log(`     Token:      ${stats.byMatchType.token}`);
  console.log(`     No Match:   ${stats.byMatchType.none}`);

  console.log("\n   By Country:");
  for (const [country, data] of Object.entries(stats.byCountry)) {
    console.log(
      `     ${country}: ${data.matched}/${data.total} (${((data.matched / data.total) * 100).toFixed(1)}%)`,
    );
  }

  if (options.dryRun) {
    console.log("\n⚠️  Dry run - no changes made to database");
  }

  console.log("\n✅ Sync complete!");
}

// Parse CLI arguments
function parseArgs(): {
  dryRun: boolean;
  limit?: number;
  country?: string;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    limit: undefined as number | undefined,
    country: undefined as string | undefined,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--dry-run":
        options.dryRun = true;
        break;
      case "--limit":
        options.limit = parseInt(args[++i], 10);
        break;
      case "--country":
        options.country = args[++i];
        break;
      case "--verbose":
      case "-v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        console.log(`
HubSpot Address Sync Script

Syncs addresses from HubSpot Companies to facilities in Supabase.

Usage:
  npx tsx scripts/sync-hubspot.ts [options]

Options:
  --dry-run     Preview matches without updating database
  --limit N     Process only first N facilities
  --country XX  Filter by country (Norway, Sweden, Denmark)
  --verbose     Show detailed matching info
  --help        Show this help message
        `);
        process.exit(0);
    }
  }

  return options;
}

// Run
const options = parseArgs();
syncHubSpotAddresses(options).catch(console.error);
