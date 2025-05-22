import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    console.log("Supabase client created");

    // Get search params
    const { searchParams } = new URL(request.url);
    const testInsert = searchParams.get("testInsert") === "true";

    // Test connection to meta_ads table
    const { data: tableInfo, error: tableError } = await supabase
      .from("meta_ads")
      .select("*")
      .limit(3);

    if (tableError) {
      console.error("Error accessing meta_ads table:", tableError);
      return NextResponse.json(
        {
          error: "Error accessing meta_ads table",
          details: tableError,
        },
        { status: 500 }
      );
    }

    // Check foreign key tables
    const { data: campaignsData } = await supabase
      .from("meta_campaigns")
      .select("campaign_id")
      .limit(1);

    const { data: adSetsData } = await supabase
      .from("meta_ad_sets")
      .select("ad_set_id")
      .limit(1);

    // Ensure data is not null
    const campaigns = campaignsData || [];
    const adSets = adSetsData || [];

    // Get table columns information
    const { data: columnInfo, error: columnError } = await supabase.rpc(
      "get_columns_info",
      { table_name: "meta_ads" }
    );

    // Test insert if requested
    let insertResult = null;
    if (testInsert && campaigns.length > 0 && adSets.length > 0) {
      const testId = `test_${Date.now()}`;
      const sampleAd = {
        ad_id: testId,
        name: "Test Ad",
        account_id: searchParams.get("accountId") || "act_123456789",
        campaign_id: campaigns[0].campaign_id,
        ad_set_id: adSets[0].ad_set_id,
        status: "PAUSED",
        impressions: 0,
        clicks: 0,
        reach: 0,
        spend: 0,
        last_updated: new Date(),
      };

      const { data: inserted, error: insertError } = await supabase
        .from("meta_ads")
        .upsert([sampleAd])
        .select();

      insertResult = {
        success: !insertError,
        data: inserted,
        error: insertError,
      };

      // Clean up the test record
      if (!insertError) {
        await supabase.from("meta_ads").delete().eq("ad_id", testId);
      }
    }

    // Return table info
    return NextResponse.json({
      success: true,
      message: "Successfully connected to meta_ads table",
      recordCount: tableInfo ? tableInfo.length : 0,
      sampleRecords: tableInfo,
      columnInfo: columnInfo,
      foreignKeys: {
        campaigns: campaigns.length > 0 ? campaigns[0] : null,
        adSets: adSets.length > 0 ? adSets[0] : null,
      },
      testInsert: insertResult,
    });
  } catch (error) {
    console.error("Error in test-meta-ads route:", error);
    return NextResponse.json(
      {
        error: "Error in test-meta-ads route",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
