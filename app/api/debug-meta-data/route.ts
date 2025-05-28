import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId parameter is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    // Check account data
    console.log("=== CHECKING ACCOUNT DATA ===");
    const { data: accountData, error: accountError } = await supabase
      .from("meta_account_insights")
      .select("*")
      .eq("account_id", accountId)
      .single();

    console.log("Account data:", { accountData, accountError });

    // Check campaigns data
    console.log("=== CHECKING CAMPAIGNS DATA ===");
    const { data: campaignsData, error: campaignsError } = await supabase
      .from("meta_campaigns")
      .select("campaign_id, name, status, objective")
      .eq("account_id", accountId)
      .limit(10);

    console.log("Campaigns data:", {
      count: campaignsData?.length || 0,
      campaignsError,
    });

    // Check adsets data
    console.log("=== CHECKING ADSETS DATA ===");
    const { data: adsetsData, error: adsetsError } = await supabase
      .from("meta_ad_sets")
      .select("ad_set_id, campaign_id, name, status")
      .eq("account_id", accountId)
      .limit(10);

    console.log("Adsets data:", {
      count: adsetsData?.length || 0,
      adsetsError,
    });

    // Check ads data
    console.log("=== CHECKING ADS DATA ===");
    const { data: adsData, error: adsDataError } = await supabase
      .from("meta_ads")
      .select("ad_id, ad_set_id, campaign_id, name, status")
      .eq("account_id", accountId)
      .limit(10);

    console.log("Ads data:", { count: adsData?.length || 0, adsDataError });

    // Get total counts
    const { count: totalCampaigns } = await supabase
      .from("meta_campaigns")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);

    const { count: totalAdsets } = await supabase
      .from("meta_ad_sets")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);

    const { count: totalAds } = await supabase
      .from("meta_ads")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);

    // Get some sample campaign IDs for testing
    const sampleCampaigns = campaignsData?.slice(0, 5) || [];

    return NextResponse.json({
      success: true,
      accountId,
      summary: {
        accountExists: !!accountData && !accountError,
        totalCampaigns: totalCampaigns || 0,
        totalAdsets: totalAdsets || 0,
        totalAds: totalAds || 0,
      },
      sampleData: {
        account: accountData
          ? {
              account_id: accountData.account_id,
              name: accountData.name,
              account_status: accountData.account_status,
              last_updated: accountData.last_updated,
            }
          : null,
        campaigns: sampleCampaigns.map((c) => ({
          campaign_id: c.campaign_id,
          name: c.name,
          status: c.status,
          objective: c.objective,
        })),
        adsets:
          adsetsData?.map((a) => ({
            ad_set_id: a.ad_set_id,
            campaign_id: a.campaign_id,
            name: a.name,
            status: a.status,
          })) || [],
        ads:
          adsData?.map((a) => ({
            ad_id: a.ad_id,
            ad_set_id: a.ad_set_id,
            campaign_id: a.campaign_id,
            name: a.name,
            status: a.status,
          })) || [],
      },
      errors: {
        accountError,
        campaignsError,
        adsetsError,
        adsDataError,
      },
      testUrls: {
        testAdsets:
          sampleCampaigns.length > 0
            ? `/api/test-meta-adsets?accountId=${accountId}&campaignId=${sampleCampaigns[0].campaign_id}`
            : null,
        testCampaigns: sampleCampaigns.map(
          (c) =>
            `/api/test-meta-adsets?accountId=${accountId}&campaignId=${c.campaign_id}`
        ),
      },
    });
  } catch (error) {
    console.error("Error in debug-meta-data route:", error);
    return NextResponse.json(
      {
        error: "Error in debug-meta-data route",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
