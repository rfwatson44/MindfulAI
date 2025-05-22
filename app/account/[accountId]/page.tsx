import { supabase } from "@/utils/supabase/client";
import { AccountPageClient } from "./account-page-client";

export default async function AccountPage({
  params,
}: {
  params: { accountId: string };
}) {
  // Fetch the account by account_id
  const { data: account } = await supabase
    .from("accounts")
    .select("*")
    .eq("account_id", params.accountId)
    .single();

  // Debug: log params.accountId
  console.log("params.accountId:", params.accountId);
  const formattedAccountId = `act_${params.accountId}`;
  console.log("formattedAccountId:", formattedAccountId);
  // Fetch ads for this account from meta_ads using formattedAccountId
  const { data: adsData, error: adsError } = await supabase
    .from("meta_ads")
    .select("*")
    .eq("account_id", formattedAccountId);

  // Debug: log adsData and any error
  console.log("Fetched adsData:", adsData);
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
          adCount: account.ad_count || 0,
          cpa: account.cpa || 0,
        },
      }
    : { id: params.accountId, name: "", status: "active", metrics: { spend: 0, conversions: 0, adCount: 0, cpa: 0 } };

  return (
    <AccountPageClient account={mappedAccount} initialAdsData={adsData || []} />
  );
}
