"use client";

import { useState, useEffect, useCallback } from "react";
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
import { Pagination, PaginationContent, PaginationItem, PaginationLink, PaginationPrevious, PaginationNext } from "@/components/ui/pagination"; // Pagination UI

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

export function AccountPageClient({ account, initialAdsData, pagination }: AccountPageClientProps) {
  // Pagination state
  const PAGE_SIZE = pagination?.pageSize || 25;
  const [currentPage, setCurrentPage] = useState(pagination?.currentPage || 1);
  const [activeTab, setActiveTab] = useState<AdType>(pagination?.activeTab || "static");
  const [adsData, setAdsData] = useState<Ad[]>(initialAdsData || []);
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(null);
  const [showAnalyzeButton, setShowAnalyzeButton] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(false);

  // --- DEBUG: Log account and initialAdsData at component start
  useEffect(() => {
    console.log('[AccountPageClient] MOUNT/RENDER');
    console.log('[AccountPageClient] account:', account);
    console.log('[AccountPageClient] initialAdsData:', initialAdsData);
  }, [account, initialAdsData]);

  // Pagination: compute current page data
  const totalPages = Math.ceil(adsData.length / PAGE_SIZE);
  const paginatedAds = adsData.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    `Executing Supabase query: meta_ads for account ${formattedAccountId}, type ${adType}, page ${page}`
  );

  // Execute query
  const { data, error, count } = await query;

  if (error) {
    console.error("Error fetching ads:", error);
    throw new Error(`Error fetching ads: ${error.message}`);
  }

  // Map data to match Ad type if needed
  console.log("Raw ads data sample:", data?.[0] || "no ads found");
  console.log("Total raw ads count:", data?.length || 0);

  // Ensure returned data has proper types
  const mappedData = data
    ? data.map((ad) => ({
        ...ad,
        // Set the type property based on creative_type for UI consumption
        type:
          ad.creative_type === "IMAGE"
            ? "static"
            : ad.creative_type === "VIDEO"
            ? "video"
            : "static",
      }))
    : [];

  console.log("Mapped first ad:", mappedData[0] || "no ads mapped");
  console.log(
    "Types in mapped data:",
    mappedData.map((ad) => ad.type).filter((v, i, a) => a.indexOf(v) === i)
  );

  return {
    data: mappedData || [],
    count: count || 0,
  };
};

export function AccountPageClient({
  account,
  initialAdsData,
  pagination,
}: AccountPageClientProps) {
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

  const [analyzeButton, setAnalyzeButton] = useState<React.ReactNode>(null);
  const [selectedRange, setSelectedRange] = useState<SelectedRange | null>(
    null
  );
>>>>>>> 7064c52107d93b76ebea54a26a8bbc5e8a05ede6
  const [showAnalyzeButton, setShowAnalyzeButton] = useState(false);
  const [isAIPanelOpen, setIsAIPanelOpen] = useState(false);

  // Use React Query to fetch data
  const {
    data: adsQueryData,
    isLoading,
    isError,
    error: queryError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["ads", account.id, currentPage, activeTab],
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
      data: safeInitialAdsData,
      count: pagination.totalItems,
    },
    refetchOnWindowFocus: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    retry: 1,
  });

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
  }, [isInitialLoad]);

  // Handle tab change
  const handleTabChange = useCallback(
    (type: AdType) => {
      console.log(
        "handleTabChange called with type:",
        type,
        "current activeTab:",
        activeTab
      );

      if (type === activeTab) {
        console.log("Skipping tab change - already on this tab");
        return; // Skip if already on this tab
      }

      // Update local state
      console.log("Setting activeTab to:", type);
      setActiveTab(type);
      setCurrentPage(1);
      setSelectedRange(null);

      // Update URL params
      const params = new URLSearchParams();
      // Copy existing params
      searchParams.forEach((value, key) => {
        params.append(key, value);
      });
      params.set("type", type);
      params.set("page", "1");

      const newUrl = `?${params.toString()}`;
      console.log("Navigating to:", newUrl);

      // Invalidate and refetch query with new parameters
      queryClient.invalidateQueries({ queryKey: ["ads", account.id] });

      // Navigate after query invalidation
      router.push(newUrl);
    },
    [
      activeTab,
      account.id,
      searchParams,
      queryClient,
      router,
      setSelectedRange,
      setCurrentPage,
    ]
  );

  // Use useEffect to handle errors and prevent infinite loops
  useEffect(() => {
    if (isError && queryError) {
      setError(
        typeof queryError === "string" ? queryError : "Failed to fetch data"
      );
    }
  }, [isError, queryError]);

  // Derived state
  const adsData = adsQueryData?.data || [];
  const totalItems = adsQueryData?.count || 0;
  const totalPages = Math.ceil(totalItems / pagination.pageSize);

  // Handle analyze click
  const handleAnalyzeClick = () => {
    setIsAIPanelOpen(true);
  };

<<<<<<< HEAD
  // Debug: log whenever selectedRange changes
  useEffect(() => {
    // console.log('[AccountPageClient] selectedRange updated:', selectedRange);
  }, [selectedRange]);
  
  
  // Handle tab change
  const handleTabChange = (type: AdType) => {
    setActiveTab(type);
    // Filter adsData by type
    const filtered = (initialAdsData || []).filter((ad) => ad.type === type);
    setAdsData(filtered);
    setSelectedRange(null);
    setCurrentPage(1); // Reset to first page on tab change
  };

  // Show empty state if no ads
  const isEmpty = adsData.length === 0;

  
=======
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

>>>>>>> 7064c52107d93b76ebea54a26a8bbc5e8a05ede6
  // Handle selection change
  const handleSelectionChange = (selection: SelectedRange | null) => {
    setSelectedRange(selection);
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
          {showAnalyzeButton && !isAIPanelOpen && (
            <Button
              className="ml-auto"
              onClick={handleAnalyzeClick}
              disabled={isLoading}
            >
              <Sparkles className="mr-2 h-4 w-4" /> Analyze Selected
            </Button>
          )}
        </div>
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
            showAnalyzeButton={showAnalyzeButton}
            setShowAnalyzeButton={setShowAnalyzeButton}
            aiPanelOpen={isAIPanelOpen}
            setAIPanelOpen={setIsAIPanelOpen}
          />
          {/* Pagination Controls */}
          {adsData.length > PAGE_SIZE && (
            <div className="flex justify-center my-4">
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      aria-disabled={currentPage === 1}
                      tabIndex={currentPage === 1 ? -1 : 0}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages }).map((_, idx) => (
                    <PaginationItem key={idx}>
                      <PaginationLink
                        isActive={currentPage === idx + 1}
                        onClick={() => setCurrentPage(idx + 1)}
                        href="#"
                      >
                        {idx + 1}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      aria-disabled={currentPage === totalPages}
                      tabIndex={currentPage === totalPages ? -1 : 0}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="border-t border-border p-4 flex justify-center">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              disabled={isLoading}
            />
          </div>
        )}

        {/* Show total results count */}
        <div className="p-2 text-center text-sm text-muted-foreground">
          {totalItems > 0 ? (
            <span>
              Showing {adsData.length} of {totalItems} total ads
            </span>
          ) : adsData.length === 0 && !isLoading ? (
            <span>No ads found for this account</span>
          ) : null}
        </div>

        <AIPanel
          isOpen={isAIPanelOpen}
          onOpenChange={setIsAIPanelOpen}
          selectedRange={selectedRange}
          adsData={adsData}
        />
      </div>
    </div>
  );
}
