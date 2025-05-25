import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { FacebookAdsApi, AdAccount } from "facebook-nodejs-business-sdk";
import { createClient } from "@/utils/supabase/server";
import { MetaMarketingJobPayload } from "@/app/actions/meta-marketing-queue";
import { Client } from "@upstash/qstash";

// Initialize QStash client for creating follow-up jobs
const qstashClient = new Client({
  token: process.env.QSTASH_TOKEN!,
});

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
  BATCH_SIZE: 5, // Further reduced batch size for more aggressive chunking
  MIN_DELAY: 500, // Reduced delay for faster processing
  BURST_DELAY: 1000, // Reduced burst delay
  INSIGHTS_DELAY: 1500, // Reduced insights delay
  MAX_PROCESSING_TIME: 60000, // 60 seconds to stay well under Vercel limit
  SAFETY_BUFFER: 10000, // 10 second safety buffer
};

// Meta API configuration
const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN!,
};

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Time management helper
function shouldCreateFollowUpJob(startTime: number): boolean {
  const elapsedTime = Date.now() - startTime;
  return (
    elapsedTime >
    RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME - RATE_LIMIT_CONFIG.SAFETY_BUFFER
  );
}

function getRemainingTime(startTime: number): number {
  const elapsedTime = Date.now() - startTime;
  return Math.max(0, RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME - elapsedTime);
}

// Extended job payload for chunked processing
interface ChunkedJobPayload extends MetaMarketingJobPayload {
  phase?: string; // 'account' | 'campaigns' | 'adsets' | 'ads'
  campaignIds?: string[];
  adsetIds?: string[];
  offset?: number;
  totalItems?: number;
  processedItems?: number;
  accountInfo?: string; // JSON string for passing account info between phases
}

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
    console.log(
      `Updating job status: ${requestId} -> ${status} (${progress}%)`
    );

    const updateData: any = {
      request_id: requestId,
      job_type: "meta-marketing-sync",
      status,
      progress: progress || 0,
      error_message: error,
      result_data: result,
      updated_at: new Date().toISOString(),
    };

    // If this is the first update, include created_at
    if (status === "processing" && progress === 10) {
      updateData.created_at = new Date().toISOString();
    }

    console.log("Update data:", updateData);

    const { data, error: updateError } = await supabase
      .from("background_jobs")
      .upsert([updateData], {
        onConflict: "request_id",
        ignoreDuplicates: false,
      })
      .select();

    if (updateError) {
      console.error("Supabase update error:", updateError);
      throw updateError;
    }

    console.log("Job status updated successfully:", data);
  } catch (err) {
    console.error("Error updating job status:", err);
    console.error("Error details:", {
      requestId,
      status,
      progress,
      error,
      supabaseError: err,
    });
    // Don't throw here to prevent the main job from failing due to status update issues
  }
}

// Create follow-up job for next phase
async function createFollowUpJob(payload: ChunkedJobPayload) {
  try {
    const baseUrl =
      process.env.WEBHOOK_BASE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.NEXTAUTH_URL || "http://localhost:3000");

    const webhookUrl = `${baseUrl}/api/meta-marketing-worker`;

    console.log("Creating follow-up job:", payload);

    const response = await qstashClient.publishJSON({
      url: webhookUrl,
      body: payload,
      retries: 3,
      delay: 2, // 2 seconds delay between chunks
      headers: {
        "Content-Type": "application/json",
        "X-Job-Type": "meta-marketing-sync-chunk",
        "X-Request-ID": payload.requestId,
        "X-Phase": payload.phase || "unknown",
      },
    });

    console.log("Follow-up job created:", response.messageId);
    return response;
  } catch (error) {
    console.error("Error creating follow-up job:", error);
    throw error;
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

// Main background job handler with chunked processing
async function handler(request: Request) {
  const supabase = await createClient();
  const startTime = Date.now();

  try {
    console.log("=== QStash Worker Started ===");
    console.log(
      "Request headers:",
      Object.fromEntries(request.headers.entries())
    );

    const payload: ChunkedJobPayload = await request.json();
    console.log("Background job started with payload:", payload);

    // Validate required environment variables
    if (!process.env.META_ACCESS_TOKEN) {
      throw new Error("META_ACCESS_TOKEN environment variable is not set");
    }

    // Initialize Facebook API
    console.log("Initializing Facebook API...");
    const api = FacebookAdsApi.init(META_CONFIG.accessToken);
    api.setDebug(false); // Disable debug in background jobs
    console.log("Facebook API initialized");

    const { accountId, timeframe, action, phase = "account" } = payload;

    let result;

    console.log(`Processing phase: ${phase} for account: ${accountId}`);

    // Process based on phase for chunked execution
    switch (phase) {
      case "account":
        await updateJobStatus(supabase, payload.requestId, "processing", 10);
        result = await processAccountPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          startTime
        );
        break;

      case "campaigns":
        result = await processCampaignsPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          payload.offset || 0,
          startTime
        );
        break;

      case "adsets":
        result = await processAdsetsPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          payload.campaignIds || [],
          payload.offset || 0,
          startTime
        );
        break;

      case "ads":
        result = await processAdsPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          payload.adsetIds || [],
          payload.offset || 0,
          startTime
        );
        break;

      default:
        // Legacy support for non-chunked jobs
        if (action === "get24HourData" || action === "getData") {
          await updateJobStatus(supabase, payload.requestId, "processing", 10);
          result = await processAccountPhase(
            accountId,
            supabase,
            timeframe,
            payload.requestId,
            startTime
          );
        } else {
          throw new Error(`Invalid action/phase: ${action}/${phase}`);
        }
    }

    console.log("=== Background job phase completed successfully ===");
    return Response.json({
      success: true,
      requestId: payload.requestId,
      phase,
      result,
    });
  } catch (error: any) {
    console.error("=== Background job failed ===");
    console.error("Error details:", error);
    console.error("Error stack:", error.stack);

    try {
      const payload: ChunkedJobPayload = await request.json();
      console.log("Updating job status to failed...");
      await updateJobStatus(
        supabase,
        payload.requestId,
        "failed",
        0,
        error.message || "Unknown error occurred"
      );
      console.log("Job status updated to failed");
    } catch (parseError) {
      console.error(
        "Could not parse request payload for error handling:",
        parseError
      );
    }

    return Response.json(
      {
        success: false,
        error: error.message || "Unknown error occurred",
        requestId: "unknown",
      },
      { status: 500 }
    );
  }
}

// Process account phase (account info + start campaigns)
async function processAccountPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  startTime: number
) {
  const account = new AdAccount(accountId);
  const dateRange = getDateRangeForTimeframe(timeframe);

  console.log("Processing account phase...");
  console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

  // Update progress
  await updateJobStatus(supabase, requestId, "processing", 15);

  // Check time before proceeding
  if (shouldCreateFollowUpJob(startTime)) {
    console.log("Time limit approaching, creating follow-up job immediately");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "account",
      offset: 0,
    });
    return { phase: "account", status: "deferred_due_to_time_limit" };
  }

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

  await updateJobStatus(supabase, requestId, "processing", 25);

  // Check time again
  if (shouldCreateFollowUpJob(startTime)) {
    console.log(
      "Time limit approaching after account info, creating follow-up job"
    );
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "account-insights",
      accountInfo: JSON.stringify(accountInfo),
    });
    return { phase: "account", status: "partial_completion", accountInfo };
  }

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

  await updateJobStatus(supabase, requestId, "processing", 35);

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

  console.log("Account data stored successfully");
  console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

  // Always create follow-up job for campaigns to ensure we don't timeout
  console.log("Account phase completed, creating follow-up job for campaigns");
  await updateJobStatus(supabase, requestId, "processing", 40);

  await createFollowUpJob({
    accountId,
    timeframe,
    action: "get24HourData",
    requestId,
    phase: "campaigns",
    offset: 0,
  });

  console.log("Campaigns phase job created");

  return {
    accountData,
    phase: "account",
    nextPhase: "campaigns",
    remainingTime: getRemainingTime(startTime),
  };
}

// Process campaigns phase
async function processCampaignsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  offset: number,
  startTime: number
) {
  console.log(`Processing campaigns phase, offset: ${offset}`);
  console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

  const account = new AdAccount(accountId);

  // Check time before starting
  if (shouldCreateFollowUpJob(startTime)) {
    console.log("Time limit approaching, creating follow-up job immediately");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "campaigns",
      offset: offset,
    });
    return { phase: "campaigns", status: "deferred_due_to_time_limit", offset };
  }

  // Get campaigns with pagination
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
        {
          limit: RATE_LIMIT_CONFIG.BATCH_SIZE,
          offset: offset,
        }
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

  console.log(`Retrieved ${campaigns.length} campaigns`);

  // Process campaigns with aggressive time checking
  const processedCampaigns = [];
  const campaignIds = [];

  for (let i = 0; i < campaigns.length; i++) {
    // Check time limit more frequently
    if (shouldCreateFollowUpJob(startTime)) {
      console.log(
        `Time limit reached after processing ${i} campaigns, creating follow-up job`
      );
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "campaigns",
        offset: offset + i,
      });
      break;
    }

    const campaign = campaigns[i];
    const progress =
      40 +
      Math.floor(((offset + i) / Math.max(1, campaigns.length + offset)) * 20); // 40% to 60%
    await updateJobStatus(supabase, requestId, "processing", progress);

    console.log(
      `Processing campaign ${i + 1}/${
        campaigns.length
      }, remaining time: ${getRemainingTime(startTime)}ms`
    );

    try {
      // Skip insights for campaigns if we're running low on time
      let campaignInsights = null;
      if (getRemainingTime(startTime) > 20000) {
        // Only get insights if we have more than 20 seconds
        campaignInsights = await getInsights(
          campaign as InsightCapableEntity,
          supabase,
          accountId,
          timeframe
        );
      } else {
        console.log("Skipping insights due to time constraints");
      }

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
        campaignIds.push(campaign.id);
      }

      // Reduced delay to process faster
      await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
    } catch (error) {
      console.error(`Error processing campaign ${campaign.id}:`, error);
      continue;
    }
  }

  console.log(`Processed ${processedCampaigns.length} campaigns`);

  // Determine next action based on what we processed
  const totalProcessed = offset + processedCampaigns.length;

  // If we processed all campaigns in this batch and there might be more
  if (
    campaigns.length === RATE_LIMIT_CONFIG.BATCH_SIZE &&
    processedCampaigns.length === campaigns.length
  ) {
    console.log("Creating follow-up job for next batch of campaigns");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "campaigns",
      offset: totalProcessed,
    });
  } else {
    // All campaigns processed, move to adsets phase
    console.log("All campaigns processed, starting adsets phase");
    await updateJobStatus(supabase, requestId, "processing", 60);

    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "adsets",
      campaignIds: campaignIds,
      offset: 0,
    });
  }

  return {
    processedCampaigns: processedCampaigns.length,
    campaignIds,
    phase: "campaigns",
    offset: totalProcessed,
    remainingTime: getRemainingTime(startTime),
  };
}

// Process adsets phase (implement similar chunking logic)
async function processAdsetsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  campaignIds: string[],
  offset: number,
  startTime: number
) {
  console.log(
    `Processing adsets phase for campaigns: ${campaignIds.length}, offset: ${offset}`
  );
  console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

  // Check time before starting
  if (shouldCreateFollowUpJob(startTime)) {
    console.log("Time limit approaching, creating follow-up job immediately");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "adsets",
      campaignIds,
      offset: offset,
    });
    return { phase: "adsets", status: "deferred_due_to_time_limit", offset };
  }

  // Update progress
  await updateJobStatus(supabase, requestId, "processing", 70);

  const account = new AdAccount(accountId);
  const processedAdsets = [];
  const adsetIds = [];

  // Process campaigns in small batches to get their adsets
  const campaignsToProcess = campaignIds.slice(
    offset,
    offset + RATE_LIMIT_CONFIG.BATCH_SIZE
  );

  for (let i = 0; i < campaignsToProcess.length; i++) {
    // Check time limit frequently
    if (shouldCreateFollowUpJob(startTime)) {
      console.log(
        `Time limit reached after processing ${i} campaigns for adsets`
      );
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "adsets",
        campaignIds,
        offset: offset + i,
      });
      break;
    }

    const campaignId = campaignsToProcess[i];
    console.log(
      `Getting adsets for campaign ${campaignId}, remaining time: ${getRemainingTime(
        startTime
      )}ms`
    );

    try {
      // Get adsets for this campaign
      const adsets = await withRateLimitRetry(
        async () => {
          const campaign =
            new (require("facebook-nodejs-business-sdk").Campaign)(campaignId);
          return campaign.getAdSets(
            [
              "name",
              "status",
              "configured_status",
              "effective_status",
              "optimization_goal",
              "billing_event",
              "bid_amount",
              "budget_remaining",
              "daily_budget",
              "lifetime_budget",
              "targeting",
              "start_time",
              "end_time",
              "created_time",
              "updated_time",
            ],
            { limit: 50 }
          );
        },
        {
          accountId,
          endpoint: "adsets",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      console.log(
        `Retrieved ${adsets.length} adsets for campaign ${campaignId}`
      );

      // Process each adset
      for (const adset of adsets) {
        // Check time for each adset
        if (shouldCreateFollowUpJob(startTime)) {
          console.log("Time limit reached during adset processing");
          break;
        }

        try {
          // Skip insights if running low on time
          let adsetInsights = null;
          if (getRemainingTime(startTime) > 15000) {
            // Only get insights if we have more than 15 seconds
            adsetInsights = await getInsights(
              adset as InsightCapableEntity,
              supabase,
              accountId,
              timeframe
            );
          } else {
            console.log("Skipping adset insights due to time constraints");
          }

          const adsetData = {
            adset_id: adset.id,
            campaign_id: campaignId,
            account_id: accountId,
            name: adset.name,
            status: adset.status,
            configured_status: adset.configured_status,
            effective_status: adset.effective_status,
            optimization_goal: adset.optimization_goal,
            billing_event: adset.billing_event,
            bid_amount: parseFloat(adset.bid_amount) || 0,
            budget_remaining: parseFloat(adset.budget_remaining) || 0,
            daily_budget: parseFloat(adset.daily_budget) || 0,
            lifetime_budget: parseFloat(adset.lifetime_budget) || 0,
            targeting: adset.targeting || {},
            start_time: adset.start_time ? new Date(adset.start_time) : null,
            end_time: adset.end_time ? new Date(adset.end_time) : null,
            created_time: adset.created_time
              ? new Date(adset.created_time)
              : null,
            updated_time: adset.updated_time
              ? new Date(adset.updated_time)
              : null,
            impressions: safeParseInt(adsetInsights?.impressions),
            clicks: safeParseInt(adsetInsights?.clicks),
            reach: safeParseInt(adsetInsights?.reach),
            spend: safeParseFloat(adsetInsights?.spend),
            last_updated: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          };

          const { error: adsetError } = await supabase
            .from("meta_ad_sets")
            .upsert([adsetData], {
              onConflict: "adset_id",
              ignoreDuplicates: false,
            });

          if (!adsetError) {
            processedAdsets.push(adsetData);
            adsetIds.push(adset.id);
          }

          await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
        } catch (error) {
          console.error(`Error processing adset ${adset.id}:`, error);
          continue;
        }
      }

      await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
    } catch (error) {
      console.error(`Error getting adsets for campaign ${campaignId}:`, error);
      continue;
    }
  }

  console.log(`Processed ${processedAdsets.length} adsets`);

  // Determine next action
  const totalProcessed = offset + campaignsToProcess.length;

  if (totalProcessed < campaignIds.length) {
    // More campaigns to process for adsets
    console.log("Creating follow-up job for next batch of campaigns (adsets)");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "adsets",
      campaignIds,
      offset: totalProcessed,
    });
  } else {
    // All adsets processed, move to ads phase
    console.log("All adsets processed, starting ads phase");
    await updateJobStatus(supabase, requestId, "processing", 80);

    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "ads",
      adsetIds: adsetIds,
      offset: 0,
    });
  }

  return {
    processedAdsets: processedAdsets.length,
    adsetIds,
    phase: "adsets",
    offset: totalProcessed,
    remainingTime: getRemainingTime(startTime),
  };
}

// Process ads phase (implement similar chunking logic)
async function processAdsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  adsetIds: string[],
  offset: number,
  startTime: number
) {
  console.log(
    `Processing ads phase for adsets: ${adsetIds.length}, offset: ${offset}`
  );
  console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

  // Check time before starting
  if (shouldCreateFollowUpJob(startTime)) {
    console.log("Time limit approaching, creating follow-up job immediately");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "ads",
      adsetIds,
      offset: offset,
    });
    return { phase: "ads", status: "deferred_due_to_time_limit", offset };
  }

  // Update progress
  await updateJobStatus(supabase, requestId, "processing", 90);

  const processedAds = [];

  // Process adsets in small batches to get their ads
  const adsetsToProcess = adsetIds.slice(
    offset,
    offset + RATE_LIMIT_CONFIG.BATCH_SIZE
  );

  for (let i = 0; i < adsetsToProcess.length; i++) {
    // Check time limit frequently
    if (shouldCreateFollowUpJob(startTime)) {
      console.log(`Time limit reached after processing ${i} adsets for ads`);
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "ads",
        adsetIds,
        offset: offset + i,
      });
      break;
    }

    const adsetId = adsetsToProcess[i];
    console.log(
      `Getting ads for adset ${adsetId}, remaining time: ${getRemainingTime(
        startTime
      )}ms`
    );

    try {
      // Get ads for this adset
      const ads = await withRateLimitRetry(
        async () => {
          const adset = new (require("facebook-nodejs-business-sdk").AdSet)(
            adsetId
          );
          return adset.getAds(
            [
              "name",
              "status",
              "configured_status",
              "effective_status",
              "creative",
              "tracking_specs",
              "conversion_specs",
              "bid_amount",
              "created_time",
              "updated_time",
            ],
            { limit: 50 }
          );
        },
        {
          accountId,
          endpoint: "ads",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      console.log(`Retrieved ${ads.length} ads for adset ${adsetId}`);

      // Process each ad
      for (const ad of ads) {
        // Check time for each ad
        if (shouldCreateFollowUpJob(startTime)) {
          console.log("Time limit reached during ad processing");
          break;
        }

        try {
          // Skip insights if running low on time
          let adInsights = null;
          if (getRemainingTime(startTime) > 10000) {
            // Only get insights if we have more than 10 seconds
            adInsights = await getInsights(
              ad as InsightCapableEntity,
              supabase,
              accountId,
              timeframe
            );
          } else {
            console.log("Skipping ad insights due to time constraints");
          }

          const adData = {
            ad_id: ad.id,
            adset_id: adsetId,
            account_id: accountId,
            name: ad.name,
            status: ad.status,
            configured_status: ad.configured_status,
            effective_status: ad.effective_status,
            creative: ad.creative || {},
            tracking_specs: ad.tracking_specs || [],
            conversion_specs: ad.conversion_specs || [],
            bid_amount: parseFloat(ad.bid_amount) || 0,
            created_time: ad.created_time ? new Date(ad.created_time) : null,
            updated_time: ad.updated_time ? new Date(ad.updated_time) : null,
            impressions: safeParseInt(adInsights?.impressions),
            clicks: safeParseInt(adInsights?.clicks),
            reach: safeParseInt(adInsights?.reach),
            spend: safeParseFloat(adInsights?.spend),
            last_updated: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          };

          const { error: adError } = await supabase
            .from("meta_ads")
            .upsert([adData], {
              onConflict: "ad_id",
              ignoreDuplicates: false,
            });

          if (!adError) {
            processedAds.push(adData);
          }

          await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
        } catch (error) {
          console.error(`Error processing ad ${ad.id}:`, error);
          continue;
        }
      }

      await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
    } catch (error) {
      console.error(`Error getting ads for adset ${adsetId}:`, error);
      continue;
    }
  }

  console.log(`Processed ${processedAds.length} ads`);

  // Determine next action
  const totalProcessed = offset + adsetsToProcess.length;

  if (totalProcessed < adsetIds.length) {
    // More adsets to process for ads
    console.log("Creating follow-up job for next batch of adsets (ads)");
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "ads",
      adsetIds,
      offset: totalProcessed,
    });
  } else {
    // All ads processed, mark as completed
    console.log("All ads processed, marking job as completed");
    await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
      message: "All phases completed successfully",
      totalPhases: 4,
      processedAds: processedAds.length,
      summary: {
        totalProcessed: processedAds.length,
        completedAt: new Date().toISOString(),
      },
    });
  }

  return {
    processedAds: processedAds.length,
    phase: "ads",
    offset: totalProcessed,
    remainingTime: getRemainingTime(startTime),
    completed: totalProcessed >= adsetIds.length,
  };
}

// Export the POST handler with QStash signature verification
export const POST = verifySignatureAppRouter(handler);
