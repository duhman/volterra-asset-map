import { NextRequest, NextResponse } from "next/server";
import type { Facility } from "@/lib/supabase/types";

function getSupabaseConfig() {
  // Use SUPABASE_CLOUD_* vars to match volterra convention (vs self-hosted)
  const url =
    process.env.SUPABASE_CLOUD_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_CLOUD_SERVICE_KEY;

  if (!url || !key) {
    throw new Error("Missing Supabase configuration");
  }

  return { url, key };
}

type FacilitiesParams = {
  p_countries?: string[] | null;
  p_search?: string | null;
  p_geocoded_only?: boolean;
  p_limit?: number;
  p_offset?: number;
};

async function rpc<T>(
  functionName: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { url, key } = getSupabaseConfig();

  const response = await fetch(`${url}/rest/v1/rpc/${functionName}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
    // Revalidate every 60 seconds for caching
    next: { revalidate: 60 },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `RPC ${functionName} failed: ${response.status} ${errorText}`,
    );
  }

  return response.json();
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    // Parse query parameters
    const countries = searchParams.get("countries")?.split(",").filter(Boolean);
    const search = searchParams.get("search") || null;
    const geocodedOnly = searchParams.get("geocoded_only") === "true";
    const limit = parseInt(searchParams.get("limit") || "2500", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const params: FacilitiesParams = {
      p_countries: countries?.length ? countries : null,
      p_search: search,
      p_geocoded_only: geocodedOnly,
      p_limit: Math.min(limit, 5000), // Cap at 5000
      p_offset: offset,
    };

    const facilities = await rpc<Facility[]>("get_facilities", params);

    return NextResponse.json({
      facilities,
      count: facilities.length,
      hasMore: facilities.length === params.p_limit,
    });
  } catch (error) {
    console.error("Error fetching facilities:", error);
    return NextResponse.json(
      { error: "Failed to fetch facilities" },
      { status: 500 },
    );
  }
}
