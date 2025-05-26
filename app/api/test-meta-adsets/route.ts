import { NextResponse } from "next/server";
import { FacebookAdsApi, Campaign } from "facebook-nodejs-business-sdk";
import { createClient } from "@/utils/supabase/server";

// Meta API configuration
const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN!,
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const campaignId = searchParams.get("campaignId");

    if (!accountId) {
      return NextResponse.json(
        { error: "accountId parameter is required" },
        { status: 400 }
      );
    }

    if (!campaignId) {
      return NextResponse.json(
        { error: "campaignId parameter is required" },
        { status: 400 }
      );
    }

    // Initialize Facebook API
    console.log("Initializing Facebook API...");
    const api = FacebookAdsApi.init(META_CONFIG.accessToken);
    api.setDebug(true); // Enable debug for testing
    console.log("Facebook API initialized");

    const supabase = await createClient();

    // Test 1: Get campaign info
    console.log(`=== TEST 1: Getting campaign info for ${campaignId} ===`);
    const campaign = new Campaign(campaignId);

    let campaignInfo;
    try {
      campaignInfo = await campaign.read([
        "id",
        "name",
        "status",
        "objective",
        "account_id",
      ]);
      console.log("✅ Campaign info retrieved:", campaignInfo);
    } catch (error) {
      console.error("❌ Error getting campaign info:", error);
      return NextResponse.json(
        {
          error: "Failed to get campaign info",
          details: error instanceof Error ? error.message : String(error),
          campaignId,
        },
        { status: 500 }
      );
    }

    // Test 2: Get adsets for this campaign
    console.log(`=== TEST 2: Getting adsets for campaign ${campaignId} ===`);

    let adsetsResponse;
    try {
      adsetsResponse = await campaign.getAdSets(
        [
          "id",
          "name",
          "status",
          "configured_status",
          "effective_status",
          "optimization_goal",
          "billing_event",
          "bid_amount",
          "daily_budget",
          "lifetime_budget",
          "start_time",
          "end_time",
        ],
        { limit: 50 }
      );
      console.log("✅ Adsets response received");
      console.log("Response type:", typeof adsetsResponse);
      console.log("Response:", adsetsResponse);
    } catch (error) {
      console.error("❌ Error getting adsets:", error);
      return NextResponse.json(
        {
          error: "Failed to get adsets",
          details: error instanceof Error ? error.message : String(error),
          campaignId,
          campaignInfo,
        },
        { status: 500 }
      );
    }

    // Parse adsets response
    let adsets: any[] = [];
    if (Array.isArray(adsetsResponse)) {
      adsets = adsetsResponse;
    } else if (adsetsResponse && typeof adsetsResponse === "object") {
      const responseObj = adsetsResponse as any;
      if (responseObj.data) {
        adsets = responseObj.data;
      }
    }

    console.log(`Found ${adsets.length} adsets`);

    // Test 3: Check if we can store one adset in the database
    let dbTestResult = null;
    if (adsets.length > 0) {
      console.log(`=== TEST 3: Testing database storage for first adset ===`);
      const firstAdset = adsets[0];

      const testAdsetData = {
        ad_set_id: firstAdset.id,
        campaign_id: campaignId,
        account_id: accountId,
        name: firstAdset.name || "Test Adset",
        status: firstAdset.status || "UNKNOWN",
        configured_status: firstAdset.configured_status || null,
        effective_status: firstAdset.effective_status || null,
        optimization_goal: firstAdset.optimization_goal || null,
        billing_event: firstAdset.billing_event || null,
        bid_amount: firstAdset.bid_amount
          ? parseFloat(firstAdset.bid_amount)
          : null,
        daily_budget: firstAdset.daily_budget
          ? parseFloat(firstAdset.daily_budget)
          : null,
        lifetime_budget: firstAdset.lifetime_budget
          ? parseFloat(firstAdset.lifetime_budget)
          : null,
        targeting: firstAdset.targeting || null,
        start_time: firstAdset.start_time
          ? new Date(firstAdset.start_time).toISOString()
          : null,
        end_time: firstAdset.end_time
          ? new Date(firstAdset.end_time).toISOString()
          : null,
        last_updated: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      try {
        const { data: upsertData, error: adsetError } = await supabase
          .from("meta_ad_sets")
          .upsert([testAdsetData], {
            onConflict: "ad_set_id",
            ignoreDuplicates: false,
          })
          .select();

        dbTestResult = {
          success: !adsetError,
          data: upsertData,
          error: adsetError,
          adsetData: testAdsetData,
        };

        if (adsetError) {
          console.error("❌ Database storage failed:", adsetError);
        } else {
          console.log("✅ Database storage successful:", upsertData);
        }
      } catch (dbError) {
        console.error("❌ Database test exception:", dbError);
        dbTestResult = {
          success: false,
          error: dbError instanceof Error ? dbError.message : String(dbError),
        };
      }
    }

    // Return comprehensive test results
    return NextResponse.json({
      success: true,
      message: "Adsets test completed",
      results: {
        campaignInfo: {
          id: campaignInfo.id,
          name: campaignInfo.name,
          status: campaignInfo.status,
          objective: campaignInfo.objective,
          account_id: campaignInfo.account_id,
        },
        adsetsFound: adsets.length,
        adsets: adsets.map((adset: any) => ({
          id: adset.id,
          name: adset.name,
          status: adset.status,
          configured_status: adset.configured_status,
          effective_status: adset.effective_status,
          optimization_goal: adset.optimization_goal,
          daily_budget: adset.daily_budget,
          lifetime_budget: adset.lifetime_budget,
        })),
        databaseTest: dbTestResult,
        rawResponse: {
          type: typeof adsetsResponse,
          isArray: Array.isArray(adsetsResponse),
          hasData:
            adsetsResponse &&
            typeof adsetsResponse === "object" &&
            "data" in adsetsResponse,
        },
      },
    });
  } catch (error) {
    console.error("Error in test-meta-adsets route:", error);
    return NextResponse.json(
      {
        error: "Error in test-meta-adsets route",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
