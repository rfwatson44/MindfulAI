
import { supabase } from "@/utils/supabase/client";
import { getAccountById, mockAdAccounts, filterAccountAds } from "@/lib/mock-data";
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
}: {
  params: { accountId: string };
}) {
  // Fetch the account by account_id from Supabase
  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("account_id", params.accountId)
    .single();

  // Debug: log params.accountId
  console.log("params.accountId:", params.accountId);
  const formattedAccountId = `act_${params.accountId}`;
  console.log("formattedAccountId:", formattedAccountId);

  // Fetch ads data from Supabase
  const { data: adsData, error: adsError } = await supabase
    .from("meta_ads")
    .select("*")
    .eq("account_id", params.accountId);

  // Debug: log adsData and any error
  console.log("Fetched adsData:", adsData);
  if (adsError) {
    console.error("Supabase meta_ads fetch error:", adsError);
  }

  // If neither account nor adsData exist, show not found
  if ((!account && (!adsData || adsData.length === 0))) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Account not found</h1>
          <p className="text-muted-foreground">
            The account you are looking for doesn&apos;t exist or you don&apos;t have access to it.
          </p>
        </div>
      </div>
    );
  }

  // If ads exist for this account_id, but account row is missing, construct a minimal account object
  const safeAdsData = adsData ?? [];
  const mappedAccount = account
    ? {
        id: account.account_id || account.id,
        name: account.account_name || account.name || "",
        status: account.status || "active",
        metrics: {
          spend: account.spend || 0,
          conversions: account.conversions || 0,
          adCount: account.ad_count || 0,
          cpa: account.cpa || 0,
        },
      }
    : {
        id: params.accountId,
        name: params.accountId,
        status: "active",
        metrics: {
          spend: 0,
          conversions: 0,
          adCount: safeAdsData.length,
          cpa: 0,
        },
      };

  return (
    <AccountPageClient account={mappedAccount} initialAdsData={safeAdsData} />
  );
}
