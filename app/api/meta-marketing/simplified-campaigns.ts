import { NextResponse } from "next/server";
import { FacebookAdsApi, AdAccount } from "facebook-nodejs-business-sdk";
import { createClient } from "@/utils/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";

// Force dynamic rendering since we're using cookies via supabase
export const dynamic = "force-dynamic";

// Helper function to safely parse strings to numbers
function safeParseInt(value: string | undefined, defaultValue = 0): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function safeParseFloat(value: string | undefined, defaultValue = 0): number {
  if (value === undefined) return defaultValue;
  const parsed = parseFloat(value);
  return isNaN(parsed) ? defaultValue : parsed;
}

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Simple Meta API configuration
const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN!,
};

// Helper to process errors
function logError(error: any, context: string) {
  console.error(`Error in ${context}:`, error);

  if (error?.response) {
    console.error("Response error:", {
      code: error.response.error?.code,
      message: error.response.error?.message,
      type: error.response.error?.type,
    });
  }

  if (error.stack) {
    console.error("Stack:", error.stack);
  }
}

// GET route handler
export async function GET(request: Request) {
  console.log("=== Starting Simplified Campaigns API request ===");
  console.time("total-request-time");

  try {
    // Extract query parameters
    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get("accountId");
    const batchSize = parseInt(searchParams.get("batchSize") || "10", 10);
    const maxCampaigns = parseInt(searchParams.get("maxCampaigns") || "50", 10);

    if (!accountId) {
      console.log("Error: Account ID is missing");
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    console.log(
      `Request for account: ${accountId} (batch size: ${batchSize}, max: ${maxCampaigns})`
    );

    // Initialize Supabase client
    const supabase = await createClient();
    console.log("Supabase client created");

    // Test database connection
    try {
      console.log("Testing database connection...");
      const { data, error } = await supabase
        .from("meta_api_metrics")
        .select("*")
        .limit(1);

      if (error) {
        console.error("Database connection test failed:", error);
      } else {
        console.log("Database connection test successful", {
          rowCount: data?.length || 0,
        });
      }
    } catch (dbTestError) {
      console.error(
        "Database connection test threw an exception:",
        dbTestError
      );
    }

    // Initialize Facebook API
    console.log("Initializing Facebook API...");
    const api = FacebookAdsApi.init(META_CONFIG.accessToken);
    api.setDebug(true);
    const account = new AdAccount(accountId);
    console.log("Facebook API initialized");

    // Step 1: Fetch campaigns, only basic fields using cursor-based pagination
    console.log("Fetching campaigns from Meta API...");
    console.time("campaigns-fetch");

    // Process all campaigns in batches with proper cursor handling
    let processedCampaigns = [];
    let totalProcessed = 0;
    let hasMore = true;
    let campaignCursor = null;

    try {
      // Get first batch of campaigns
      let campaigns = await account.getCampaigns(
        [
          "name",
          "status",
          "objective",
          "daily_budget",
          "lifetime_budget",
          "configured_status",
          "effective_status",
        ],
        {
          limit: batchSize, // Process in smaller batches
        }
      );

      console.log(`Fetched first batch: ${campaigns.length} campaigns`);

      // Process campaigns in batches
      while (
        campaigns &&
        campaigns.length > 0 &&
        totalProcessed < maxCampaigns &&
        hasMore
      ) {
        console.log(
          `Processing batch of ${campaigns.length} campaigns (total processed so far: ${totalProcessed})`
        );

        // Process each campaign in the batch
        for (
          let i = 0;
          i < campaigns.length && totalProcessed < maxCampaigns;
          i++
        ) {
          const campaign = campaigns[i];
          console.log(
            `Processing campaign ${totalProcessed + 1}/${Math.min(
              maxCampaigns,
              totalProcessed + campaigns.length
            )}: ${campaign.id} (${campaign.name})`
          );

          try {
            // Create simplified campaign object
            const campaignData = {
              campaign_id: campaign.id,
              account_id: accountId,
              name: campaign.name,
              status: campaign.status,
              objective: campaign.objective,
              daily_budget: parseFloat(campaign.daily_budget) || 0,
              lifetime_budget: parseFloat(campaign.lifetime_budget) || 0,
              configured_status: campaign.configured_status,
              effective_status: campaign.effective_status,
            };

            // Step 3: Save to Supabase
            console.log(`Storing campaign ${campaign.id} to Supabase...`);
            const { error: upsertError } = await supabase
              .from("meta_campaigns")
              .upsert([campaignData], {
                onConflict: "campaign_id",
                ignoreDuplicates: false,
              });

            if (upsertError) {
              console.error(
                `Error storing campaign ${campaign.id}:`,
                upsertError
              );
            } else {
              console.log(`Successfully stored campaign ${campaign.id}`);
              processedCampaigns.push(campaignData);
            }

            // Small delay between campaigns
            await delay(200);

            totalProcessed++;
          } catch (campaignError) {
            logError(campaignError, `processing campaign ${campaign.id}`);
          }
        }

        // Check if we need to fetch the next page of results
        if (campaigns.hasNext() && totalProcessed < maxCampaigns) {
          console.log("Fetching next page of campaigns...");
          try {
            campaigns = await campaigns.next();
            console.log(`Fetched next page: ${campaigns.length} campaigns`);
          } catch (paginationError) {
            logError(paginationError, "pagination");
            hasMore = false;
          }
        } else {
          hasMore = false;
        }
      }
    } catch (fetchError) {
      logError(fetchError, "fetching campaigns");
    }

    console.timeEnd("campaigns-fetch");
    console.log(
      `Successfully processed ${processedCampaigns.length} campaigns`
    );

    // Return success response
    console.log("Generating response");
    const response = NextResponse.json({
      result: {
        campaigns: processedCampaigns,
        total: processedCampaigns.length,
        hasMore: hasMore && totalProcessed >= maxCampaigns,
      },
      success: true,
      message: `Campaigns fetched and stored successfully (${processedCampaigns.length} campaigns)`,
    });

    console.log("Response object created");
    console.timeEnd("total-request-time");
    return response;
  } catch (error) {
    logError(error, "Simplified Campaigns API");
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
        success: false,
      },
      { status: 500 }
    );
  }
}
