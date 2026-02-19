import { useState, useEffect } from "react";
import type { Facility } from "@/lib/supabase/types";

type FetchState = {
  facilities: Facility[];
  loading: boolean;
  error: string | null;
};

type FetchOptions = {
  countries?: string[];
  search?: string;
  geocodedOnly?: boolean;
  limit?: number;
};

// PostgREST limits to 1000 rows per request
const PAGE_SIZE = 1000;

export function useFacilities(options: FetchOptions = {}) {
  const [state, setState] = useState<FetchState>({
    facilities: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    const fetchFacilities = async () => {
      try {
        setState((prev) => ({ ...prev, loading: true, error: null }));

        const allFacilities: Facility[] = [];
        let offset = 0;
        let hasMore = true;
        const maxLimit = options.limit || 5000; // Default max to fetch

        while (hasMore && allFacilities.length < maxLimit) {
          const params = new URLSearchParams();
          if (options.countries?.length) {
            params.set("countries", options.countries.join(","));
          }
          if (options.search) {
            params.set("search", options.search);
          }
          if (options.geocodedOnly) {
            params.set("geocoded_only", "true");
          }
          params.set("limit", PAGE_SIZE.toString());
          params.set("offset", offset.toString());

          const response = await fetch(`/api/facilities?${params.toString()}`);

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          allFacilities.push(...data.facilities);

          // Stop if we got less than a full page
          if (data.facilities.length < PAGE_SIZE) {
            hasMore = false;
          } else {
            offset += PAGE_SIZE;
          }
        }

        setState({
          facilities: allFacilities.slice(0, maxLimit),
          loading: false,
          error: null,
        });
      } catch (err) {
        setState({
          facilities: [],
          loading: false,
          error: err instanceof Error ? err.message : "Unknown error",
        });
      }
    };

    fetchFacilities();
  }, [
    options.countries?.join(","),
    options.search,
    options.geocodedOnly,
    options.limit,
  ]);

  return state;
}
