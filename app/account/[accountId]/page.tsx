import { supabase } from "@/utils/supabase/client";
import {
  getAccountById,
  mockAdAccounts,
  filterAccountAds,
} from "@/lib/mock-data";
import { AccountPageClient } from "./account-page-client";
import { AdType } from "@/lib/types";

// Generate static params for all account IDs
export function generateStaticParams() {
  return mockAdAccounts.map((account) => ({
    accountId: account.id,
  }));
}

export default async function AccountPage({
  params,
  searchParams,
}: {
  params: { accountId: string };
  searchParams: { page?: string; type?: string };
}) {
  // Parse pagination params with defaults
  const page = parseInt(searchParams.page || "1", 10);
  const pageSize = 50; // Reasonable page size to load at once
  const adType = (searchParams.type || "static") as AdType;

  // Calculate range for pagination
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  // Fetch the account by account_id
  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("account_id", params.accountId)
    .single();

  console.log("account:", account);

  // Debug: log params.accountId
  console.log("params.accountId:", params.accountId);
  const formattedAccountId = `act_${params.accountId}`;
  console.log("formattedAccountId:", formattedAccountId);

  // Build query for ads data
  let query = supabase
    .from("meta_ads")
    .select("*", { count: "exact" })
    .eq("account_id", formattedAccountId); // Filter by account_id

  if (adType === "static" || adType === "video") {
    query = query.eq("creative_type", adType === "static" ? "IMAGE" : "VIDEO");
  }

  console.log("Server query details:", {
    accountId: params.accountId,
    formattedId: formattedAccountId,
    adType,
    creativeType: adType === "static" ? "IMAGE" : "VIDEO",
    searchParams,
  });

  // Apply pagination
  query = query.range(start, end);
  console.log("[SERVER] formattedAccountId:", formattedAccountId);
  console.log("[SERVER] Query range:", { start, end });
  // Execute query with pagination
  const { data: adsData, error: adsError, count } = await query;
  console.log("[SERVER] Raw Supabase result:", { adsData, adsError, count });

  // Debug raw data structure
  console.log("First ad sample:", adsData?.[0] || "No ads found");
  console.log(
    "Creative types in data:",
    adsData
      ? Array.from(new Set(adsData.map((ad) => ad.creative_type))).filter(
          Boolean
        )
      : []
  );

  // Add type property based on creative_type if it exists
  const processedAdsData = adsData
    ? adsData.map((ad) => ({
        ...ad,
        type:
          ad.creative_type === "IMAGE"
            ? "static"
            : ad.creative_type === "VIDEO"
            ? "video"
            : "static", // Default to static
      }))
    : [];

  console.log("adsData:", adsData);

  // Debug: log adsData and any error
  console.log(
    `Fetched adsData (page ${page}, ${pageSize} per page):`,
    adsData?.length
  );
  if (adsError) {
    console.error("Supabase meta_ads fetch error:", adsError);
  }

  // Always render the page and table, even if account is not found
  // Map Supabase account to AdAccount shape expected by UI
  const mappedAccount = account
    ? {
        id: account.account_id || account.id,
        name: account.account_name || account.name || "",
        status: account.status || "active",
        metrics: {
          spend: account.spend || 0,
          conversions: account.conversions || 0,
          adCount: count || 0, // Use actual count from query
          cpa: account.cpa || 0,
        },
      }
    : {
        id: params.accountId,
        name: "",
        status: "active",
        metrics: { spend: 0, conversions: 0, adCount: 0, cpa: 0 },
      };

  if (!account) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account not found</h1>
          <p className="text-muted-foreground">
            The account you are looking for doesn&apos;t exist or you don&apos;t
            have access to it.
          </p>
        </div>
      </div>
    );
  }

  // Pass pagination info to client
  const paginationInfo = {
    currentPage: page,
    totalPages: count ? Math.ceil(count / pageSize) : 1,
    totalItems: count || 0,
    pageSize,
    activeTab: adType,
  };

  console.log("Sending to client:", {
    paginationInfo,
    adCount: processedAdsData.length,
    activeTab: adType,
  });

  return (
    <AccountPageClient
      account={mappedAccount}
      initialAdsData={processedAdsData}
      pagination={paginationInfo}
    />
  );
}
