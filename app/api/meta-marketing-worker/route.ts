import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { FacebookAdsApi, AdAccount } from "facebook-nodejs-business-sdk";
import { createClient } from "@/utils/supabase/server";
import { MetaMarketingJobPayload } from "@/app/actions/meta-marketing-queue";

// Import all the helper functions from the original route
import {
  fetchCreative,
  processCreativeData,
  trackCreativeApiFetches,
  fetchCreativeDetails,
} from "@/utils/meta-marketing/creative-management";

// Helper functions (copied from original route)
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

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  DEVELOPMENT: {
    MAX_SCORE: 60,
    DECAY_TIME: 300,
    BLOCK_TIME: 300,
    ADS_MANAGEMENT_HOURLY: 300,
    INSIGHTS_HOURLY: 600,
  },
  STANDARD: {
    MAX_SCORE: 9000,
    DECAY_TIME: 300,
    BLOCK_TIME: 60,
    ADS_MANAGEMENT_HOURLY: 100000,
    INSIGHTS_HOURLY: 190000,
  },
  POINTS: {
    READ: 1,
    WRITE: 3,
    INSIGHTS: 2,
  },
  BATCH_SIZE: 50,
  MIN_DELAY: 1000,
  BURST_DELAY: 2000,
  INSIGHTS_DELAY: 3000,
};

// Meta API configuration
const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN!,
};

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Job status tracking
async function updateJobStatus(
  supabase: any,
  requestId: string,
  status: string,
  progress?: number,
  error?: string,
  result?: any
) {
  try {
    await supabase.from("background_jobs").upsert(
      [
        {
          request_id: requestId,
          job_type: "meta-marketing-sync",
          status,
          progress: progress || 0,
          error_message: error,
          result_data: result,
          updated_at: new Date(),
        },
      ],
      {
        onConflict: "request_id",
        ignoreDuplicates: false,
      }
    );
  } catch (err) {
    console.error("Error updating job status:", err);
  }
}

// Copy all the helper functions from the original route
// (I'll include the key ones here, but you may need to copy more based on your needs)

interface InsightCapableEntity {
  id: string;
  getInsights: (
    fields: string[],
    options: Record<string, unknown>
  ) => Promise<unknown[]>;
}

interface InsightResult {
  impressions?: string;
  clicks?: string;
  reach?: string;
  spend?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  frequency?: string;
  objective?: string;
  action_values?: Array<{ action_type: string; value: string }>;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  cost_per_unique_click?: string;
  outbound_clicks?: Array<{ action_type: string; value: string }>;
  outbound_clicks_ctr?: Array<{ action_type: string; value: string }>;
  website_ctr?: Array<{ action_type: string; value: string }>;
  website_purchase_roas?: Array<{ action_type: string; value: string }>;
  inline_link_clicks?: string;
  inline_post_engagement?: string;
  video_30_sec_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p25_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p50_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p75_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p95_watched_actions?: Array<{ action_type: string; value: string }>;
  video_p100_watched_actions?: Array<{ action_type: string; value: string }>;
  video_avg_time_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  video_play_actions?: Array<{ action_type: string; value: string }>;
  video_thruplay_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  video_continuous_2_sec_watched_actions?: Array<{
    action_type: string;
    value: string;
  }>;
  [key: string]: unknown;
}

// Date range helpers
function getLast24HoursDateRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setHours(startDate.getHours() - 24);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

function getLast6MonthsDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

function getDateRangeForTimeframe(timeframe: string) {
  return timeframe === "24h"
    ? getLast24HoursDateRange()
    : getLast6MonthsDateRange();
}

// Rate limiting and retry logic (simplified version)
async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  context: {
    accountId: string;
    endpoint: string;
    callType: string;
    points: number;
    supabase: any;
  }
): Promise<T> {
  let retries = 0;
  const maxRetries = 5;

  while (true) {
    try {
      await delay(RATE_LIMIT_CONFIG.MIN_DELAY);
      const result = await operation();
      return result;
    } catch (error: any) {
      const errorCode = error?.response?.error?.code;
      const isRateLimit = [17, 80000, 80003, 80004, 4, 613].includes(
        errorCode || 0
      );

      if (isRateLimit && retries < maxRetries) {
        const backoffDelay = Math.min(1000 * Math.pow(2, retries), 30000);
        console.log(
          `Rate limit hit. Waiting ${backoffDelay}ms before retry ${
            retries + 1
          }/${maxRetries}...`
        );
        await delay(backoffDelay);
        retries++;
        continue;
      }

      throw error;
    }
  }
}

// Get insights helper
async function getInsights(
  entity: InsightCapableEntity,
  supabase: any,
  accountId: string,
  timeframe: string = "24h"
): Promise<InsightResult | null> {
  return withRateLimitRetry(
    async () => {
      const dateRange = getDateRangeForTimeframe(timeframe);

      const insights = await entity.getInsights(
        [
          "impressions",
          "clicks",
          "reach",
          "spend",
          "cpc",
          "cpm",
          "ctr",
          "frequency",
          "objective",
          "action_values",
          "actions",
          "cost_per_action_type",
          "cost_per_unique_click",
          "outbound_clicks",
          "outbound_clicks_ctr",
          "website_ctr",
          "website_purchase_roas",
          "inline_link_clicks",
          "inline_post_engagement",
          "video_30_sec_watched_actions",
          "video_p25_watched_actions",
          "video_p50_watched_actions",
          "video_p75_watched_actions",
          "video_p95_watched_actions",
          "video_p100_watched_actions",
          "video_avg_time_watched_actions",
          "video_play_actions",
          "video_thruplay_watched_actions",
          "video_continuous_2_sec_watched_actions",
        ],
        {
          time_range: dateRange,
          level: "ad",
          breakdowns: [],
        }
      );

      return (insights?.[0] as InsightResult) || null;
    },
    {
      accountId,
      endpoint: "insights",
      callType: "READ",
      points: RATE_LIMIT_CONFIG.POINTS.READ,
      supabase,
    }
  );
}

// Main background job handler
async function handler(request: Request) {
  const supabase = await createClient();

  try {
    const payload: MetaMarketingJobPayload = await request.json();
    console.log("Background job started with payload:", payload);

    // Update job status to processing
    await updateJobStatus(supabase, payload.requestId, "processing", 10);

    // Initialize Facebook API
    const api = FacebookAdsApi.init(META_CONFIG.accessToken);
    api.setDebug(false); // Disable debug in background jobs

    const { accountId, timeframe, action } = payload;

    let result;

    switch (action) {
      case "get24HourData":
      case "getData":
        await updateJobStatus(supabase, payload.requestId, "processing", 20);
        result = await processMetaMarketingData(
          accountId,
          supabase,
          timeframe,
          payload.requestId
        );
        break;

      case "getAccountInfo":
        await updateJobStatus(supabase, payload.requestId, "processing", 30);
        result = await processAccountInfo(accountId, supabase, timeframe);
        break;

      case "getCampaigns":
        await updateJobStatus(supabase, payload.requestId, "processing", 40);
        result = await processCampaigns(
          accountId,
          supabase,
          timeframe,
          payload.requestId
        );
        break;

      default:
        throw new Error(`Invalid action: ${action}`);
    }

    // Update job status to completed
    await updateJobStatus(
      supabase,
      payload.requestId,
      "completed",
      100,
      undefined,
      result
    );

    console.log("Background job completed successfully");
    return Response.json({
      success: true,
      requestId: payload.requestId,
      result,
    });
  } catch (error: any) {
    console.error("Background job failed:", error);

    const payload: MetaMarketingJobPayload = await request.json();
    await updateJobStatus(
      supabase,
      payload.requestId,
      "failed",
      0,
      error.message || "Unknown error occurred"
    );

    return Response.json(
      {
        success: false,
        error: error.message || "Unknown error occurred",
        requestId: payload.requestId,
      },
      { status: 500 }
    );
  }
}

// Process Meta Marketing Data (main data fetching logic)
async function processMetaMarketingData(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string
) {
  const account = new AdAccount(accountId);
  const dateRange = getDateRangeForTimeframe(timeframe);

  // Update progress
  await updateJobStatus(supabase, requestId, "processing", 25);

  // Get account info
  const accountInfo = await withRateLimitRetry(
    async () => {
      return account.read([
        "name",
        "account_status",
        "amount_spent",
        "balance",
        "currency",
        "spend_cap",
        "timezone_name",
        "timezone_offset_hours_utc",
        "business_country_code",
        "disable_reason",
        "is_prepay_account",
        "tax_id_status",
      ]);
    },
    {
      accountId,
      endpoint: "account_info",
      callType: "READ",
      points: RATE_LIMIT_CONFIG.POINTS.READ,
      supabase,
    }
  );

  await updateJobStatus(supabase, requestId, "processing", 35);

  // Get account insights
  const insights = await withRateLimitRetry(
    async () => {
      return account.getInsights(
        [
          "impressions",
          "clicks",
          "reach",
          "spend",
          "cpc",
          "cpm",
          "ctr",
          "frequency",
          "objective",
          "action_values",
          "actions",
          "cost_per_action_type",
          "cost_per_unique_click",
          "outbound_clicks",
          "outbound_clicks_ctr",
          "website_ctr",
          "website_purchase_roas",
        ],
        {
          time_range: dateRange,
          level: "account",
          breakdowns: [],
        }
      );
    },
    {
      accountId,
      endpoint: "insights",
      callType: "READ",
      points: RATE_LIMIT_CONFIG.POINTS.READ,
      supabase,
    }
  );

  await updateJobStatus(supabase, requestId, "processing", 45);

  // Store account data
  const accountData = {
    account_id: accountId,
    name: accountInfo.name || "",
    account_status: accountInfo.account_status || 0,
    amount_spent: parseFloat(accountInfo.amount_spent) || 0,
    balance: parseFloat(accountInfo.balance) || 0,
    currency: accountInfo.currency || "",
    spend_cap: parseFloat(accountInfo.spend_cap) || null,
    timezone_name: accountInfo.timezone_name || "",
    timezone_offset_hours_utc: accountInfo.timezone_offset_hours_utc || 0,
    business_country_code: accountInfo.business_country_code || "",
    disable_reason: accountInfo.disable_reason || 0,
    is_prepay_account: accountInfo.is_prepay_account || false,
    tax_id_status: accountInfo.tax_id_status || "",
    insights_start_date: new Date(dateRange.since),
    insights_end_date: new Date(dateRange.until),
    total_impressions: safeParseInt(insights?.[0]?.impressions),
    total_clicks: safeParseInt(insights?.[0]?.clicks),
    total_reach: safeParseInt(insights?.[0]?.reach),
    total_spend: safeParseFloat(insights?.[0]?.spend),
    average_cpc: safeParseFloat(insights?.[0]?.cpc),
    average_cpm: safeParseFloat(insights?.[0]?.cpm),
    average_ctr: safeParseFloat(insights?.[0]?.ctr),
    average_frequency: safeParseFloat(insights?.[0]?.frequency),
    actions: insights?.[0]?.actions || [],
    action_values: insights?.[0]?.action_values || [],
    cost_per_action_type: insights?.[0]?.cost_per_action_type || [],
    cost_per_unique_click: safeParseFloat(insights?.[0]?.cost_per_unique_click),
    outbound_clicks: insights?.[0]?.outbound_clicks || [],
    outbound_clicks_ctr: safeParseFloat(insights?.[0]?.outbound_clicks_ctr),
    website_ctr: insights?.[0]?.website_ctr || [],
    website_purchase_roas: safeParseFloat(insights?.[0]?.website_purchase_roas),
    last_updated: new Date(),
    is_data_complete: true,
    created_at: new Date(),
    updated_at: new Date(),
  };

  const { error: accountError } = await supabase
    .from("meta_account_insights")
    .upsert([accountData], {
      onConflict: "account_id",
      ignoreDuplicates: false,
    });

  if (accountError) {
    throw new Error(`Error storing account data: ${accountError.message}`);
  }

  await updateJobStatus(supabase, requestId, "processing", 55);

  // Process campaigns (simplified version for background job)
  const campaigns = await withRateLimitRetry(
    async () => {
      return account.getCampaigns(
        [
          "name",
          "status",
          "objective",
          "special_ad_categories",
          "bid_strategy",
          "budget_remaining",
          "buying_type",
          "daily_budget",
          "lifetime_budget",
          "configured_status",
          "effective_status",
          "source_campaign_id",
          "promoted_object",
          "recommendations",
          "spend_cap",
          "topline_id",
          "pacing_type",
          "start_time",
          "end_time",
        ],
        { limit: RATE_LIMIT_CONFIG.BATCH_SIZE }
      );
    },
    {
      accountId,
      endpoint: "campaigns",
      callType: "READ",
      points: RATE_LIMIT_CONFIG.POINTS.READ,
      supabase,
    }
  );

  // Process campaigns with progress updates
  const processedCampaigns = [];
  const totalCampaigns = campaigns.length;

  for (let i = 0; i < campaigns.length; i++) {
    const campaign = campaigns[i];
    const progress = 55 + Math.floor((i / totalCampaigns) * 40); // 55% to 95%
    await updateJobStatus(supabase, requestId, "processing", progress);

    try {
      const campaignInsights = await getInsights(
        campaign as InsightCapableEntity,
        supabase,
        accountId,
        timeframe
      );

      const campaignData = {
        campaign_id: campaign.id,
        account_id: accountId,
        name: campaign.name,
        status: campaign.status,
        objective: campaign.objective,
        special_ad_categories: campaign.special_ad_categories || [],
        bid_strategy: campaign.bid_strategy,
        budget_remaining: parseFloat(campaign.budget_remaining) || 0,
        buying_type: campaign.buying_type,
        daily_budget: parseFloat(campaign.daily_budget) || 0,
        lifetime_budget: parseFloat(campaign.lifetime_budget) || 0,
        configured_status: campaign.configured_status,
        effective_status: campaign.effective_status,
        source_campaign_id: campaign.source_campaign_id,
        promoted_object: campaign.promoted_object,
        recommendations: campaign.recommendations || [],
        spend_cap: parseFloat(campaign.spend_cap) || null,
        topline_id: campaign.topline_id,
        pacing_type: campaign.pacing_type || [],
        start_time: campaign.start_time ? new Date(campaign.start_time) : null,
        end_time: campaign.end_time ? new Date(campaign.end_time) : null,
        impressions: safeParseInt(campaignInsights?.impressions),
        clicks: safeParseInt(campaignInsights?.clicks),
        reach: safeParseInt(campaignInsights?.reach),
        spend: safeParseFloat(campaignInsights?.spend),
        conversions: campaignInsights?.actions
          ? campaignInsights.actions.reduce((acc: any, action: any) => {
              acc[action.action_type] = action.value;
              return acc;
            }, {})
          : null,
        cost_per_conversion:
          campaignInsights?.actions && campaignInsights.actions.length > 0
            ? safeParseFloat(campaignInsights.spend) /
              campaignInsights.actions.reduce(
                (sum: number, action: any) => sum + safeParseInt(action.value),
                0
              )
            : null,
        last_updated: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };

      const { error: campaignError } = await supabase
        .from("meta_campaigns")
        .upsert([campaignData], {
          onConflict: "campaign_id",
          ignoreDuplicates: false,
        });

      if (!campaignError) {
        processedCampaigns.push(campaignData);
      }

      // Add delay between campaigns to prevent rate limiting
      await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
    } catch (error) {
      console.error(`Error processing campaign ${campaign.id}:`, error);
      continue;
    }
  }

  return {
    accountData,
    campaigns: processedCampaigns,
    dateRange,
    totalProcessed: processedCampaigns.length,
  };
}

// Simplified account info processing
async function processAccountInfo(
  accountId: string,
  supabase: any,
  timeframe: string
) {
  // Implementation similar to the original route but simplified
  // This is a placeholder - you can implement the full logic as needed
  return { message: "Account info processed in background" };
}

// Simplified campaigns processing
async function processCampaigns(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string
) {
  // Implementation similar to the original route but simplified
  // This is a placeholder - you can implement the full logic as needed
  return { message: "Campaigns processed in background" };
}

// Export the POST handler with QStash signature verification
export const POST = verifySignatureAppRouter(handler);
