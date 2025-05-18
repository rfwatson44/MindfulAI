import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const supabase = await createClient();
    console.log("Supabase client created");

    // Get account ID from query params
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId") || "unknown_account";
    const testId = `test_${Date.now()}`;

    console.log(`Creating test ad record with ID: ${testId}`);

    // Try direct insertion with minimal record
    const testAd = {
      ad_id: testId,
      name: "Test Ad",
      account_id: accountId,
      status: "PAUSED",
      last_updated: new Date(),
    };

    console.log("Inserting minimal record into meta_ads table");
    const { data: insertedData, error: insertError } = await supabase
      .from("meta_ads")
      .upsert([testAd])
      .select();

    if (insertError) {
      console.error("Error inserting minimal record:", insertError);

      // Try with an ad_set_id and campaign_id
      console.log("Fetching an ad_set and campaign to reference...");

      // Get a campaign ID to reference
      const { data: campaigns } = await supabase
        .from("meta_campaigns")
        .select("campaign_id")
        .limit(1);

      const campaignId =
        campaigns && campaigns.length > 0 ? campaigns[0].campaign_id : null;

      // Get an ad_set ID to reference
      const { data: adSets } = await supabase
        .from("meta_ad_sets")
        .select("ad_set_id")
        .limit(1);

      const adSetId = adSets && adSets.length > 0 ? adSets[0].ad_set_id : null;

      if (campaignId && adSetId) {
        console.log(`Using campaign_id: ${campaignId}, ad_set_id: ${adSetId}`);

        const fullTestAd = {
          ...testAd,
          campaign_id: campaignId,
          ad_set_id: adSetId,
          impressions: 0,
          clicks: 0,
          reach: 0,
          spend: 0,
        };

        console.log("Inserting record with references into meta_ads table");
        const { data: secondInsert, error: secondError } = await supabase
          .from("meta_ads")
          .upsert([fullTestAd])
          .select();

        if (secondError) {
          console.error("Error on second insert attempt:", secondError);
          return NextResponse.json(
            {
              success: false,
              message: "Failed to insert into meta_ads table",
              firstError: insertError,
              secondError,
            },
            { status: 500 }
          );
        } else {
          return NextResponse.json({
            success: true,
            message:
              "Successfully inserted into meta_ads table with second attempt",
            data: secondInsert,
          });
        }
      } else {
        return NextResponse.json(
          {
            success: false,
            message:
              "Failed to insert into meta_ads table and couldn't find references",
            error: insertError,
          },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "Successfully inserted into meta_ads table",
      data: insertedData,
    });
  } catch (error) {
    console.error("Error in test-meta-ad-insert route:", error);
    return NextResponse.json(
      {
        error: "Error in test-meta-ad-insert route",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
