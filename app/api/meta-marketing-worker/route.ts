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
  BATCH_SIZE: 50, // Reduced from 100 to 50 to prevent overwhelming the API
  MIN_DELAY: 200, // Increased from 100 to 200ms for more conservative pacing
  BURST_DELAY: 500, // Increased from 300 to 500ms to reduce burst requests
  INSIGHTS_DELAY: 1000, // Increased from 600 to 1000ms for insights (most expensive calls)
  MAX_PROCESSING_TIME: 80000, // Keep at 80 seconds
  SAFETY_BUFFER: 5000, // Keep safety buffer
  // New: Additional delays for specific operations
  CAMPAIGN_DELAY: 300, // Delay between campaign processing
  ADSET_DELAY: 400, // Delay between adset processing
  AD_DELAY: 500, // Delay between ad processing (most intensive)
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
  iteration?: number; // Added iteration property
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
    // Increment iteration counter to prevent infinite loops
    const nextIteration = (payload.iteration || 0) + 1;
    const maxIterations = parseInt(process.env.MAX_WORKER_ITERATIONS || "50");

    if (nextIteration >= maxIterations) {
      console.log(
        `🛑 PREVENTING INFINITE LOOP: Would exceed max iterations (${maxIterations})`
      );
      console.log(
        `Current iteration: ${
          payload.iteration || 0
        }, Next would be: ${nextIteration}`
      );
      throw new Error(
        `Maximum iterations reached (${maxIterations}). Preventing infinite loop.`
      );
    }

    // 🛡️ ENHANCED VALIDATION: Don't create follow-up jobs without valid data
    if (
      payload.phase === "campaigns" &&
      payload.after &&
      payload.after.trim() === ""
    ) {
      console.log(
        "🛑 PREVENTING EMPTY CURSOR: No valid cursor for campaigns pagination"
      );
      throw new Error(
        "Cannot create follow-up job with empty cursor for campaigns"
      );
    }

    if (
      payload.phase === "adsets" &&
      (!payload.campaignIds || payload.campaignIds.length === 0)
    ) {
      console.log(
        "🛑 PREVENTING EMPTY CAMPAIGNS: No campaign IDs for adsets phase"
      );
      throw new Error(
        "Cannot create follow-up job without campaign IDs for adsets"
      );
    }

    if (
      payload.phase === "ads" &&
      (!payload.adsetIds || payload.adsetIds.length === 0)
    ) {
      console.log("🛑 PREVENTING EMPTY ADSETS: No adset IDs for ads phase");
      throw new Error("Cannot create follow-up job without adset IDs for ads");
    }

    // 🛡️ CURSOR VALIDATION: Don't create jobs with same cursor as previous
    if (payload.after && payload.after.trim() !== "") {
      console.log(`🔍 Validating cursor before job creation: ${payload.after}`);

      // Simple validation: cursor should be a reasonable length and format
      if (payload.after.length < 10 || payload.after.length > 500) {
        console.log(
          `🛑 INVALID CURSOR LENGTH: ${payload.after.length} characters`
        );
        throw new Error(
          `Invalid cursor length: ${payload.after.length} characters`
        );
      }
    }

    const baseUrl =
      process.env.WEBHOOK_BASE_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.NEXTAUTH_URL || "http://localhost:3000");

    const webhookUrl = `${baseUrl}/api/meta-marketing-worker`;

    const jobPayload = {
      ...payload,
      iteration: nextIteration, // Increment iteration
    };

    console.log("Creating follow-up job:", {
      phase: jobPayload.phase,
      iteration: nextIteration,
      maxIterations,
      requestId: jobPayload.requestId,
      after: jobPayload.after || "none",
      campaignIds: jobPayload.campaignIds?.length || 0,
      adsetIds: jobPayload.adsetIds?.length || 0,
      validation: "passed",
    });

    const response = await qstashClient.publishJSON({
      url: webhookUrl,
      body: jobPayload,
      retries: 3,
      delay: 2, // 2 seconds delay between chunks
      headers: {
        "Content-Type": "application/json",
        "X-Job-Type": "meta-marketing-sync-chunk",
        "X-Request-ID": jobPayload.requestId,
        "X-Phase": jobPayload.phase || "unknown",
        "X-Iteration": nextIteration.toString(),
      },
    });

    console.log(
      `✅ Follow-up job created successfully: ${response.messageId} (iteration ${nextIteration})`
    );
    return response;
  } catch (error) {
    console.error("❌ Error creating follow-up job:", error);

    // Don't throw the error if it's a validation error - just log and return null
    if (
      error instanceof Error &&
      (error.message.includes("PREVENTING") ||
        error.message.includes("Cannot create follow-up job") ||
        error.message.includes("Invalid cursor"))
    ) {
      console.log(
        "🛑 Follow-up job creation prevented by validation - this is expected behavior"
      );
      return null;
    }

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
  const maxRetries = 8; // Increased from 5 to 8 for better resilience

  while (true) {
    try {
      await delay(RATE_LIMIT_CONFIG.MIN_DELAY);
      const result = await operation();
      return result;
    } catch (error: any) {
      const errorCode = error?.response?.error?.code;
      const errorSubcode = error?.response?.error?.error_subcode;
      const isRateLimit = [17, 80000, 80003, 80004, 4, 613].includes(
        errorCode || 0
      );

      // Special handling for "User request limit reached" error
      const isUserRequestLimit = errorCode === 17 && errorSubcode === 2446079;

      if ((isRateLimit || isUserRequestLimit) && retries < maxRetries) {
        let backoffDelay;

        if (isUserRequestLimit) {
          // More aggressive backoff for "User request limit reached"
          // Start with 30 seconds and exponentially increase up to 5 minutes
          backoffDelay = Math.min(30000 * Math.pow(2, retries), 300000);
          console.log(
            `🚨 Facebook API User Request Limit Reached (Error 17-2446079). Waiting ${
              backoffDelay / 1000
            }s before retry ${retries + 1}/${maxRetries}...`
          );
        } else {
          // Standard rate limit backoff
          backoffDelay = Math.min(1000 * Math.pow(2, retries), 30000);
          console.log(
            `⏳ Rate limit hit (Error ${errorCode}). Waiting ${backoffDelay}ms before retry ${
              retries + 1
            }/${maxRetries}...`
          );
        }

        await delay(backoffDelay);
        retries++;
        continue;
      }

      // If it's a rate limit error but we've exhausted retries, log it clearly
      if (isRateLimit || isUserRequestLimit) {
        console.error(
          `❌ Rate limit error after ${maxRetries} retries. Error code: ${errorCode}, subcode: ${errorSubcode}`
        );
        console.error(
          `❌ Error message: ${
            error?.response?.error?.message || error.message
          }`
        );
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
  // 🚨 GLOBAL KILL SWITCH - STOPS ALL PROCESSING IMMEDIATELY
  // This will stop ALL existing jobs in the queue, not just new ones
  if (process.env.GLOBAL_WORKER_KILL_SWITCH === "true") {
    console.log(
      "🚨 GLOBAL KILL SWITCH ACTIVATED - STOPPING ALL WORKER PROCESSING"
    );
    console.log("🛑 This includes existing queued jobs and new requests");
    return Response.json(
      {
        success: false,
        error: "All worker processing has been globally disabled",
        killSwitch: true,
        globalStop: true,
        timestamp: new Date().toISOString(),
        message: "Set GLOBAL_WORKER_KILL_SWITCH=false to re-enable",
      },
      { status: 503 }
    );
  }

  const supabase = await createClient();
  const startTime = Date.now();
  let payload: ChunkedJobPayload | null = null;

  try {
    // 🚨 EMERGENCY DISABLE SWITCH
    if (process.env.WORKER_DISABLED === "true") {
      console.log("🚨 WORKER DISABLED via environment variable");
      return Response.json(
        {
          success: false,
          error: "Worker is disabled via WORKER_DISABLED environment variable",
          disabled: true,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    console.log("=== QStash Worker Started ===");
    console.log("Request headers:", {
      "content-type": request.headers.get("content-type"),
      "x-request-id": request.headers.get("x-request-id"),
      "user-agent": request.headers.get("user-agent"),
    });

    payload = await request.json();
    console.log("Background job started with payload:", payload);

    // Ensure payload is valid
    if (!payload) {
      throw new Error("Invalid payload received");
    }

    // 🛡️ ENHANCED SAFETY CHECKS TO PREVENT INFINITE LOOPS
    const maxIterations = parseInt(process.env.MAX_WORKER_ITERATIONS || "50");
    const currentIteration = payload.iteration || 0;

    if (currentIteration >= maxIterations) {
      console.log(
        `🛑 SAFETY STOP: Reached maximum iterations (${maxIterations})`
      );
      await updateJobStatus(
        supabase,
        payload.requestId,
        "completed",
        100,
        undefined,
        {
          message: "Job completed due to safety iteration limit",
          reason: "max_iterations_reached",
          iterations: currentIteration,
        }
      );
      return Response.json({
        success: true,
        requestId: payload.requestId,
        status: "completed_by_safety_limit",
        iterations: currentIteration,
      });
    }

    // 🛡️ CURSOR VALIDATION: Prevent same cursor loops
    if (payload.after && payload.after.trim() !== "") {
      console.log(`🔍 Validating cursor: ${payload.after}`);

      // Check if this cursor was used in recent iterations
      const cursorKey = `cursor_${payload.accountId}_${payload.phase}_${payload.after}`;
      const { data: recentCursor } = await supabase
        .from("background_jobs")
        .select("created_at")
        .eq("request_id", payload.requestId)
        .like("result_data", `%${payload.after}%`)
        .gte("created_at", new Date(Date.now() - 10 * 60 * 1000).toISOString()) // Last 10 minutes
        .limit(1);

      if (recentCursor && recentCursor.length > 0) {
        console.log(
          `🛑 CURSOR SAFETY: Same cursor detected in recent iterations, stopping pagination`
        );
        await updateJobStatus(
          supabase,
          payload.requestId,
          "completed",
          100,
          undefined,
          {
            message: "Job completed due to cursor safety check",
            reason: "duplicate_cursor_detected",
            cursor: payload.after,
          }
        );
        return Response.json({
          success: true,
          requestId: payload.requestId,
          status: "completed_by_cursor_safety",
          cursor: payload.after,
        });
      }
    }

    console.log(
      `🔄 Processing iteration ${currentIteration + 1}/${maxIterations}`
    );

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
      iteration: currentIteration,
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
          startTime,
          currentIteration
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
          startTime,
          currentIteration
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
          startTime,
          currentIteration
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
          startTime,
          currentIteration
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
            startTime,
            currentIteration
          );
        } else {
          throw new Error(`Invalid action/phase: ${action}/${phase}`);
        }
    }

    console.log("=== Background job phase completed successfully ===");
    console.log("Phase result:", {
      phase: result?.phase || phase,
      completed: "completed" in result ? result.completed : false,
      hasMoreAdsets: "hasMoreAdsets" in result ? result.hasMoreAdsets : false,
      remainingAdsets: "remainingAdsets" in result ? result.remainingAdsets : 0,
      processedAds: "processedAds" in result ? result.processedAds : 0,
    });

    // 🛡️ SAFETY CHECK: Ensure we don't return success if there's an error in the result
    if (result && typeof result === "object" && "error" in result) {
      console.error("Phase returned an error:", result.error);
      throw new Error(`Phase ${phase} failed: ${result.error}`);
    }

    return Response.json({
      success: true,
      requestId: payload.requestId,
      phase,
      iteration: currentIteration,
      result,
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("=== Background job failed ===");
    console.error("Error details:", error);
    console.error("Error stack:", error.stack);

    // Try to update job status to failed, but don't fail if we can't parse the request
    try {
      // Use the payload we already parsed, or fallback to headers
      let requestId = "unknown";

      if (payload && payload.requestId) {
        requestId = payload.requestId;
      } else {
        // Try to get requestId from headers as fallback
        const requestIdFromHeader = request.headers.get("X-Request-ID");
        requestId = requestIdFromHeader || "unknown";
      }

      console.log(`Updating job status to failed for requestId: ${requestId}`);
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
        requestId: payload?.requestId || "unknown",
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
  startTime: number,
  iteration: number
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
      iteration,
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
      iteration,
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
    iteration,
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
  startTime: number,
  iteration: number
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
      iteration,
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

    // Get campaigns with comprehensive fields and NO FILTERING
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

    console.log(`Retrieved ${campaigns.length} campaigns with current options`);

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
          iteration,
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
        // Get insights for this campaign
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
          totalErrors++;
        } else {
          console.log(`✅ Successfully stored campaign ${campaign.id}`);
          processedCampaigns.push(campaignData);
          campaignIds.push(campaign.id);
        }

        await delay(RATE_LIMIT_CONFIG.CAMPAIGN_DELAY);
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

        // 🛡️ SAFETY CHECK: Prevent infinite pagination with same cursor
        if (nextCursor === after) {
          console.log(
            `🛑 PAGINATION SAFETY: Same cursor detected, stopping pagination`
          );
          hasMore = false;
          nextCursor = "";
        }
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

    if (
      hasMore &&
      !shouldCreateFollowUpJob(startTime) &&
      nextCursor &&
      nextCursor !== after
    ) {
      // More campaigns to fetch
      console.log("🔄 Creating follow-up job for more campaigns");
      console.log(`Next cursor: ${nextCursor}`);

      try {
        const followUpResult = await createFollowUpJob({
          accountId,
          timeframe,
          action: "get24HourData",
          requestId,
          phase: "campaigns",
          after: nextCursor,
          iteration,
        });

        if (followUpResult) {
          console.log("✅ Follow-up job created successfully for campaigns");
        } else {
          console.log(
            "🛑 Follow-up job creation was prevented by validation - moving to adsets phase"
          );
          // Move to next phase
          await updateJobStatus(supabase, requestId, "processing", 60);

          if (campaignIds.length > 0) {
            const adsetJobResult = await createFollowUpJob({
              accountId,
              timeframe,
              action: "get24HourData",
              requestId,
              phase: "adsets",
              campaignIds: campaignIds,
              after: "",
              iteration,
            });

            if (adsetJobResult) {
              console.log("🚀 Adsets phase job created successfully");
            } else {
              console.log("⚠️ Could not create adsets job, completing");
              await updateJobStatus(supabase, requestId, "completed", 100);
            }
          } else {
            console.log("⚠️ No campaigns found, completing job");
            await updateJobStatus(supabase, requestId, "completed", 100);
          }
        }
      } catch (followUpError) {
        console.error(
          "❌ Error creating follow-up job for campaigns:",
          followUpError
        );
        // Move to next phase
        console.log("🔄 Moving to adsets phase due to follow-up job error");
        await updateJobStatus(supabase, requestId, "processing", 60);

        if (campaignIds.length > 0) {
          try {
            const adsetJobResult = await createFollowUpJob({
              accountId,
              timeframe,
              action: "get24HourData",
              requestId,
              phase: "adsets",
              campaignIds: campaignIds,
              after: "",
              iteration,
            });

            if (adsetJobResult) {
              console.log(
                "🚀 Adsets phase job created successfully after campaigns error"
              );
            } else {
              console.log(
                "⚠️ Could not create adsets job after campaigns error, completing"
              );
              await updateJobStatus(supabase, requestId, "completed", 100);
            }
          } catch (adsetJobError) {
            console.error(
              "❌ Error creating adsets job after campaigns error:",
              adsetJobError
            );
            await updateJobStatus(supabase, requestId, "completed", 100);
          }
        } else {
          console.log("⚠️ No campaigns found after error, completing job");
          await updateJobStatus(supabase, requestId, "completed", 100);
        }
      }
    } else {
      // All campaigns processed, move to adsets phase
      console.log("✅ All campaigns processed, starting adsets phase");
      console.log(`Total campaign IDs collected: ${campaignIds.length}`);
      await updateJobStatus(supabase, requestId, "processing", 60);

      if (campaignIds.length > 0) {
        try {
          const adsetJobResult = await createFollowUpJob({
            accountId,
            timeframe,
            action: "get24HourData",
            requestId,
            phase: "adsets",
            campaignIds: campaignIds,
            after: "",
            iteration,
          });

          if (adsetJobResult) {
            console.log("🚀 Adsets phase job created successfully");
          } else {
            console.log("⚠️ Could not create adsets job, completing");
            await updateJobStatus(supabase, requestId, "completed", 100);
          }
        } catch (adsetJobError) {
          console.error("❌ Error creating adsets job:", adsetJobError);
          await updateJobStatus(supabase, requestId, "completed", 100);
        }
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

// Process adsets phase
async function processAdsetsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  campaignIds: string[],
  after: string,
  startTime: number,
  iteration: number
) {
  // Check for cancellation at the start
  if (await checkJobCancellation(supabase, requestId)) {
    console.log("Job cancelled, stopping adsets phase");
    return { phase: "adsets", status: "cancelled" };
  }

  console.log("=== PROCESSING ADSETS PHASE ===");
  console.log(`Campaign IDs to process: ${campaignIds.length}`);

  // Process campaigns in batches
  const batchSize = Math.min(RATE_LIMIT_CONFIG.BATCH_SIZE, campaignIds.length);
  const currentBatch = campaignIds.slice(0, batchSize);
  const remainingCampaigns = campaignIds.slice(batchSize);

  const processedAdsets = [];
  const adsetIds = [];
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
        iteration,
      });
      break;
    }

    const campaignId = currentBatch[i];
    const progress =
      60 + Math.floor(((i + 1) / Math.max(1, currentBatch.length)) * 20); // 60% to 80%

    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Progress: ${progress}%`);

    await updateJobStatus(supabase, requestId, "processing", progress);

    try {
      const campaign = new Campaign(campaignId);

      // Get adsets for this campaign with comprehensive fields
      const adsetsResponse = await withRateLimitRetry(
        async () => {
          const campaign = new Campaign(campaignId);
          return campaign.getAdSets(adsetFields, {
            limit: 500, // Significantly increased limit
          });
        },
        {
          accountId,
          endpoint: "adsets",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      // More detailed response parsing
      let adsets: any[] = [];
      if (Array.isArray(adsetsResponse)) {
        adsets = adsetsResponse;
      } else if (adsetsResponse && typeof adsetsResponse === "object") {
        const responseObj = adsetsResponse as any;
        if (responseObj.data) {
          adsets = responseObj.data;
        } else if (responseObj.length !== undefined) {
          adsets = Array.from(responseObj);
        }
      }

      console.log(
        `✅ Found ${adsets.length} adsets for campaign ${campaignId}`
      );

      if (adsets.length === 0) {
        console.log(`⚠️ No adsets found for campaign ${campaignId}`);
        continue;
      }

      // Process each adset
      for (let j = 0; j < adsets.length; j++) {
        const adset = adsets[j];
        console.log(`\n--- Processing adset ${j + 1}/${adsets.length} ---`);
        console.log(`Adset ID: ${adset.id}`);
        console.log(`Adset name: ${adset.name}`);

        try {
          // Get insights for this adset
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
              console.log(`✅ Adset insights retrieved for ${adset.id}`);
            } else {
              console.log(`⚠️ No insights data for adset ${adset.id}`);
            }
          } catch (insightsError) {
            console.error(
              `❌ Error fetching insights for adset ${adset.id}:`,
              insightsError
            );
            adsetInsights = null;
          }

          // Create comprehensive adset data structure
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

          const { error: adsetError } = await supabase
            .from("meta_ad_sets")
            .upsert([adsetData], {
              onConflict: "ad_set_id",
              ignoreDuplicates: false,
            });

          if (adsetError) {
            console.error(`❌ Error storing adset ${adset.id}:`, adsetError);
            totalErrors++;
          } else {
            console.log(`✅ Successfully stored adset ${adset.id}`);
            processedAdsets.push(adsetData);
            adsetIds.push(adset.id);
          }

          await delay(RATE_LIMIT_CONFIG.ADSET_DELAY);
        } catch (error: any) {
          console.error(`❌ Error processing adset ${adset.id}:`, error);
          totalErrors++;
          continue;
        }
      }

      await delay(RATE_LIMIT_CONFIG.CAMPAIGN_DELAY);
    } catch (error: any) {
      console.error(`❌ Error processing campaign ${campaignId}:`, error);
      totalErrors++;
      continue;
    }
  }

  console.log(`\n=== ADSETS PHASE SUMMARY ===`);
  console.log(`Total adsets processed: ${processedAdsets.length}`);
  console.log(`Total errors: ${totalErrors}`);
  console.log(`Adset IDs collected: ${adsetIds.length}`);

  // Determine next action
  if (remainingCampaigns.length > 0) {
    // More campaigns to process
    console.log("🔄 Creating follow-up job for remaining campaigns");

    try {
      const followUpResult = await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "adsets",
        campaignIds: remainingCampaigns,
        after: "",
        iteration,
      });

      if (followUpResult) {
        console.log(
          "✅ Follow-up job created successfully for remaining campaigns"
        );
        return {
          processedAdsets: processedAdsets.length,
          phase: "adsets",
          after: after,
          remainingTime: getRemainingTime(startTime),
          completed: false,
          hasMoreAdsets: true,
          remainingAdsets: remainingCampaigns.length,
        };
      } else {
        console.log(
          "🛑 Follow-up job creation was prevented by validation - completing job"
        );
        await updateJobStatus(
          supabase,
          requestId,
          "completed",
          100,
          undefined,
          {
            message: "Job completed - follow-up prevented by validation",
            totalPhases: 4,
            processedAds: processedAdsets.length,
            summary: {
              totalProcessed: processedAdsets.length,
              completedAt: new Date().toISOString(),
              reason: "Follow-up job validation prevented infinite loop",
            },
          }
        );
      }
    } catch (followUpError) {
      console.error(
        "❌ Error creating follow-up job for remaining adsets:",
        followUpError
      );
      console.log("🔄 Completing job due to follow-up job error");
      await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
        message: "Job completed due to follow-up job error",
        totalPhases: 4,
        processedAds: processedAdsets.length,
        error:
          followUpError instanceof Error
            ? followUpError.message
            : "Unknown error",
        summary: {
          totalProcessed: processedAdsets.length,
          completedAt: new Date().toISOString(),
          reason: "Follow-up job creation failed",
        },
      });
    }
  } else {
    // All ads processed, mark as completed
    console.log("🎉 ALL ADS PROCESSED - NO MORE ADSETS REMAINING");
    console.log(`Total ads processed in this batch: ${processedAdsets.length}`);
    await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
      message: "All phases completed successfully",
      totalPhases: 4,
      processedAds: processedAdsets.length,
      summary: {
        totalProcessed: processedAdsets.length,
        completedAt: new Date().toISOString(),
        reason: "All adsets processed successfully",
      },
    });
  }

  return {
    processedAdsets: processedAdsets.length,
    phase: "adsets",
    after: after,
    remainingTime: getRemainingTime(startTime),
    completed: remainingCampaigns.length === 0,
    hasMoreAdsets: remainingCampaigns.length > 0,
    remainingAdsets: remainingCampaigns.length,
  };
}

// Process ads phase
async function processAdsPhase(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  adsetIds: string[],
  after: string,
  startTime: number,
  iteration: number
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
      iteration,
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
        iteration,
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
          return adset.getAds(adFields, {
            limit: 500, // Significantly increased limit from 100 to 500
          });
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

          // Get insights for this ad
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
              console.log(`✅ Ad insights retrieved for ${ad.id}`);
            } else {
              console.log(`⚠️ No insights data for ad ${ad.id}`);
            }
          } catch (insightsError) {
            console.error(
              `❌ Error fetching insights for ad ${ad.id}:`,
              insightsError
            );
            adInsights = null;
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
            creative_id: ad.creative?.id || null,
            creative_type: "UNKNOWN",
            asset_feed_spec: null,
            object_story_spec: ad.creative?.object_story_spec || null,
            tracking_specs: ad.tracking_specs || null,
            conversion_specs: ad.conversion_specs || null,
            tracking_and_conversion_specs:
              ad.tracking_and_conversion_specs || null,
            source_ad_id: ad.source_ad_id || null,
            recommendations: ad.recommendations || null,
            issues_info: ad.issues_info || null,
            engagement_audience: ad.engagement_audience || null,
            preview_url: ad.preview_url || null,
            template_url: ad.template_url || null,
            thumbnail_url: ad.thumbnail_url || null,
            image_url: null,
            video_id: null,
            instagram_permalink_url: ad.instagram_permalink_url || null,
            effective_object_story_id: ad.effective_object_story_id || null,
            url_tags: ad.url_tags || null,
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

          console.log(`💾 Attempting to store ad ${ad.id}`);

          const { error: adError } = await supabase
            .from("meta_ads")
            .upsert([adData], {
              onConflict: "ad_id",
              ignoreDuplicates: false,
            });

          if (adError) {
            console.error(`❌ Error storing ad ${ad.id}:`, adError);
            totalErrors++;
          } else {
            processedAds.push(adData);
            console.log(`✅ Successfully stored ad ${ad.id}`);
          }

          await delay(RATE_LIMIT_CONFIG.AD_DELAY);
        } catch (error: any) {
          console.error(`❌ Error processing ad ${ad.id}:`, error);
          totalErrors++;
          continue;
        }
      }

      await delay(RATE_LIMIT_CONFIG.AD_DELAY);
    } catch (error) {
      console.error(`Error getting ads for adset ${adsetId}:`, error);
      continue;
    }
  }

  console.log(`\n=== ADS PHASE SUMMARY ===`);
  console.log(`Total ads processed: ${processedAds.length}`);
  console.log(`Total errors: ${totalErrors}`);

  // Determine next action
  const totalProcessed = adsetsToProcess.length;
  const remainingAdsetIds = adsetIds.slice(RATE_LIMIT_CONFIG.BATCH_SIZE);

  console.log(`\n=== ADS PHASE COMPLETION CHECK ===`);
  console.log(`Adsets in current batch: ${adsetsToProcess.length}`);
  console.log(`Total adsets provided: ${adsetIds.length}`);
  console.log(`Remaining adsets after this batch: ${remainingAdsetIds.length}`);

  // 🛡️ CRITICAL FIX: Check if there are actually remaining adsets to process
  if (remainingAdsetIds.length > 0) {
    // More adsets to process for ads
    console.log("Creating follow-up job for next batch of adsets (ads)");

    try {
      const followUpResult = await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "ads",
        adsetIds: remainingAdsetIds, // Pass remaining adsets, not all adsets
        after: after,
        iteration,
      });

      if (followUpResult) {
        console.log(
          "✅ Follow-up job created successfully for remaining adsets"
        );
        return {
          processedAds: processedAds.length,
          phase: "ads",
          after: after,
          remainingTime: getRemainingTime(startTime),
          completed: false,
          hasMoreAdsets: true,
          remainingAdsets: remainingAdsetIds.length,
        };
      } else {
        console.log(
          "🛑 Follow-up job creation was prevented by validation - completing job"
        );
        await updateJobStatus(
          supabase,
          requestId,
          "completed",
          100,
          undefined,
          {
            message: "Job completed - follow-up prevented by validation",
            totalPhases: 4,
            processedAds: processedAds.length,
            summary: {
              totalProcessed: processedAds.length,
              completedAt: new Date().toISOString(),
              reason: "Follow-up job validation prevented infinite loop",
            },
          }
        );
      }
    } catch (followUpError) {
      console.error(
        "❌ Error creating follow-up job for remaining adsets:",
        followUpError
      );
      console.log("🔄 Completing job due to follow-up job error");
      await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
        message: "Job completed due to follow-up job error",
        totalPhases: 4,
        processedAds: processedAds.length,
        error:
          followUpError instanceof Error
            ? followUpError.message
            : "Unknown error",
        summary: {
          totalProcessed: processedAds.length,
          completedAt: new Date().toISOString(),
          reason: "Follow-up job creation failed",
        },
      });
    }
  } else {
    // All ads processed, mark as completed
    console.log("🎉 ALL ADS PROCESSED - NO MORE ADSETS REMAINING");
    console.log(`Total ads processed in this batch: ${processedAds.length}`);
    await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
      message: "All phases completed successfully",
      totalPhases: 4,
      processedAds: processedAds.length,
      summary: {
        totalProcessed: processedAds.length,
        completedAt: new Date().toISOString(),
        reason: "All adsets processed successfully",
      },
    });
  }

  return {
    processedAds: processedAds.length,
    phase: "ads",
    after: after,
    remainingTime: getRemainingTime(startTime),
    completed: remainingAdsetIds.length === 0,
    hasMoreAdsets: remainingAdsetIds.length > 0,
    remainingAdsets: remainingAdsetIds.length,
  };
}

// Export the POST handler with QStash signature verification
export const POST = verifySignatureAppRouter(handler);
