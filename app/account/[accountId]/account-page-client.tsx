"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/utils/supabase/client";

// --- DEBUG: Top-level logs
console.log("[AccountPageClient] TOP-LEVEL");

// Fallback test ad (must match Ad type)
const FALLBACK_AD = {
  id: "fallback",
  accountId: "fallback-account",
  campaignId: "fallback-campaign",
  campaignName: "Fallback Campaign",
  name: "Fallback Ad",
  status: "active",
  type: "static" as const,
  startDate: "2025-01-01",
  endDate: "2025-12-31",
  metrics: {},
  imageUrl: "",
  adSetId: "fallback-adset",
  spend: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  conversions: 0,
  revenue: 0,
  costPerResult: 0,
};
import { Button } from "@/components/ui/button";
import { Sparkles, Loader2 } from "lucide-react";
import { DashboardLayout } from "@/components/layout/dashboard-layout";
import { AccountHeader } from "@/components/account/account-header";
import { AccountTabs } from "@/components/account/account-tabs";
import { AdTable } from "@/components/account/ad-table";
import { AIPanel } from "@/components/account/ai-panel";
import { Pagination } from "@/components/ui/pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";

import { Ad, AdType, SelectedRange } from "@/lib/types";

// Define pagination type
interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  activeTab: AdType;
}

interface AccountPageClientProps {
  account: any; // Replace with your account type
  initialAdsData: Ad[];
  pagination: PaginationInfo;
}


export function AccountPageClient({
  account,
  initialAdsData,
  pagination,
}: AccountPageClientProps) {
  console.log('[RENDER] AccountPageClient', { initialAdsData, pagination });
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  console.log("initialAdsData:", initialAdsData);
  console.log("pagination:", pagination);
  console.log("pagination.activeTab:", pagination.activeTab);

  // For initial render, use the pagination from server
  const [activeTab, setActiveTab] = useState<AdType>(pagination.activeTab);
  const [currentPage, setCurrentPage] = useState(pagination.currentPage);
  const [error, setError] = useState<string | null>(null);

  // Safe ads data handling
  const safeInitialAdsData =
    Array.isArray(initialAdsData) && initialAdsData.length > 0
      ? initialAdsData
      : [];

  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null);
  const [showAnalyzeButton, setShowAnalyzeButton] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  console.log(`[DEBUG] [STATE] isAIPanelOpen:`, isAIPanelOpen, '[STATE] showAnalyzeButton:', showAnalyzeButton, '[STATE] selectedRange:', selectedRange);

  // Deep debug: log state on every render
  useEffect(() => {
    console.log('[EFFECT][RENDER] isAIPanelOpen:', isAIPanelOpen, 'showAnalyzeButton:', showAnalyzeButton, 'selectedRange:', selectedRange);
  });

  // Real Supabase fetchAdsData implementation
  async function fetchAdsData(
    accountId: string,
    page: number,
    pageSize: number,
    adType: AdType
  ): Promise<{ data: Ad[]; count: number }> {
    const formattedAccountId = `act_${accountId}`;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    let query = supabase
      .from("meta_ads")
      .select("*", { count: "exact" })
      .eq("account_id", formattedAccountId); // Filter by account_id
    if (adType === "static" || adType === "video") {
      query = query.eq("creative_type", adType === "static" ? "IMAGE" : "VIDEO");
    }
    query = query.range(from, to);
    console.log("[fetchAdsData] formattedAccountId:", formattedAccountId);
    console.log("[fetchAdsData] Query range:", { from, to });
    const { data, error, count } = await query;
    console.log("[fetchAdsData] Raw Supabase result:", { data, error, count });
    if (error) {
      console.error("Supabase meta_ads fetch error (client):", error);
      return { data: [], count: 0 };
    }
    // Map creative_type to type for UI
    const processed = data
      ? data.map((ad) => ({
          ...ad,
          type:
            ad.creative_type === "IMAGE"
              ? "static"
              : ad.creative_type === "VIDEO"
              ? "video"
              : "static",
        }))
      : [];
    return { data: processed, count: count || 0 };
  }

  // Use React Query to fetch data
  const {
    data: adsQueryData,
    isLoading,
    isError,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["ads", account.id, currentPage, activeTab, initialAdsData],
    queryFn: async () => {
      console.log("Executing queryFn with:", {
        accountId: account.id,
        page: currentPage,
        pageSize: pagination.pageSize,
        activeTab,
      });
      const result = await fetchAdsData(
        account.id,
        currentPage,
        pagination.pageSize,
        activeTab
      );
      return result;
    },
    initialData: {
      data: initialAdsData,
      count: pagination.totalItems,
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

  // Invalidate query cache when SSR data changes (correct API)
  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: ["ads", account.id, pagination.currentPage, activeTab, initialAdsData] });
  }, [initialAdsData, pagination.currentPage, activeTab, account.id, queryClient]);

  // Compute adsData, totalPages, paginatedAds for rendering
  const adsData = useMemo(() => adsQueryData?.data || [], [adsQueryData]);
  const totalPages = Math.max(1, Math.ceil((adsQueryData?.count || 0) / pagination.pageSize));
  const paginatedAds = useMemo(() => adsData, [adsData]);

  // Log the query results for debugging
  useEffect(() => {
    console.log("adsQueryData updated:", {
      count: adsQueryData?.count,
      dataLength: adsQueryData?.data?.length,
      firstItem: adsQueryData?.data?.[0] || "No data",
      types: Array.from(
        new Set(adsQueryData?.data?.map((ad) => ad.type) || [])
      ),
      activeTab,
    });
  }, [adsQueryData, activeTab]);

  // Track initial loading state
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    // Set initial load to false after a short delay
    if (isInitialLoad) {
      const timer = setTimeout(() => {
        setIsInitialLoad(false);
      }, 300);
      return () => clearTimeout(timer);
    }
    // console.log('[AccountPageClient] selectedRange updated:', selectedRange);
  }, [selectedRange]);

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      if (page === currentPage) return; // Skip if already on this page

      setCurrentPage(page);

      // Update URL params
      const params = new URLSearchParams();
      // Copy existing params
      searchParams.forEach((value, key) => {
        params.append(key, value);
      });
      params.set("page", page.toString());

      // Invalidate and refetch query with new parameters
      queryClient.invalidateQueries({
        queryKey: ["ads", account.id, page, activeTab],
      });

      // Navigate after query invalidation
      router.push(`?${params.toString()}`);
    },
    [currentPage, account.id, activeTab, searchParams, queryClient, router]
  );

  // Handle tab change
  const handleTabChange = useCallback(
    (type: AdType) => {
      console.log('[CALLBACK] handleTabChange', { type });
      if (type === activeTab) return;
      setActiveTab(type);
      setCurrentPage(1);
      setSelectedRange(null);
      const params = new URLSearchParams(Array.from(searchParams.entries()));
      params.set("type", type);
      params.set("page", "1");
      router.push(`?${params.toString()}`);
    },
    [activeTab, router, searchParams]
  );

  // Handle selection change
  const handleSelectionChange = (selection: SelectedRange | null) => {
    console.log('[CALLBACK] handleSelectionChange BEFORE', { selection, prevSelectedRange: selectedRange });
    setSelectedRange(selection);
    console.log('[CALLBACK] handleSelectionChange AFTER', { selection, prevSelectedRange: selectedRange });
  };

  // Handle Analyze Selected click
  const handleAnalyzeClick = () => {
    console.log('[CLICK] Analyze Selected');
    setIsAIPanelOpen(true);
  };


  // Toggle AI panel
  const toggleAIPanel = () => {
    setIsAIPanelOpen(!isAIPanelOpen);
  };

  // Use client-side navigation to fetch data when parameters change
  useEffect(() => {
    // Add route change complete handler to trigger refetch after navigation
    const handleRouteChange = () => {
      console.log("Route changed, refetching data...");
      refetch();
    };

    // Listen for route changes
    window.addEventListener("popstate", handleRouteChange);

    return () => {
      window.removeEventListener("popstate", handleRouteChange);
    };
  }, [refetch]);

  // Monitor URL parameters for changes
  useEffect(() => {
    const type = searchParams.get("type");
    const page = searchParams.get("page");

    console.log("URL parameters changed:", { type, page });

    if (type && type !== activeTab) {
      console.log("Setting activeTab from URL:", type);
      setActiveTab(type as AdType);
    }

    if (page && parseInt(page, 10) !== currentPage) {
      console.log("Setting currentPage from URL:", page);
      setCurrentPage(parseInt(page, 10));
    }

    // Refetch data when URL parameters change
    refetch();
  }, [searchParams, activeTab, currentPage, refetch]);

  // Initialize URL parameters if needed
  useEffect(() => {
    // Create a new URLSearchParams object for initialization
    const currentType = searchParams.get("type");
    const currentPage = searchParams.get("page");

    // Only update URL if parameters are missing
    if (!currentType || !currentPage) {
      const params = new URLSearchParams();

      // Copy existing params
      searchParams.forEach((value, key) => {
        params.append(key, value);
      });

      // Add missing parameters
      if (!currentType) {
        params.set("type", activeTab);
      }

      if (!currentPage) {
        params.set("page", String(pagination.currentPage));
      }

      // Only navigate if we needed to add parameters
      if (!currentType || !currentPage) {
        console.log("Setting initial URL parameters");
        router.replace(`?${params.toString()}`);
      }
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-border p-6 md:p-8">
        <AccountHeader account={account} />
        <div className="flex flex-row items-center gap-4 mt-4">
          <AccountTabs activeTab={activeTab} onTabChange={handleTabChange} />
        </div>
        {/* Place Analyze Selected button directly under the date picker/calendar */}
        {showAnalyzeButton && !isAIPanelOpen && (
          <div className="mt-4">
            <Button
              variant="default"
              onClick={handleAnalyzeClick}
              className="flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Analyze Selected
            </Button>
          </div>
        )}
      </div>

      <div className="relative flex flex-1 overflow-hidden flex-col">
        {/* Error message */}
        {error && (
          <Alert variant="destructive" className="m-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Loading indicator */}
        {(isLoading || isFetching || isInitialLoad) && (
          <div className="absolute inset-0 bg-background/50 z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                {isInitialLoad
                  ? "Loading initial data..."
                  : isFetching
                  ? "Fetching..."
                  : "Loading ads data..."}
              </p>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-hidden">
          <AdTable
            data={paginatedAds}
            onSelectionChange={handleSelectionChange}
            setShowAnalyzeButton={(show) => {
              console.log('[PROP] setShowAnalyzeButton called', { show, prev: showAnalyzeButton });
              setShowAnalyzeButton(show);
            }}
            aiPanelOpen={isAIPanelOpen}
            setAIPanelOpen={(open) => {
              console.log('[PROP] setAIPanelOpen called', { open, prev: isAIPanelOpen });
              setIsAIPanelOpen(open);
            }}
          />
          {totalPages > 1 && (
            <div className="flex justify-center my-4">
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={(page) => {
                  const params = new URLSearchParams(Array.from(searchParams.entries()));
                  params.set("page", String(page));
                  router.push(`?${params.toString()}`);
                }}
              />
            </div>
          )}
        </div>

        {/* Show total results count */}
        <div className="p-2 text-center text-sm text-muted-foreground">
          {pagination?.totalItems > 0 ? (
            <span>
              Showing {paginatedAds.length} of {pagination.totalItems} total ads
            </span>
          ) : adsData.length === 0 && !isLoading ? (
            <span>No ads found for this account</span>
          ) : null}
        </div>

        <AIPanel
           isOpen={isAIPanelOpen}
           onOpenChange={(open) => {
             console.log('[PROP] AIPanel onOpenChange called', { open, prev: isAIPanelOpen });
             setIsAIPanelOpen(open);
             if (!open) {
               setShowAnalyzeButton(false);
               // setSelectedRange(null);
               console.log('[PROP] AIPanel closed, setShowAnalyzeButton(false)');
             }
           }}
           selectedRange={selectedRange}
           adsData={adsData}
         />
      </div>
    </div>
  );
}
