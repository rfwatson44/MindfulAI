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

// Helper function to get date range for last 24 hours
function getLast24HoursDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setHours(startDate.getHours() - 24);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// GET route handler
export async function GET(request: Request) {
  console.log("=== Starting Simplified Daily Campaigns API request ===");
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
        .from("meta_api_metrics_duplicate")
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

    // Get the date range for the last 24 hours
    const dateRange = getLast24HoursDateRange();
    console.log(
      `Fetching data for last 24 hours: ${dateRange.since} to ${dateRange.until}`
    );

    // First check if the account has any activity in the last 24 hours
    console.log("Checking for activity in the last 24 hours...");
    try {
      const accountInsights = await account.getInsights(
        ["impressions", "clicks", "spend"],
        {
          time_range: dateRange,
          level: "account",
          breakdowns: [],
        }
      );

      // Check if there's any activity
      const hasActivity =
        accountInsights &&
        accountInsights.length > 0 &&
        (safeParseInt(accountInsights[0]?.impressions) > 0 ||
          safeParseInt(accountInsights[0]?.clicks) > 0 ||
          safeParseFloat(accountInsights[0]?.spend) > 0);

      console.log(
        `Activity check result: hasActivity=${hasActivity}, impressions=${
          accountInsights?.[0]?.impressions || 0
        }, clicks=${accountInsights?.[0]?.clicks || 0}, spend=${
          accountInsights?.[0]?.spend || 0
        }`
      );

      if (!hasActivity) {
        console.log(
          `No activity found in the last 24 hours for account ${accountId}`
        );
        return NextResponse.json({
          message: "No activity found in the last 24 hours",
          dateRange,
        });
      }
    } catch (activityError) {
      logError(activityError, "checking account activity");
      return NextResponse.json(
        {
          error: "Error checking account activity",
          details:
            activityError instanceof Error
              ? activityError.message
              : String(activityError),
        },
        { status: 500 }
      );
    }

    // Process all campaigns in batches with proper cursor handling
    console.log("Fetching campaigns from Meta API...");
    console.time("campaigns-fetch");

    let processedCampaigns = [];
    let activeCampaignIds = [];
    let totalProcessed = 0;
    let hasMore = true;

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
          limit: batchSize,
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
            // Check if this campaign had activity in the last 24 hours
            console.log(`Checking activity for campaign ${campaign.id}...`);
            const campaignInsights = await campaign.getInsights(
              ["impressions", "clicks", "spend"],
              {
                time_range: dateRange,
                level: "campaign",
                breakdowns: [],
              }
            );

            // Check if the campaign had any activity
            const campaignHasActivity =
              campaignInsights &&
              campaignInsights.length > 0 &&
              (safeParseInt(campaignInsights[0]?.impressions) > 0 ||
                safeParseInt(campaignInsights[0]?.clicks) > 0 ||
                safeParseFloat(campaignInsights[0]?.spend) > 0);

            console.log(
              `Campaign ${campaign.id} activity: ${
                campaignHasActivity ? "Active" : "Inactive"
              }, impressions=${
                campaignInsights?.[0]?.impressions || 0
              }, clicks=${campaignInsights?.[0]?.clicks || 0}, spend=${
                campaignInsights?.[0]?.spend || 0
              }`
            );

            if (!campaignHasActivity) {
              console.log(
                `Skipping campaign ${campaign.id} - no activity in last 24 hours`
              );
              totalProcessed++;
              continue;
            }

            // Remember this campaign had activity
            activeCampaignIds.push(campaign.id);

            // Create campaign object with insights data
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
              // Add metrics from insights
              impressions: safeParseInt(campaignInsights?.[0]?.impressions),
              clicks: safeParseInt(campaignInsights?.[0]?.clicks),
              spend: safeParseFloat(campaignInsights?.[0]?.spend),
              last_updated: new Date(),
            };

            // Save to Supabase
            console.log(`Storing campaign ${campaign.id} to Supabase...`);
            const { error: upsertError } = await supabase
              .from("meta_campaigns_duplicate")
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
            await delay(500);
            totalProcessed++;
          } catch (campaignError) {
            logError(campaignError, `processing campaign ${campaign.id}`);
            totalProcessed++;
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
      `Successfully processed ${processedCampaigns.length} active campaigns out of ${totalProcessed} total`
    );

    // Return success response
    console.log("Generating response");
    const response = NextResponse.json({
      result: {
        campaigns: processedCampaigns,
        activeCampaignIds,
        total: processedCampaigns.length,
        processed: totalProcessed,
        hasMore: hasMore && totalProcessed >= maxCampaigns,
        dateRange,
      },
      success: true,
      message: `Found ${processedCampaigns.length} campaigns with activity in the last 24 hours`,
    });

    console.log("Response object created");
    console.timeEnd("total-request-time");
    return response;
  } catch (error) {
    logError(error, "Simplified Daily Campaigns API");
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
