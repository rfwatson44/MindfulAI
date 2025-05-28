import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import {
  FacebookAdsApi,
  AdAccount,
  Campaign,
  AdSet,
} from "facebook-nodejs-business-sdk";
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
  BATCH_SIZE: 100, // Significantly increased from 25 to 100 for much better throughput
  MIN_DELAY: 100, // Reduced delay for faster processing
  BURST_DELAY: 300, // Reduced burst delay
  INSIGHTS_DELAY: 600, // Reduced insights delay
  MAX_PROCESSING_TIME: 80000, // Increased to 80 seconds for more data processing
  SAFETY_BUFFER: 5000, // Reduced safety buffer for more processing time
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
interface ChunkedJobPayload {
  // Base properties from MetaMarketingJobPayload
  accountId: string;
  timeframe: string;
  action: string;
  userId?: string;
  requestId: string;
  // Extended properties for chunked processing
  phase?: string; // 'account' | 'campaigns' | 'adsets' | 'ads'
  campaignIds?: string[];
  adsetIds?: string[];
  after?: string; // Cursor for pagination instead of offset
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

// Check if job has been cancelled
async function checkJobCancellation(
  supabase: any,
  requestId: string
): Promise<boolean> {
  try {
    const { data: job, error } = await supabase
      .from("background_jobs")
      .select("status")
      .eq("request_id", requestId)
      .single();

    if (error) {
      console.error("Error checking job cancellation:", error);
      return false; // Continue processing if we can't check
    }

    const isCancelled = job?.status === "cancelled";
    if (isCancelled) {
      console.log(`Job ${requestId} has been cancelled by user`);
    }

    return isCancelled;
  } catch (err) {
    console.error("Error in checkJobCancellation:", err);
    return false; // Continue processing if we can't check
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

  // Ensure we don't go beyond Facebook's data retention limits
  const minDate = new Date();
  minDate.setFullYear(minDate.getFullYear() - 2); // Facebook keeps data for ~2 years

  if (startDate < minDate) {
    console.log(
      `⚠️ Adjusting start date from ${
        startDate.toISOString().split("T")[0]
      } to ${
        minDate.toISOString().split("T")[0]
      } (Facebook data retention limit)`
    );
    startDate.setTime(minDate.getTime());
  }

  const result = {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };

  console.log(`📅 6-month date range: ${result.since} to ${result.until}`);
  return result;
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

// Get insights helper with improved error handling and fallback strategies
async function getInsights(
  entity: InsightCapableEntity,
  supabase: any,
  accountId: string,
  timeframe: string = "24h"
): Promise<InsightResult | null> {
  return withRateLimitRetry(
    async () => {
      const dateRange = getDateRangeForTimeframe(timeframe);

      console.log(
        `🔍 Fetching insights for entity ${entity.id} with timeframe ${timeframe}`
      );
      console.log(`📅 Date range: ${dateRange.since} to ${dateRange.until}`);

      try {
        // First attempt: Try with the requested timeframe
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
            // CRITICAL FIX: Don't specify level for individual entity insights
            // The level parameter is only for account-level insights aggregation
            breakdowns: [],
          }
        );

        const result = (insights?.[0] as InsightResult) || null;

        if (result) {
          console.log(`✅ Insights fetched successfully for ${entity.id}:`, {
            impressions: result.impressions,
            clicks: result.clicks,
            spend: result.spend,
            actions_count: result.actions?.length || 0,
          });
          return result;
        } else {
          console.log(
            `⚠️ No insights data for primary timeframe, trying fallback...`
          );

          // FALLBACK 1: Try with last 30 days if 6-month failed
          if (timeframe === "6-month") {
            console.log(`🔄 Trying 30-day fallback for ${entity.id}...`);
            const fallbackRange = {
              since: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .split("T")[0],
              until: new Date().toISOString().split("T")[0],
            };

            const fallbackInsights = await entity.getInsights(
              [
                "impressions",
                "clicks",
                "reach",
                "spend",
                "actions",
                "cost_per_action_type",
                "inline_link_clicks",
                "inline_post_engagement",
                "video_30_sec_watched_actions",
                "video_p25_watched_actions",
                "video_thruplay_watched_actions",
                "video_continuous_2_sec_watched_actions",
              ],
              {
                time_range: fallbackRange,
                breakdowns: [],
              }
            );

            const fallbackResult =
              (fallbackInsights?.[0] as InsightResult) || null;
            if (fallbackResult) {
              console.log(
                `✅ Fallback insights (30-day) fetched for ${entity.id}`
              );
              return fallbackResult;
            }
          }

          // FALLBACK 2: Try with last 7 days
          console.log(`🔄 Trying 7-day fallback for ${entity.id}...`);
          const weekRange = {
            since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
              .toISOString()
              .split("T")[0],
            until: new Date().toISOString().split("T")[0],
          };

          const weekInsights = await entity.getInsights(
            [
              "impressions",
              "clicks",
              "reach",
              "spend",
              "actions",
              "inline_link_clicks",
              "inline_post_engagement",
            ],
            {
              time_range: weekRange,
              breakdowns: [],
            }
          );

          const weekResult = (weekInsights?.[0] as InsightResult) || null;
          if (weekResult) {
            console.log(
              `✅ Fallback insights (7-day) fetched for ${entity.id}`
            );
            return weekResult;
          }

          console.log(
            `⚠️ No insights data available for ${entity.id} in any timeframe`
          );
          return null;
        }
      } catch (insightsError: any) {
        console.error(
          `❌ Error fetching insights for ${entity.id}:`,
          insightsError
        );

        // If it's a permissions or data availability error, try a simpler request
        if (
          insightsError?.response?.error?.code === 100 ||
          insightsError?.response?.error?.message?.includes("No data available")
        ) {
          console.log(
            `🔄 Trying simplified insights request for ${entity.id}...`
          );

          try {
            const simpleInsights = await entity.getInsights(
              ["impressions", "clicks", "spend"],
              {
                time_range: {
                  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
                    .toISOString()
                    .split("T")[0],
                  until: new Date().toISOString().split("T")[0],
                },
              }
            );

            const simpleResult = (simpleInsights?.[0] as InsightResult) || null;
            if (simpleResult) {
              console.log(`✅ Simplified insights fetched for ${entity.id}`);
              return simpleResult;
            }
          } catch (simpleError) {
            console.error(
              `❌ Even simplified insights failed for ${entity.id}:`,
              simpleError
            );
          }
        }

        return null;
      }
    },
    {
      accountId,
      endpoint: "insights",
      callType: "READ",
      points: RATE_LIMIT_CONFIG.POINTS.INSIGHTS, // Use INSIGHTS points instead of READ
      supabase,
    }
  );
}

// Main background job handler with chunked processing
async function handler(request: Request) {
  // 🚨 EMERGENCY CIRCUIT BREAKER - STOP ALL PROCESSING
  console.log("🚨 CIRCUIT BREAKER ACTIVATED - STOPPING ALL PROCESSING");
  return Response.json(
    {
      success: false,
      error: "Worker temporarily disabled for debugging",
      circuitBreaker: true,
      timestamp: new Date().toISOString(),
    },
    { status: 503 }
  );

  const supabase = await createClient();
  const startTime = Date.now();

  try {
    console.log("=== QStash Worker Started ===");
    console.log("Request headers:", {
      "content-type": request.headers.get("content-type"),
      "x-request-id": request.headers.get("x-request-id"),
      "user-agent": request.headers.get("user-agent"),
    });

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
    console.log(`Payload details:`, {
      phase,
      action,
      campaignIds: payload.campaignIds?.length || 0,
      adsetIds: payload.adsetIds?.length || 0,
      after: payload.after || "none",
    });

    // Process based on phase for chunked execution
    switch (phase) {
      case "account":
        console.log("=== EXECUTING ACCOUNT PHASE ===");
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
        console.log("=== EXECUTING CAMPAIGNS PHASE ===");
        result = await processCampaignsPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          payload.after || "",
          startTime
        );
        break;

      case "adsets":
        console.log("=== EXECUTING ADSETS PHASE ===");
        result = await processAdsetsPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          payload.campaignIds || [],
          payload.after || "",
          startTime
        );
        break;

      case "ads":
        console.log("=== EXECUTING ADS PHASE ===");
        result = await processAdsPhase(
          accountId,
          supabase,
          timeframe,
          payload.requestId,
          payload.adsetIds || [],
          payload.after || "",
          startTime
        );
        break;

      default:
        // Legacy support for non-chunked jobs
        if (action === "get24HourData" || action === "getData") {
          console.log("=== EXECUTING LEGACY ACCOUNT PHASE ===");
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

    // Try to update job status to failed, but don't fail if we can't parse the request
    try {
      // Try to get requestId from URL or headers if available
      const url = new URL(request.url);
      const requestIdFromHeader = request.headers.get("X-Request-ID");
      const requestId = requestIdFromHeader || "unknown";

      console.log("Updating job status to failed...");
      await updateJobStatus(
        supabase,
        requestId,
        "failed",
        0,
        error.message || "Unknown error occurred"
      );
      console.log("Job status updated to failed");
    } catch (updateError) {
      console.error("Error updating job status to failed:", updateError);
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
  // Check for cancellation at the start
  if (await checkJobCancellation(supabase, requestId)) {
    console.log("Job cancelled, stopping account phase");
    return { phase: "account", status: "cancelled" };
  }

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
      after: "",
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
      after: "",
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
    after: "",
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
  after: string,
  startTime: number
) {
  // Check for cancellation at the start
  if (await checkJobCancellation(supabase, requestId)) {
    console.log("Job cancelled, stopping campaigns phase");
    return { phase: "campaigns", status: "cancelled" };
  }

  console.log(
    `Processing campaigns phase for account: ${accountId}, after: ${after}`
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
      phase: "campaigns",
      after: after,
    });
    return { phase: "campaigns", status: "deferred_due_to_time_limit", after };
  }

  // Update progress
  await updateJobStatus(supabase, requestId, "processing", 40);

  const processedCampaigns = [];
  const campaignIds = [];
  let totalErrors = 0;

  // Enhanced fields for comprehensive campaign data collection
  const campaignFields = [
    "id",
    "name",
    "status",
    "configured_status",
    "effective_status",
    "objective",
    "buying_type",
    "bid_strategy",
    "daily_budget",
    "lifetime_budget",
    "budget_remaining",
    "spend_cap",
    "start_time",
    "stop_time",
    "created_time",
    "updated_time",
    "promoted_object",
    "pacing_type",
    "special_ad_categories",
    "source_campaign_id",
    "topline_id",
    "recommendations",
  ];

  try {
    const account = new AdAccount(accountId);

    // Get campaigns with comprehensive fields
    const campaignOptions: any = {
      limit: 100, // Increased to 100 to match ads and adsets limits for better throughput
    };

    // Only add after parameter if it's not empty and looks like a valid cursor
    if (after && after.trim() !== "") {
      console.log(`Using pagination cursor: ${after}`);
      campaignOptions.after = after;
    } else {
      console.log("Starting from the beginning (no cursor)");
    }

    const campaigns = await withRateLimitRetry(
      async () => {
        return account.getCampaigns(campaignFields, campaignOptions);
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

    // Process each campaign
    for (let i = 0; i < campaigns.length; i++) {
      // Check time limit frequently
      if (shouldCreateFollowUpJob(startTime)) {
        console.log(`Time limit reached after processing ${i} campaigns`);

        // Get the proper next cursor from the campaigns object
        let nextCursor = "";
        try {
          if (campaigns.hasNext && campaigns.hasNext()) {
            // Try to get the next cursor from the campaigns object
            const paging = campaigns.paging;
            nextCursor = paging?.cursors?.after || "";
            console.log(`Got next cursor from paging: ${nextCursor}`);
          }
        } catch (cursorError) {
          console.warn(
            "Could not get next cursor, will restart from beginning:",
            cursorError
          );
          nextCursor = "";
        }

        await createFollowUpJob({
          accountId,
          timeframe,
          action: "get24HourData",
          requestId,
          phase: "campaigns",
          after: nextCursor,
        });
        break;
      }

      const campaign = campaigns[i];
      const progress = 40 + Math.floor(((i + 1) / campaigns.length) * 20); // 40% to 60%

      console.log(
        `Processing campaign ${i + 1}/${campaigns.length}: ${campaign.name} (${
          campaign.id
        })`
      );
      console.log(`Progress: ${progress}%`);
      console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

      await updateJobStatus(supabase, requestId, "processing", progress);

      try {
        // Get insights for this campaign - ALWAYS try to fetch insights
        let campaignInsights = null;
        console.log(`🔍 Getting insights for campaign ${campaign.id}...`);

        try {
          campaignInsights = await getInsights(
            campaign as InsightCapableEntity,
            supabase,
            accountId,
            timeframe
          );

          if (campaignInsights) {
            console.log(`✅ Campaign insights retrieved for ${campaign.id}:`, {
              impressions: campaignInsights.impressions,
              clicks: campaignInsights.clicks,
              spend: campaignInsights.spend,
              actions: campaignInsights.actions?.length || 0,
            });
          } else {
            console.log(`⚠️ No insights data for campaign ${campaign.id}`);
          }
        } catch (insightsError) {
          console.error(
            `❌ Error fetching insights for campaign ${campaign.id}:`,
            insightsError
          );
          // Continue processing even if insights fail
          campaignInsights = null;
        }

        // Create comprehensive campaign data structure with all database fields
        const campaignData = {
          campaign_id: campaign.id,
          account_id: accountId,
          name: campaign.name || "",
          status: campaign.status || "UNKNOWN",
          configured_status: campaign.configured_status || null,
          effective_status: campaign.effective_status || null,
          objective: campaign.objective || "",
          buying_type: campaign.buying_type || null,
          bid_strategy: campaign.bid_strategy || null,
          daily_budget: campaign.daily_budget
            ? parseFloat(campaign.daily_budget)
            : null,
          lifetime_budget: campaign.lifetime_budget
            ? parseFloat(campaign.lifetime_budget)
            : null,
          budget_remaining: campaign.budget_remaining
            ? parseFloat(campaign.budget_remaining)
            : null,
          spend_cap: campaign.spend_cap ? parseFloat(campaign.spend_cap) : null,
          start_time: campaign.start_time
            ? new Date(campaign.start_time).toISOString()
            : null,
          end_time: campaign.stop_time
            ? new Date(campaign.stop_time).toISOString()
            : null,
          promoted_object: campaign.promoted_object || null,
          pacing_type: campaign.pacing_type || null,
          special_ad_categories: campaign.special_ad_categories || [],
          source_campaign_id: campaign.source_campaign_id || null,
          topline_id: campaign.topline_id || null,
          recommendations: campaign.recommendations || null,
          // Insights data
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
                  (sum: number, action: any) =>
                    sum + safeParseInt(action.value),
                  0
                )
              : null,
          last_updated: new Date().toISOString(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        console.log(`💾 Attempting to store campaign ${campaign.id}`);
        console.log(`📋 Campaign data structure:`, {
          campaign_id: campaignData.campaign_id,
          account_id: campaignData.account_id,
          name: campaignData.name,
          status: campaignData.status,
          objective: campaignData.objective,
          buying_type: campaignData.buying_type,
          bid_strategy: campaignData.bid_strategy,
          daily_budget: campaignData.daily_budget,
          lifetime_budget: campaignData.lifetime_budget,
        });

        const { error: campaignError } = await supabase
          .from("meta_campaigns")
          .upsert([campaignData], {
            onConflict: "campaign_id",
            ignoreDuplicates: false,
          });

        if (campaignError) {
          console.error(
            `❌ Error storing campaign ${campaign.id}:`,
            campaignError
          );
          console.error(`❌ Error code:`, campaignError.code);
          console.error(`❌ Error message:`, campaignError.message);
          console.error(`❌ Error details:`, campaignError.details);
          console.error(`❌ Error hint:`, campaignError.hint);
          console.error(
            `❌ Campaign data that failed:`,
            JSON.stringify(campaignData, null, 2)
          );
          totalErrors++;
        } else {
          console.log(`✅ Successfully stored campaign ${campaign.id}`);
          processedCampaigns.push(campaignData);
          campaignIds.push(campaign.id);
        }

        await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
      } catch (error: any) {
        console.error(`❌ Error processing campaign ${campaign.id}:`, error);
        console.error(`❌ Error stack:`, error.stack);
        totalErrors++;
        continue;
      }
    }

    console.log(`\n=== CAMPAIGNS PHASE SUMMARY ===`);
    console.log(`Total campaigns processed: ${processedCampaigns.length}`);
    console.log(`Total errors: ${totalErrors}`);
    console.log(`Campaign IDs collected: ${campaignIds.length}`);
    console.log(`Campaign IDs: ${campaignIds.join(", ")}`);

    // Determine next action using proper pagination
    let hasMore = false;
    let nextCursor = "";

    try {
      // Check if there are more campaigns using the Facebook SDK pagination
      if (campaigns.hasNext && campaigns.hasNext()) {
        hasMore = true;
        const paging = campaigns.paging;
        nextCursor = paging?.cursors?.after || "";
        console.log(`Has more campaigns. Next cursor: ${nextCursor}`);
      } else {
        console.log("No more campaigns to fetch");
      }
    } catch (pagingError) {
      console.warn(
        "Error checking pagination, assuming no more campaigns:",
        pagingError
      );
      hasMore = false;
      nextCursor = "";
    }

    if (hasMore && !shouldCreateFollowUpJob(startTime) && nextCursor) {
      // More campaigns to fetch
      console.log("🔄 Creating follow-up job for more campaigns");
      console.log(`Next cursor: ${nextCursor}`);
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "campaigns",
        after: nextCursor,
      });
    } else {
      // All campaigns processed, move to adsets phase
      console.log("✅ All campaigns processed, starting adsets phase");
      console.log(`Total campaign IDs collected: ${campaignIds.length}`);
      await updateJobStatus(supabase, requestId, "processing", 60);

      if (campaignIds.length > 0) {
        await createFollowUpJob({
          accountId,
          timeframe,
          action: "get24HourData",
          requestId,
          phase: "adsets",
          campaignIds: campaignIds,
          after: "",
        });
        console.log("🚀 Adsets phase job created successfully");
      } else {
        console.log("⚠️ No campaigns found, completing job");
        await updateJobStatus(supabase, requestId, "completed", 100);
      }
    }

    return {
      processedCampaigns: processedCampaigns.length,
      campaignIds,
      phase: "campaigns",
      after: nextCursor,
      remainingTime: getRemainingTime(startTime),
      hasMore,
      completed: !hasMore,
    };
  } catch (error: any) {
    console.error("❌ Error in campaigns phase:", error);
    console.error("❌ Error stack:", error.stack);
    throw error;
  }
}

// Process adsets phase (implement similar chunking logic)
async function processAdsetsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  campaignIds: string[],
  after: string,
  startTime: number
) {
  console.log("=== ADSETS PHASE DEBUG START ===");
  console.log(`Account ID: ${accountId}`);
  console.log(`Request ID: ${requestId}`);
  console.log(`Campaign IDs received: ${JSON.stringify(campaignIds)}`);
  console.log(`Campaign IDs count: ${campaignIds.length}`);
  console.log(`After cursor: ${after || "none"}`);
  console.log(`Timeframe: ${timeframe}`);
  console.log(`Start time: ${new Date(startTime).toISOString()}`);
  console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

  // Check for cancellation at the start
  if (await checkJobCancellation(supabase, requestId)) {
    console.log("Job cancelled, stopping adsets phase");
    return { phase: "adsets", status: "cancelled" };
  }

  // Ensure account exists in meta_account_insights before processing adsets
  console.log("=== CHECKING ACCOUNT EXISTS ===");
  const { data: accountExists, error: accountCheckError } = await supabase
    .from("meta_account_insights")
    .select("account_id")
    .eq("account_id", accountId)
    .single();

  console.log("Account check result:", { accountExists, accountCheckError });

  if (accountCheckError || !accountExists) {
    console.error(
      "Account not found in meta_account_insights:",
      accountCheckError
    );
    throw new Error(
      `Account ${accountId} must be processed before adsets. Please run account phase first.`
    );
  }

  console.log("✅ Account exists in meta_account_insights");

  // FALLBACK: If no campaign IDs provided, try to get them from database
  let finalCampaignIds = campaignIds;
  if (!campaignIds || campaignIds.length === 0) {
    console.log(
      "⚠️ No campaign IDs provided, attempting to retrieve from database..."
    );

    const { data: dbCampaigns, error: dbCampaignsError } = await supabase
      .from("meta_campaigns")
      .select("campaign_id")
      .eq("account_id", accountId)
      .order("created_at", { ascending: false });

    console.log("Database campaigns query result:", {
      count: dbCampaigns?.length || 0,
      error: dbCampaignsError,
      sampleIds: dbCampaigns?.slice(0, 5).map((c: any) => c.campaign_id) || [],
    });

    if (dbCampaignsError) {
      console.error(
        "❌ Error retrieving campaigns from database:",
        dbCampaignsError
      );
      throw new Error(
        `Failed to retrieve campaigns from database: ${dbCampaignsError.message}`
      );
    }

    if (!dbCampaigns || dbCampaigns.length === 0) {
      console.error(
        "❌ No campaigns found in database for account:",
        accountId
      );
      throw new Error(
        "No campaigns found in database. Please run campaigns phase first."
      );
    }

    finalCampaignIds = dbCampaigns.map((c: any) => c.campaign_id);
    console.log(
      `✅ Retrieved ${finalCampaignIds.length} campaign IDs from database`
    );
    console.log(
      `Campaign IDs from DB: ${finalCampaignIds.slice(0, 10).join(", ")}${
        finalCampaignIds.length > 10 ? "..." : ""
      }`
    );
  }

  // Validate campaign IDs
  if (!finalCampaignIds || finalCampaignIds.length === 0) {
    console.error("❌ No campaign IDs available to process adsets");
    throw new Error("No campaign IDs available to process adsets");
  }

  console.log("=== PROCESSING ADSETS PHASE ===");
  console.log(`Campaign IDs to process: ${finalCampaignIds.length}`);
  console.log(
    `Campaign IDs: ${finalCampaignIds.slice(0, 10).join(", ")}${
      finalCampaignIds.length > 10 ? "..." : ""
    }`
  );

  // Process campaigns in batches
  const batchSize = Math.min(
    RATE_LIMIT_CONFIG.BATCH_SIZE,
    finalCampaignIds.length
  );
  const currentBatch = finalCampaignIds.slice(0, batchSize);
  const remainingCampaigns = finalCampaignIds.slice(batchSize);

  console.log(`=== BATCH PROCESSING ===`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`Current batch: ${currentBatch.length} campaigns`);
  console.log(`Current batch IDs: ${currentBatch.join(", ")}`);
  console.log(`Remaining campaigns: ${remainingCampaigns.length}`);

  const processedAdsets = [];
  const adsetIds = [];
  let totalAdsetsFound = 0;
  let totalAdsetsStored = 0;
  let totalErrors = 0;

  // Enhanced fields for comprehensive adset data collection
  const adsetFields = [
    "id",
    "name",
    "status",
    "configured_status",
    "effective_status",
    "optimization_goal",
    "billing_event",
    "bid_amount",
    "bid_strategy",
    "daily_budget",
    "lifetime_budget",
    "targeting",
    "start_time",
    "end_time",
    "attribution_spec",
    "destination_type",
    "frequency_control_specs",
    "is_dynamic_creative",
    "issues_info",
    "learning_stage_info",
    "pacing_type",
    "promoted_object",
    "source_adset_id",
    "targeting_optimization_types",
    "use_new_app_click",
    "created_time",
    "updated_time",
  ];

  for (let i = 0; i < currentBatch.length; i++) {
    console.log(
      `\n=== PROCESSING CAMPAIGN ${i + 1}/${currentBatch.length} ===`
    );

    // Check time limit more frequently
    if (shouldCreateFollowUpJob(startTime)) {
      console.log(
        `⏰ Time limit reached after processing ${i} campaigns, creating follow-up job`
      );
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "adsets",
        campaignIds: [...currentBatch.slice(i), ...remainingCampaigns],
        after: "",
      });
      break;
    }

    const campaignId = currentBatch[i];
    const progress =
      60 + Math.floor(((i + 1) / Math.max(1, currentBatch.length)) * 20); // 60% to 80%

    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Progress: ${progress}%`);
    console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

    await updateJobStatus(supabase, requestId, "processing", progress);

    try {
      console.log(`🔍 Creating Campaign object for ID: ${campaignId}`);
      const campaign = new Campaign(campaignId);

      console.log(`📡 Fetching adsets for campaign ${campaignId}...`);

      // Get adsets for this campaign with comprehensive fields
      const adsetsResponse = await withRateLimitRetry(
        async () => {
          const campaign = new Campaign(campaignId);
          return campaign.getAdSets(adsetFields, { limit: 100 }); // Increased to 100 for better throughput
        },
        {
          accountId,
          endpoint: "adsets",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      console.log(`📊 Raw adsets response type: ${typeof adsetsResponse}`);

      // More detailed response parsing
      let adsets: any[] = [];
      if (Array.isArray(adsetsResponse)) {
        adsets = adsetsResponse;
        console.log(`📊 Response is array with ${adsets.length} items`);
      } else if (adsetsResponse && typeof adsetsResponse === "object") {
        const responseObj = adsetsResponse as any;
        if (responseObj.data) {
          adsets = responseObj.data;
          console.log(
            `📊 Response has data property with ${adsets.length} items`
          );
        } else if (responseObj.length !== undefined) {
          adsets = Array.from(responseObj);
          console.log(`📊 Response is array-like with ${adsets.length} items`);
        } else {
          console.log(
            `📊 Response object structure:`,
            Object.keys(responseObj)
          );
          adsets = [];
        }
      } else {
        console.log(
          `📊 Response is neither array nor object:`,
          typeof adsetsResponse
        );
      }

      console.log(
        `✅ Found ${adsets.length} adsets for campaign ${campaignId}`
      );
      totalAdsetsFound += adsets.length;

      if (adsets.length === 0) {
        console.log(`⚠️ No adsets found for campaign ${campaignId}`);
        continue;
      }

      // Log first adset details for debugging
      if (adsets.length > 0) {
        console.log(`📋 First adset details:`, {
          id: adsets[0].id,
          name: adsets[0].name,
          status: adsets[0].status,
          campaign_id: campaignId,
        });
      }

      // Process each adset
      for (let j = 0; j < adsets.length; j++) {
        const adset = adsets[j];
        console.log(`\n--- Processing adset ${j + 1}/${adsets.length} ---`);
        console.log(`Adset ID: ${adset.id}`);
        console.log(`Adset name: ${adset.name}`);
        console.log(`Adset status: ${adset.status}`);

        try {
          // Get insights for this adset - ALWAYS try to fetch insights
          let adsetInsights = null;
          console.log(`🔍 Getting insights for adset ${adset.id}...`);

          try {
            adsetInsights = await getInsights(
              adset as InsightCapableEntity,
              supabase,
              accountId,
              timeframe
            );

            if (adsetInsights) {
              console.log(`✅ Adset insights retrieved for ${adset.id}:`, {
                impressions: adsetInsights.impressions,
                clicks: adsetInsights.clicks,
                spend: adsetInsights.spend,
                actions: adsetInsights.actions?.length || 0,
              });
            } else {
              console.log(`⚠️ No insights data for adset ${adset.id}`);
            }
          } catch (insightsError) {
            console.error(
              `❌ Error fetching insights for adset ${adset.id}:`,
              insightsError
            );
            // Continue processing even if insights fail
            adsetInsights = null;
          }

          // Create comprehensive adset data structure with all database fields
          const adsetData = {
            ad_set_id: adset.id,
            campaign_id: campaignId,
            account_id: accountId,
            name: adset.name || "",
            status: adset.status || "UNKNOWN",
            configured_status: adset.configured_status || null,
            effective_status: adset.effective_status || null,
            optimization_goal: adset.optimization_goal || null,
            billing_event: adset.billing_event || null,
            bid_amount: adset.bid_amount ? parseFloat(adset.bid_amount) : null,
            bid_strategy: adset.bid_strategy || null,
            daily_budget: adset.daily_budget
              ? parseFloat(adset.daily_budget)
              : null,
            lifetime_budget: adset.lifetime_budget
              ? parseFloat(adset.lifetime_budget)
              : null,
            targeting: adset.targeting || null,
            start_time: adset.start_time
              ? new Date(adset.start_time).toISOString()
              : null,
            end_time: adset.end_time
              ? new Date(adset.end_time).toISOString()
              : null,
            // Additional comprehensive fields
            attribution_spec: adset.attribution_spec || null,
            destination_type: adset.destination_type || null,
            frequency_control_specs: adset.frequency_control_specs || null,
            is_dynamic_creative: adset.is_dynamic_creative || null,
            issues_info: adset.issues_info || null,
            learning_stage_info: adset.learning_stage_info || null,
            pacing_type: adset.pacing_type || null,
            promoted_object: adset.promoted_object || null,
            source_adset_id: adset.source_adset_id || null,
            targeting_optimization_types:
              adset.targeting_optimization_types || null,
            use_new_app_click: adset.use_new_app_click || null,
            // Insights data
            impressions: safeParseInt(adsetInsights?.impressions),
            clicks: safeParseInt(adsetInsights?.clicks),
            reach: safeParseInt(adsetInsights?.reach),
            spend: safeParseFloat(adsetInsights?.spend),
            conversions: adsetInsights?.actions
              ? adsetInsights.actions.reduce((acc: any, action: any) => {
                  acc[action.action_type] = action.value;
                  return acc;
                }, {})
              : null,
            cost_per_conversion:
              adsetInsights?.actions && adsetInsights.actions.length > 0
                ? safeParseFloat(adsetInsights.spend) /
                  adsetInsights.actions.reduce(
                    (sum: number, action: any) =>
                      sum + safeParseInt(action.value),
                    0
                  )
                : null,
            last_updated: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          console.log(`💾 Attempting to store adset ${adset.id}`);
          console.log(`📋 Adset data structure:`, {
            ad_set_id: adsetData.ad_set_id,
            campaign_id: adsetData.campaign_id,
            account_id: adsetData.account_id,
            name: adsetData.name,
            status: adsetData.status,
            targeting: typeof adsetData.targeting,
            start_time: adsetData.start_time,
            end_time: adsetData.end_time,
          });

          console.log(`🗄️ Making upsert call to meta_ad_sets table...`);
          const { data: upsertData, error: adsetError } = await supabase
            .from("meta_ad_sets")
            .upsert([adsetData], {
              onConflict: "ad_set_id",
              ignoreDuplicates: false,
            })
            .select(); // Add select to see what was actually inserted

          console.log(`📤 Upsert response:`, { upsertData, adsetError });

          if (adsetError) {
            console.error(`❌ Error storing adset ${adset.id}:`, adsetError);
            console.error(`❌ Error code:`, adsetError.code);
            console.error(`❌ Error message:`, adsetError.message);
            console.error(`❌ Error details:`, adsetError.details);
            console.error(`❌ Error hint:`, adsetError.hint);
            console.error(
              `❌ Adset data that failed:`,
              JSON.stringify(adsetData, null, 2)
            );
            totalErrors++;
            // Continue processing other adsets even if one fails
          } else {
            console.log(`✅ Successfully stored adset ${adset.id}`);
            console.log(`✅ Upserted data:`, upsertData);
            processedAdsets.push(adsetData);
            adsetIds.push(adset.id);
            totalAdsetsStored++;
          }

          // Small delay between adsets
          await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
        } catch (error: any) {
          console.error(`❌ Error processing adset ${adset.id}:`, error);
          console.error(`❌ Error stack:`, error.stack);
          totalErrors++;
          continue;
        }
      }

      // Delay between campaigns
      await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
    } catch (error: any) {
      console.error(`❌ Error processing campaign ${campaignId}:`, error);
      console.error(`❌ Error stack:`, error.stack);
      totalErrors++;
      continue;
    }
  }

  console.log(`\n=== ADSETS PHASE SUMMARY ===`);
  console.log(`Total adsets found: ${totalAdsetsFound}`);
  console.log(`Total adsets stored: ${totalAdsetsStored}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Processed adsets: ${processedAdsets.length}`);
  console.log(`Adset IDs collected: ${adsetIds.length}`);
  console.log(`Adset IDs: ${adsetIds.join(", ")}`);

  // Determine next action
  if (remainingCampaigns.length > 0) {
    // More campaigns to process
    console.log("🔄 Creating follow-up job for remaining campaigns");
    console.log(`Remaining campaigns: ${remainingCampaigns.length}`);
    console.log(`Remaining campaign IDs: ${remainingCampaigns.join(", ")}`);
    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "adsets",
      campaignIds: remainingCampaigns,
      after: "",
    });
  } else {
    // All campaigns processed, move to ads phase
    console.log("✅ All campaigns processed, starting ads phase");
    console.log(`Total adset IDs collected: ${adsetIds.length}`);
    console.log(
      `Adset IDs: ${adsetIds.slice(0, 5).join(", ")}${
        adsetIds.length > 5 ? "..." : ""
      }`
    );
    await updateJobStatus(supabase, requestId, "processing", 80);

    if (adsetIds.length > 0) {
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "ads",
        adsetIds: adsetIds,
        after: "",
      });
      console.log("🚀 Ads phase job created successfully");
    } else {
      console.log("⚠️ No adsets found, completing job");
      await updateJobStatus(supabase, requestId, "completed", 100);
    }
  }

  return {
    processedAdsets: processedAdsets.length,
    phase: "adsets",
    after: after,
    remainingTime: getRemainingTime(startTime),
    completed: remainingCampaigns.length === 0,
  };
}

// Process ads phase (implement similar chunking logic)
async function processAdsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  adsetIds: string[],
  after: string,
  startTime: number
) {
  // Check for cancellation at the start
  if (await checkJobCancellation(supabase, requestId)) {
    console.log("Job cancelled, stopping ads phase");
    return { phase: "ads", status: "cancelled" };
  }

  console.log(
    `Processing ads phase for adsets: ${adsetIds.length}, after: ${after}`
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
      after: after,
    });
    return { phase: "ads", status: "deferred_due_to_time_limit", after };
  }

  // Update progress
  await updateJobStatus(supabase, requestId, "processing", 90);

  const processedAds = [];
  let totalErrors = 0;

  // Enhanced fields for comprehensive ad data collection
  const adFields = [
    "id",
    "name",
    "status",
    "configured_status",
    "effective_status",
    "creative",
    "tracking_specs",
    "conversion_specs",
    "tracking_and_conversion_specs",
    "created_time",
    "updated_time",
    "source_ad_id",
    "recommendations",
    "issues_info",
    "engagement_audience",
    "preview_url",
    "template_url",
    "thumbnail_url",
    "instagram_permalink_url",
    "effective_object_story_id",
    "url_tags",
  ];

  // Helper function to fetch creative details with retries and FORCE asset_feed_spec
  async function fetchCreativeWithRetry(
    creativeId: string,
    maxRetries = 5 // Increased retries for critical data
  ): Promise<any> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(
          `🎨 Fetching creative ${creativeId} (attempt ${attempt}/${maxRetries})`
        );

        const creative = await withRateLimitRetry(
          async () => {
            const { AdCreative } = require("facebook-nodejs-business-sdk");
            const creativeObj = new AdCreative(creativeId);
            return creativeObj.read([
              "id",
              "name",
              "title",
              "body",
              "object_type",
              "thumbnail_url",
              "image_url",
              "video_id",
              "url_tags",
              "template_url",
              "instagram_permalink_url",
              "effective_object_story_id",
              "asset_feed_spec",
              "object_story_spec",
              "platform_customizations",
            ]);
          },
          {
            accountId,
            endpoint: "creative",
            callType: "READ",
            points: RATE_LIMIT_CONFIG.POINTS.READ,
            supabase,
          }
        );

        console.log(`✅ Successfully fetched creative ${creativeId}`);

        // CRITICAL: If we have creative data but no asset_feed_spec, create fallback
        if (creative && !creative.asset_feed_spec) {
          console.log(
            `⚠️ Creative ${creativeId} missing asset_feed_spec, creating fallback...`
          );

          // Create fallback asset_feed_spec from available data
          let fallbackAssetFeedSpec = null;

          if (creative.object_story_spec?.link_data) {
            const linkData = creative.object_story_spec.link_data;
            fallbackAssetFeedSpec = {
              _fallback_source: "OBJECT_STORY_SPEC",
              ...(linkData.video_id && {
                videos: [{ video_id: linkData.video_id }],
              }),
              ...(linkData.image_hash && {
                images: [{ image_hash: linkData.image_hash }],
              }),
              ...(linkData.picture && {
                images: [{ picture: linkData.picture }],
              }),
              ...(linkData.call_to_action && {
                call_to_action: linkData.call_to_action,
              }),
              ...(linkData.description && {
                description: linkData.description,
              }),
              ...(linkData.link && {
                link_url: linkData.link,
              }),
            };
          } else if (creative.video_id) {
            fallbackAssetFeedSpec = {
              _fallback_source: "VIDEO_ID",
              videos: [
                {
                  video_id: creative.video_id,
                  ...(creative.thumbnail_url && {
                    thumbnail_url: creative.thumbnail_url,
                  }),
                },
              ],
            };
          } else if (creative.image_url) {
            fallbackAssetFeedSpec = {
              _fallback_source: "IMAGE_URL",
              images: [{ url: creative.image_url }],
            };
          }

          if (fallbackAssetFeedSpec) {
            creative.asset_feed_spec = fallbackAssetFeedSpec;
            console.log(
              `✅ Created fallback asset_feed_spec for creative ${creativeId}`
            );
          } else {
            console.error(
              `❌ CRITICAL: Could not create asset_feed_spec for creative ${creativeId}`
            );
            creative.asset_feed_spec = {
              _fallback_source: "FAILED_TO_EXTRACT",
              error: "No extractable asset data found",
            };
          }
        }

        return creative;
      } catch (error: any) {
        console.error(
          `❌ Creative fetch attempt ${attempt} failed for ${creativeId}:`,
          error
        );

        // Check if it's a deleted creative or permission error
        if (
          error.response?.error?.code === 803 ||
          error.response?.error?.message?.includes("does not exist") ||
          error.response?.error?.message?.includes("not found")
        ) {
          console.log(`🗑️ Creative ${creativeId} appears to be deleted`);
          return {
            _deleted: true,
            asset_feed_spec: {
              _fallback_source: "DELETED_CREATIVE",
              error: "Creative was deleted",
            },
          };
        }

        if (attempt >= maxRetries) {
          console.error(
            `❌ All retry attempts failed for creative ${creativeId}, creating emergency fallback`
          );
          return {
            _fetch_failed: true,
            asset_feed_spec: {
              _fallback_source: "FETCH_FAILED_EMERGENCY",
              error: error.response?.error?.message || "Unknown fetch error",
              creative_id: creativeId,
            },
          };
        }

        // Wait before retry with exponential backoff
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    }

    // This should never be reached, but just in case
    return {
      _emergency_fallback: true,
      asset_feed_spec: {
        _fallback_source: "EMERGENCY_FALLBACK",
        error: "Unexpected code path",
        creative_id: creativeId,
      },
    };
  }

  // Helper function to determine creative type
  function determineCreativeType(creative: any, adData: any): string {
    if (!creative) {
      // Fallback: check asset_feed_spec or object_story_spec
      if (adData.asset_feed_spec) {
        const assetFeed = adData.asset_feed_spec;
        if (assetFeed.videos && assetFeed.videos.length > 0) return "VIDEO";
        if (assetFeed.images && assetFeed.images.length > 0) return "IMAGE";
      }

      if (adData.object_story_spec?.link_data) {
        const linkData = adData.object_story_spec.link_data;
        if (linkData.video_id) return "VIDEO";
        if (linkData.image_hash || linkData.picture) return "IMAGE";
      }

      return "UNKNOWN";
    }

    // Check creative object
    if (creative.video_id) return "VIDEO";
    if (creative.image_url || creative.thumbnail_url) return "IMAGE";

    // Check object_story_spec
    if (creative.object_story_spec?.link_data) {
      const linkData = creative.object_story_spec.link_data;
      if (linkData.video_id) return "VIDEO";
      if (linkData.image_hash || linkData.picture) return "IMAGE";
    }

    // Check asset_feed_spec
    if (creative.asset_feed_spec) {
      const assetFeed = creative.asset_feed_spec;
      if (assetFeed.videos && assetFeed.videos.length > 0) return "VIDEO";
      if (assetFeed.images && assetFeed.images.length > 0) return "IMAGE";
    }

    return "UNKNOWN";
  }

  // Helper function to save ad engagement metrics - ALWAYS creates a record
  async function saveAdEngagementMetrics(
    adId: string,
    insights: any,
    date: string
  ) {
    try {
      console.log(`📊 Processing engagement metrics for ad ${adId}...`);
      console.log(`📊 Raw insights data:`, {
        insights_available: insights ? true : false,
        impressions: insights?.impressions,
        clicks: insights?.clicks,
        spend: insights?.spend,
        inline_link_clicks: insights?.inline_link_clicks,
        inline_post_engagement: insights?.inline_post_engagement,
        actions_count: insights?.actions?.length || 0,
        video_actions_count:
          insights?.video_30_sec_watched_actions?.length || 0,
        cost_per_action_count: insights?.cost_per_action_type?.length || 0,
      });

      // ALWAYS create a record, even if insights are null
      const engagementData = {
        ad_id: adId,
        date: date,
        // If no insights, set all metrics to null but still create the record
        inline_link_clicks: insights
          ? safeParseInt(insights.inline_link_clicks)
          : null,
        inline_post_engagement: insights
          ? safeParseInt(insights.inline_post_engagement)
          : null,
        // Video metrics
        video_30s_watched: insights?.video_30_sec_watched_actions
          ? safeParseInt(insights.video_30_sec_watched_actions[0]?.value)
          : null,
        video_25_percent_watched: insights?.video_p25_watched_actions
          ? safeParseInt(insights.video_p25_watched_actions[0]?.value)
          : null,
        video_50_percent_watched: insights?.video_p50_watched_actions
          ? safeParseInt(insights.video_p50_watched_actions[0]?.value)
          : null,
        video_75_percent_watched: insights?.video_p75_watched_actions
          ? safeParseInt(insights.video_p75_watched_actions[0]?.value)
          : null,
        video_95_percent_watched: insights?.video_p95_watched_actions
          ? safeParseInt(insights.video_p95_watched_actions[0]?.value)
          : null,
        // Engagement metrics
        page_engagement: insights?.actions?.find(
          (a: any) => a.action_type === "page_engagement"
        )?.value
          ? safeParseInt(
              insights.actions.find(
                (a: any) => a.action_type === "page_engagement"
              ).value
            )
          : null,
        post_engagement: insights?.actions?.find(
          (a: any) => a.action_type === "post_engagement"
        )?.value
          ? safeParseInt(
              insights.actions.find(
                (a: any) => a.action_type === "post_engagement"
              ).value
            )
          : null,
        post_comments: insights?.actions?.find(
          (a: any) => a.action_type === "comment"
        )?.value
          ? safeParseInt(
              insights.actions.find((a: any) => a.action_type === "comment")
                .value
            )
          : null,
        // Video view metrics
        two_sec_video_views: insights?.video_continuous_2_sec_watched_actions
          ? safeParseInt(
              insights.video_continuous_2_sec_watched_actions[0]?.value
            )
          : null,
        three_sec_video_views: insights?.actions?.find(
          (a: any) => a.action_type === "video_view"
        )?.value
          ? safeParseInt(
              insights.actions.find((a: any) => a.action_type === "video_view")
                .value
            )
          : null,
        thruplays: insights?.video_thruplay_watched_actions
          ? safeParseInt(insights.video_thruplay_watched_actions[0]?.value)
          : null,
        // Cost metrics from cost_per_action_type
        cost_per_link_click: insights?.cost_per_action_type?.find(
          (c: any) => c.action_type === "link_click"
        )?.value
          ? safeParseFloat(
              insights.cost_per_action_type.find(
                (c: any) => c.action_type === "link_click"
              ).value
            )
          : null,
        cost_per_post_engagement: insights?.cost_per_action_type?.find(
          (c: any) => c.action_type === "post_engagement"
        )?.value
          ? safeParseFloat(
              insights.cost_per_action_type.find(
                (c: any) => c.action_type === "post_engagement"
              ).value
            )
          : null,
        cost_per_page_engagement: insights?.cost_per_action_type?.find(
          (c: any) => c.action_type === "page_engagement"
        )?.value
          ? safeParseFloat(
              insights.cost_per_action_type.find(
                (c: any) => c.action_type === "page_engagement"
              ).value
            )
          : null,
        cost_per_thruplay: insights?.cost_per_action_type?.find(
          (c: any) => c.action_type === "video_thruplay_watched"
        )?.value
          ? safeParseFloat(
              insights.cost_per_action_type.find(
                (c: any) => c.action_type === "video_thruplay_watched"
              ).value
            )
          : null,
        cost_per_2sec_view: insights?.cost_per_action_type?.find(
          (c: any) => c.action_type === "video_continuous_2_sec_watched"
        )?.value
          ? safeParseFloat(
              insights.cost_per_action_type.find(
                (c: any) => c.action_type === "video_continuous_2_sec_watched"
              ).value
            )
          : null,
        cost_per_3sec_view: insights?.cost_per_action_type?.find(
          (c: any) => c.action_type === "video_view"
        )?.value
          ? safeParseFloat(
              insights.cost_per_action_type.find(
                (c: any) => c.action_type === "video_view"
              ).value
            )
          : null,
        // Calculated metrics
        avg_watch_time_seconds: insights?.video_avg_time_watched_actions
          ? safeParseFloat(insights.video_avg_time_watched_actions[0]?.value)
          : null,
        // VTR and Hook Rate (calculated)
        vtr_percentage:
          insights?.video_p25_watched_actions && insights?.impressions
            ? (safeParseInt(insights.video_p25_watched_actions[0]?.value) /
                safeParseInt(insights.impressions)) *
              100
            : null,
        hook_rate_percentage:
          insights?.video_continuous_2_sec_watched_actions &&
          insights?.impressions
            ? (safeParseInt(
                insights.video_continuous_2_sec_watched_actions[0]?.value
              ) /
                safeParseInt(insights.impressions)) *
              100
            : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log(`📊 Engagement data prepared for ad ${adId}:`, {
        insights_available: insights ? true : false,
        inline_link_clicks: engagementData.inline_link_clicks,
        video_30s_watched: engagementData.video_30s_watched,
        thruplays: engagementData.thruplays,
        page_engagement: engagementData.page_engagement,
        post_engagement: engagementData.post_engagement,
        vtr_percentage: engagementData.vtr_percentage,
        hook_rate_percentage: engagementData.hook_rate_percentage,
      });

      const { error: metricsError } = await supabase
        .from("ad_engagement_metrics")
        .upsert([engagementData], {
          onConflict: "ad_id,date",
          ignoreDuplicates: false,
        });

      if (metricsError) {
        console.error(
          `❌ Error saving engagement metrics for ad ${adId}:`,
          metricsError
        );
        throw metricsError; // Re-throw so caller can handle
      } else {
        console.log(
          `✅ Saved engagement metrics for ad ${adId} (insights: ${
            insights ? "available" : "null"
          })`
        );
      }
    } catch (error) {
      console.error(
        `❌ Error processing engagement metrics for ad ${adId}:`,
        error
      );
      throw error; // Re-throw so caller can handle
    }
  }

  // Process adsets in small batches to get their ads
  const adsetsToProcess = adsetIds.slice(0, RATE_LIMIT_CONFIG.BATCH_SIZE);

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
        after: after,
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
      // First get the adset to get the campaign_id
      const adsetInfo = await withRateLimitRetry(
        async () => {
          const adset = new AdSet(adsetId);
          return adset.read(["campaign_id"]);
        },
        {
          accountId,
          endpoint: "adset_info",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      const campaignId = adsetInfo.campaign_id;

      // Get ads for this adset with comprehensive fields
      const ads = await withRateLimitRetry(
        async () => {
          const adset = new AdSet(adsetId);
          return adset.getAds(adFields, { limit: 100 }); // Increased limit for more ads
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
          console.log(`\n--- Processing ad ${ad.id} ---`);
          console.log(`Ad name: ${ad.name}`);
          console.log(`Ad status: ${ad.status}`);

          // Get insights for this ad - ALWAYS try to fetch insights
          let adInsights = null;
          console.log(`🔍 Getting insights for ad ${ad.id}...`);

          try {
            adInsights = await getInsights(
              ad as InsightCapableEntity,
              supabase,
              accountId,
              timeframe
            );

            if (adInsights) {
              console.log(`✅ Ad insights retrieved for ${ad.id}:`, {
                impressions: adInsights.impressions,
                clicks: adInsights.clicks,
                spend: adInsights.spend,
                actions: adInsights.actions?.length || 0,
              });
            } else {
              console.log(`⚠️ No insights data for ad ${ad.id}`);
            }
          } catch (insightsError) {
            console.error(
              `❌ Error fetching insights for ad ${ad.id}:`,
              insightsError
            );
            // Continue processing even if insights fail
            adInsights = null;
          }

          // Extract creative ID and fetch creative details
          let creativeDetails = null;
          let creativeId = null;
          let creativeType = "UNKNOWN";
          let assetFeedSpec = null;

          if (ad.creative && ad.creative.id) {
            creativeId = ad.creative.id;
            console.log(`🎨 Found creative ID: ${creativeId}`);

            // CRITICAL: Fetch creative details with FORCED asset_feed_spec
            creativeDetails = await fetchCreativeWithRetry(creativeId);

            if (creativeDetails) {
              console.log(`✅ Creative details fetched for ${creativeId}`);
              creativeType = determineCreativeType(creativeDetails, ad);

              // CRITICAL: We should ALWAYS have asset_feed_spec if we have creative_id
              assetFeedSpec = creativeDetails.asset_feed_spec;

              if (!assetFeedSpec) {
                console.error(
                  `❌ CRITICAL ERROR: No asset_feed_spec for creative ${creativeId}!`
                );
                // This should not happen with our new fetchCreativeWithRetry function
                assetFeedSpec = {
                  _fallback_source: "CRITICAL_MISSING_ASSET_FEED_SPEC",
                  error: "Creative details fetched but no asset_feed_spec",
                  creative_id: creativeId,
                  ad_id: ad.id,
                };
              }
            } else {
              console.error(
                `❌ CRITICAL ERROR: Could not fetch creative details for ${creativeId}!`
              );
              // This should not happen with our new fetchCreativeWithRetry function
              creativeType = "FETCH_FAILED";
              assetFeedSpec = {
                _fallback_source: "CRITICAL_FETCH_FAILURE",
                error: "fetchCreativeWithRetry returned null",
                creative_id: creativeId,
                ad_id: ad.id,
              };
            }
          } else {
            console.log(`⚠️ No creative ID found for ad ${ad.id}`);
            creativeType = determineCreativeType(null, ad);
            // No creative_id means no asset_feed_spec needed
            assetFeedSpec = null;
          }

          // CRITICAL VALIDATION: If we have creative_id, we MUST have asset_feed_spec
          if (creativeId && !assetFeedSpec) {
            console.error(
              `❌ VALIDATION FAILED: creative_id ${creativeId} but no asset_feed_spec!`
            );
            assetFeedSpec = {
              _fallback_source: "VALIDATION_FAILURE",
              error:
                "Validation failed - creative_id present but no asset_feed_spec",
              creative_id: creativeId,
              ad_id: ad.id,
            };
          }

          console.log(`🎭 Determined creative type: ${creativeType}`);
          console.log(
            `📋 Asset feed spec status: ${assetFeedSpec ? "PRESENT" : "NULL"}`
          );

          // CRITICAL VALIDATION LOG
          if (creativeId && assetFeedSpec) {
            console.log(
              `✅ VALIDATION PASSED: creative_id ${creativeId} has asset_feed_spec`
            );
          } else if (creativeId && !assetFeedSpec) {
            console.error(
              `❌ VALIDATION FAILED: creative_id ${creativeId} missing asset_feed_spec`
            );
          }

          // Create comprehensive ad data structure
          const adData = {
            ad_id: ad.id,
            ad_set_id: adsetId,
            account_id: accountId,
            campaign_id: campaignId,
            name: ad.name || "",
            status: ad.status || "UNKNOWN",
            configured_status: ad.configured_status || null,
            effective_status: ad.effective_status || null,
            creative: ad.creative || null,
            creative_id: creativeId,
            creative_type: creativeType,
            asset_feed_spec: assetFeedSpec,
            object_story_spec:
              creativeDetails?.object_story_spec ||
              ad.creative?.object_story_spec ||
              null,
            tracking_specs: ad.tracking_specs || null,
            conversion_specs: ad.conversion_specs || null,
            tracking_and_conversion_specs:
              ad.tracking_and_conversion_specs || null,
            source_ad_id: ad.source_ad_id || null,
            recommendations: ad.recommendations || null,
            issues_info: ad.issues_info || null,
            engagement_audience: ad.engagement_audience || null,
            preview_url: ad.preview_url || null,
            template_url:
              ad.template_url || creativeDetails?.template_url || null,
            thumbnail_url:
              ad.thumbnail_url || creativeDetails?.thumbnail_url || null,
            image_url: creativeDetails?.image_url || null,
            video_id: creativeDetails?.video_id || null,
            instagram_permalink_url:
              ad.instagram_permalink_url ||
              creativeDetails?.instagram_permalink_url ||
              null,
            effective_object_story_id:
              ad.effective_object_story_id ||
              creativeDetails?.effective_object_story_id ||
              null,
            url_tags: ad.url_tags || creativeDetails?.url_tags || null,
            // Insights data
            impressions: safeParseInt(adInsights?.impressions),
            clicks: safeParseInt(adInsights?.clicks),
            reach: safeParseInt(adInsights?.reach),
            spend: safeParseFloat(adInsights?.spend),
            conversions: adInsights?.actions
              ? adInsights.actions.reduce((acc: any, action: any) => {
                  acc[action.action_type] = action.value;
                  return acc;
                }, {})
              : null,
            cost_per_conversion:
              adInsights?.actions && adInsights.actions.length > 0
                ? safeParseFloat(adInsights.spend) /
                  adInsights.actions.reduce(
                    (sum: number, action: any) =>
                      sum + safeParseInt(action.value),
                    0
                  )
                : null,
            last_updated: new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          console.log(`💾 Attempting to store ad ${ad.id} with data:`, {
            ad_id: adData.ad_id,
            ad_set_id: adData.ad_set_id,
            campaign_id: adData.campaign_id,
            name: adData.name,
            status: adData.status,
            creative_id: adData.creative_id,
            creative_type: adData.creative_type,
          });

          const { error: adError } = await supabase
            .from("meta_ads")
            .upsert([adData], {
              onConflict: "ad_id",
              ignoreDuplicates: false,
            });

          if (adError) {
            console.error(`❌ Error storing ad ${ad.id}:`, adError);
            console.error(
              `Ad data that failed:`,
              JSON.stringify(adData, null, 2)
            );
            totalErrors++;
          } else {
            processedAds.push(adData);
            console.log(`✅ Successfully stored ad ${ad.id}`);
          }

          // CRITICAL: ALWAYS save ad engagement metrics for EVERY ad
          console.log(`📊 Saving engagement metrics for ad ${ad.id}...`);
          try {
            const today = new Date().toISOString().split("T")[0];
            await saveAdEngagementMetrics(ad.id, adInsights, today);
            console.log(
              `✅ Successfully saved engagement metrics for ad ${ad.id}`
            );
          } catch (engagementError) {
            console.error(
              `❌ Error saving engagement metrics for ad ${ad.id}:`,
              engagementError
            );
            // Don't fail the entire ad processing if engagement metrics fail
          }

          await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
        } catch (error: any) {
          console.error(`❌ Error processing ad ${ad.id}:`, error);
          console.error(`❌ Error stack:`, error.stack);
          totalErrors++;
          continue;
        }
      }

      await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
    } catch (error) {
      console.error(`Error getting ads for adset ${adsetId}:`, error);
      continue;
    }
  }

  console.log(`\n=== ADS PHASE SUMMARY ===`);
  console.log(`Processed ${processedAds.length} ads`);
  console.log(`Total errors: ${totalErrors}`);

  // Determine next action
  const totalProcessed = adsetsToProcess.length;

  if (totalProcessed < adsetIds.length) {
    // More adsets to process for ads
    console.log("Creating follow-up job for next batch of adsets (ads)");
    console.log(`Processed ${totalProcessed} of ${adsetIds.length} adsets`);

    // Pass the remaining adset IDs to the next job
    const remainingAdsetIds = adsetIds.slice(RATE_LIMIT_CONFIG.BATCH_SIZE);
    console.log(`Remaining adsets: ${remainingAdsetIds.length}`);

    await createFollowUpJob({
      accountId,
      timeframe,
      action: "get24HourData",
      requestId,
      phase: "ads",
      adsetIds: remainingAdsetIds, // Pass remaining adsets, not all adsets
      after: after,
    });
  } else {
    // All ads processed, mark as completed
    console.log("All ads processed, marking job as completed");
    console.log(`Total ads processed: ${processedAds.length}`);
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
    after: after,
    remainingTime: getRemainingTime(startTime),
    completed: totalProcessed >= adsetIds.length,
  };
}

// Export the POST handler with QStash signature verification
export const POST = verifySignatureAppRouter(handler);
