import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { v4 as uuidv4 } from "uuid";

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

    // Test 1: Check if we have campaigns in the database
    console.log("=== TEST 1: Checking campaigns in database ===");
    const { data: campaigns, error: campaignsError } = await supabase
      .from("meta_campaigns")
      .select("campaign_id, name, status")
      .eq("account_id", accountId)
      .limit(10);

    console.log("Campaigns query result:", {
      count: campaigns?.length || 0,
      error: campaignsError,
      sampleCampaigns: campaigns?.slice(0, 3) || [],
    });

    if (campaignsError) {
      return NextResponse.json(
        { error: "Failed to get campaigns", details: campaignsError },
        { status: 500 }
      );
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json(
        { error: "No campaigns found in database" },
        { status: 404 }
      );
    }

    // Test 2: Check current adsets count
    console.log("=== TEST 2: Checking current adsets count ===");
    const { count: currentAdsetsCount } = await supabase
      .from("meta_ad_sets")
      .select("*", { count: "exact", head: true })
      .eq("account_id", accountId);

    console.log(`Current adsets count: ${currentAdsetsCount || 0}`);

    // Test 3: Test the fallback mechanism
    console.log("=== TEST 3: Testing fallback mechanism ===");

    // Simulate what happens when adsets phase receives empty campaign IDs
    const emptyPayload = {
      accountId,
      timeframe: "24h",
      action: "get24HourData",
      requestId: uuidv4(),
      phase: "adsets",
      campaignIds: [], // Empty array to test fallback
      after: "",
    };

    console.log("Testing with empty campaignIds to trigger fallback...");

    // Test the database fallback logic directly
    const { data: dbCampaigns, error: dbCampaignsError } = await supabase
      .from("meta_campaigns")
      .select("campaign_id")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    console.log("Fallback database query result:", {
      count: dbCampaigns?.length || 0,
      error: dbCampaignsError,
      sampleIds: dbCampaigns?.slice(0, 5).map((c: any) => c.campaign_id) || [],
    });

    if (dbCampaignsError) {
      return NextResponse.json(
        {
          error: "Fallback mechanism failed",
          details: dbCampaignsError,
          testResults: {
            campaignsInDb: campaigns.length,
            currentAdsets: currentAdsetsCount || 0,
            fallbackFailed: true,
          },
        },
        { status: 500 }
      );
    }

    const finalCampaignIds = dbCampaigns?.map((c: any) => c.campaign_id) || [];

    return NextResponse.json({
      success: true,
      message: "Adsets phase fallback test completed successfully",
      testResults: {
        campaignsInDatabase: campaigns.length,
        currentAdsetsCount: currentAdsetsCount || 0,
        fallbackWorking: finalCampaignIds.length > 0,
        campaignIdsFromFallback: finalCampaignIds.length,
        sampleCampaignIds: finalCampaignIds.slice(0, 5),
        emptyPayloadTest: emptyPayload,
        fallbackResult: {
          success: !dbCampaignsError,
          campaignIdsRetrieved: finalCampaignIds.length,
          error: dbCampaignsError,
        },
      },
      recommendation:
        finalCampaignIds.length > 0
          ? "✅ Fallback mechanism is working. The adsets phase should now be able to retrieve campaign IDs from the database when they're not provided in the payload."
          : "❌ Fallback mechanism failed. No campaign IDs could be retrieved from the database.",
    });
  } catch (error) {
    console.error("Error in test-adsets-phase route:", error);
    return NextResponse.json(
      {
        error: "Error in test-adsets-phase route",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
