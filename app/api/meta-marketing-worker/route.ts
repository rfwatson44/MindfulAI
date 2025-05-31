import { NextResponse } from "next/server";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import {
  FacebookAdsApi,
  AdAccount,
  Campaign,
  AdSet,
  Ad,
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

import {
  mapToValidEffectiveStatus,
  safeParseInt,
  safeParseFloat,
} from "@/utils/meta-marketing/helpers";

// Rate limiting configuration with environment variable overrides
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
  BATCH_SIZE: parseInt(process.env.META_WORKER_BATCH_SIZE || "25"), // Configurable batch size
  MIN_DELAY: parseInt(process.env.META_WORKER_MIN_DELAY || "150"), // Configurable delays
  BURST_DELAY: parseInt(process.env.META_WORKER_BURST_DELAY || "300"),
  INSIGHTS_DELAY: parseInt(process.env.META_WORKER_INSIGHTS_DELAY || "600"),
  // Reduced max processing time to prevent Vercel timeouts
  MAX_PROCESSING_TIME: parseInt(process.env.META_WORKER_MAX_TIME || "45000"), // Reduced from 60s to 45s
  SAFETY_BUFFER: parseInt(process.env.META_WORKER_SAFETY_BUFFER || "10000"), // Increased safety buffer
  // Enhanced time management
  CAMPAIGN_DELAY: parseInt(process.env.META_WORKER_CAMPAIGN_DELAY || "200"),
  ADSET_DELAY: parseInt(process.env.META_WORKER_ADSET_DELAY || "250"),
  AD_DELAY: parseInt(process.env.META_WORKER_AD_DELAY || "300"),
  // Time-based chunking - reduced for better timeout prevention
  MAX_ITEMS_PER_CHUNK: parseInt(process.env.META_WORKER_MAX_ITEMS || "15"), // Reduced from 20 to 15
  TIME_CHECK_INTERVAL: parseInt(process.env.META_WORKER_TIME_CHECK || "3"), // More frequent checks
  // Memory management
  MEMORY_CHECK_INTERVAL: parseInt(process.env.META_WORKER_MEMORY_CHECK || "10"), // Check memory every 10 items
  MAX_MEMORY_USAGE: parseInt(process.env.META_WORKER_MAX_MEMORY || "400"), // 400MB limit
};

// Simple circuit breaker for Meta API calls
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private readonly threshold = 5; // Number of failures before opening circuit
  private readonly timeout = 60000; // 1 minute timeout

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.isOpen()) {
      throw new Error("Circuit breaker is open - Meta API appears to be down");
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private isOpen(): boolean {
    return (
      this.failures >= this.threshold &&
      Date.now() - this.lastFailureTime < this.timeout
    );
  }

  private onSuccess(): void {
    this.failures = 0;
    this.lastFailureTime = 0;
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    console.log(
      `🔥 Circuit breaker failure count: ${this.failures}/${this.threshold}`
    );
  }

  getStatus(): { isOpen: boolean; failures: number; lastFailureTime: number } {
    return {
      isOpen: this.isOpen(),
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

// Global circuit breaker instance
const metaApiCircuitBreaker = new CircuitBreaker();

// Meta API configuration
const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN!,
};

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Memory monitoring helper
function getMemoryUsage(): { used: number; total: number; percentage: number } {
  if (typeof process !== "undefined" && process.memoryUsage) {
    const usage = process.memoryUsage();
    const usedMB = Math.round(usage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(usage.heapTotal / 1024 / 1024);
    const percentage = Math.round((usedMB / totalMB) * 100);

    return { used: usedMB, total: totalMB, percentage };
  }
  return { used: 0, total: 0, percentage: 0 };
}

// Check if memory usage is too high
function shouldStopForMemory(): boolean {
  const memory = getMemoryUsage();
  const isHighMemory = memory.used > RATE_LIMIT_CONFIG.MAX_MEMORY_USAGE;

  if (isHighMemory) {
    console.log(
      `🧠 High memory usage detected: ${memory.used}MB (${memory.percentage}%)`
    );
  }

  return isHighMemory;
}

// Force garbage collection if available
function forceGarbageCollection(): void {
  try {
    if (global.gc) {
      global.gc();
      console.log("🗑️ Forced garbage collection");
    }
  } catch (error) {
    // Ignore errors if gc is not available
  }
}

// Time management helper - More aggressive timeout prevention
function shouldCreateFollowUpJob(startTime: number): boolean {
  const elapsedTime = Date.now() - startTime;
  const timeLimit =
    RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME - RATE_LIMIT_CONFIG.SAFETY_BUFFER;

  console.log(`⏱️ Time check: ${elapsedTime}ms elapsed, limit: ${timeLimit}ms`);

  return elapsedTime > timeLimit;
}

function getRemainingTime(startTime: number): number {
  const elapsedTime = Date.now() - startTime;
  const remaining = Math.max(
    0,
    RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME - elapsedTime
  );

  if (remaining < RATE_LIMIT_CONFIG.SAFETY_BUFFER) {
    console.log(
      `⚠️ WARNING: Only ${remaining}ms remaining, should create follow-up job`
    );
  }

  return remaining;
}

// New: Check if we should stop processing due to time constraints
function shouldStopProcessing(
  startTime: number,
  itemsProcessed: number
): boolean {
  const elapsedTime = Date.now() - startTime;
  const timeLimit =
    RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME - RATE_LIMIT_CONFIG.SAFETY_BUFFER;

  // Stop if we're approaching time limit
  if (elapsedTime > timeLimit) {
    console.log(
      `🛑 Stopping processing: Time limit reached (${elapsedTime}ms > ${timeLimit}ms)`
    );
    return true;
  }

  // Stop if we've processed enough items for this chunk
  if (itemsProcessed >= RATE_LIMIT_CONFIG.MAX_ITEMS_PER_CHUNK) {
    console.log(
      `🛑 Stopping processing: Item limit reached (${itemsProcessed} >= ${RATE_LIMIT_CONFIG.MAX_ITEMS_PER_CHUNK})`
    );
    return true;
  }

  // Stop if memory usage is too high
  if (shouldStopForMemory()) {
    console.log("🛑 Stopping processing: High memory usage detected");
    return true;
  }

  return false;
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
  adIds?: string[]; // Add support for specific ad IDs
  after?: string; // Cursor for pagination instead of offset
  totalItems?: number;
  processedItems?: number;
  accountInfo?: string; // JSON string for passing account info between phases
  iteration?: number; // Added iteration property
  incremental?: boolean; // Flag for incremental sync
  reason?: string; // Reason for the sync (webhook_notification, etc.)
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

// Date range helpers with improved logic for zero data issues
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

// NEW: Get date range for last 7 days (better for recent data)
function getLast7DaysDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// NEW: Get date range for last 30 days (good middle ground)
function getLast30DaysDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// NEW: Get date range accounting for Meta's 72-hour data delay
function getDateRangeWithDelay() {
  const endDate = new Date();
  endDate.setDate(endDate.getDate() - 3); // Account for 72-hour delay
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 33); // 30 days + 3 day delay
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

function getDateRangeForTimeframe(timeframe: string) {
  switch (timeframe) {
    case "24h":
      return getLast24HoursDateRange();
    case "7d":
      return getLast7DaysDateRange();
    case "30d":
      return getLast30DaysDateRange();
    case "30d-delayed":
      return getDateRangeWithDelay();
    case "6-month":
    default:
      return getLast6MonthsDateRange();
  }
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
  const maxRetries = 3;
  let lastError: any;

  // Check circuit breaker status
  const circuitStatus = metaApiCircuitBreaker.getStatus();
  if (circuitStatus.isOpen) {
    console.log("🔥 Circuit breaker is open, skipping Meta API call");
    throw new Error(
      `Circuit breaker is open - Meta API appears to be down. Failures: ${circuitStatus.failures}`
    );
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🔄 Attempt ${attempt}/${maxRetries} for ${context.endpoint} (${context.callType})`
      );

      // Execute operation through circuit breaker
      const result = await metaApiCircuitBreaker.execute(operation);

      // Log successful operation
      console.log(`✅ ${context.endpoint} ${context.callType} successful`);

      return result;
    } catch (error: any) {
      lastError = error;
      console.error(
        `❌ Attempt ${attempt}/${maxRetries} failed for ${context.endpoint}:`,
        error.message
      );

      // If circuit breaker is open, don't retry
      if (error.message?.includes("Circuit breaker is open")) {
        throw error;
      }

      // Handle specific Meta API errors
      if (error.code) {
        switch (error.code) {
          case 1: // API Unknown error
            console.log("🔄 API Unknown error, retrying...");
            break;
          case 2: // API Service error
            console.log("🔄 API Service error, retrying...");
            break;
          case 4: // API Too Many Calls
            console.log("⏳ Rate limit hit, waiting before retry...");
            await delay(RATE_LIMIT_CONFIG.MIN_DELAY * 2);
            break;
          case 17: // User request limit reached
            console.log("⏳ User request limit reached, waiting...");
            await delay(RATE_LIMIT_CONFIG.MIN_DELAY * 3);
            break;
          case 80004: // There have been too many calls to this ad-account
            console.log("⏳ Account rate limit hit, waiting longer...");
            await delay(RATE_LIMIT_CONFIG.MIN_DELAY * 5);
            break;
          case 190: // Invalid OAuth 2.0 Access Token
            console.error("🚨 Invalid access token - this is a critical error");
            throw error; // Don't retry for auth errors
          case 100: // Invalid parameter
            console.error("🚨 Invalid parameter - this is a critical error");
            throw error; // Don't retry for parameter errors
          default:
            console.log(`🔄 Unknown error code ${error.code}, retrying...`);
        }
      }

      // Handle network/timeout errors
      if (
        error.message?.includes("timeout") ||
        error.message?.includes("ETIMEDOUT")
      ) {
        console.log("⏳ Timeout error, waiting before retry...");
        await delay(RATE_LIMIT_CONFIG.MIN_DELAY * 2);
      }

      // Handle connection errors
      if (
        error.message?.includes("ECONNRESET") ||
        error.message?.includes("ENOTFOUND")
      ) {
        console.log("🌐 Connection error, waiting before retry...");
        await delay(RATE_LIMIT_CONFIG.MIN_DELAY * 2);
      }

      // If this is the last attempt, throw the error
      if (attempt === maxRetries) {
        console.error(
          `💥 All ${maxRetries} attempts failed for ${context.endpoint}`
        );

        // Log the error to Supabase for monitoring
        try {
          await context.supabase.from("api_errors").insert({
            account_id: context.accountId,
            endpoint: context.endpoint,
            error_code: error.code || null,
            error_message: error.message || "Unknown error",
            call_type: context.callType,
            attempts: maxRetries,
            timestamp: new Date().toISOString(),
          });
        } catch (logError) {
          console.error("Failed to log error to database:", logError);
        }

        throw error;
      }

      // Wait before next attempt (exponential backoff)
      const waitTime = RATE_LIMIT_CONFIG.MIN_DELAY * Math.pow(2, attempt - 1);
      console.log(`⏳ Waiting ${waitTime}ms before attempt ${attempt + 1}...`);
      await delay(waitTime);
    }
  }

  throw lastError;
}

// Get insights helper with improved error handling and fallback strategies for zero data issues
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
        // STRATEGY 1: Try with the requested timeframe and full metrics
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

        // Validate if we got meaningful data
        if (result && hasValidInsightsData(result)) {
          console.log(`✅ Insights fetched successfully for ${entity.id}:`, {
            impressions: result.impressions,
            clicks: result.clicks,
            spend: result.spend,
            actions_count: result.actions?.length || 0,
          });
          return result;
        } else if (result) {
          console.log(
            `⚠️ Got insights but with zero/null values for ${entity.id}:`,
            {
              impressions: result.impressions,
              clicks: result.clicks,
              spend: result.spend,
            }
          );
        }

        // STRATEGY 2: Try with 30-day delayed range (accounting for Meta's 72-hour delay)
        if (timeframe === "6-month") {
          console.log(`🔄 Trying delayed range for ${entity.id}...`);
          const delayedRange = getDateRangeWithDelay();

          const delayedInsights = await entity.getInsights(
            [
              "impressions",
              "clicks",
              "reach",
              "spend",
              "actions",
              "cost_per_action_type",
              "inline_link_clicks",
              "inline_post_engagement",
            ],
            {
              time_range: delayedRange,
              breakdowns: [],
            }
          );

          const delayedResult = (delayedInsights?.[0] as InsightResult) || null;
          if (delayedResult && hasValidInsightsData(delayedResult)) {
            console.log(`✅ Delayed insights fetched for ${entity.id}`);
            return delayedResult;
          }
        }

        // STRATEGY 3: Try with last 7 days (most recent reliable data)
        console.log(`🔄 Trying 7-day fallback for ${entity.id}...`);
        const weekRange = getLast7DaysDateRange();

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
        if (weekResult && hasValidInsightsData(weekResult)) {
          console.log(`✅ Fallback insights (7-day) fetched for ${entity.id}`);
          return weekResult;
        }

        // STRATEGY 4: Try with 30-day timeframe for historical data
        console.log(`🔄 Trying 30-day fallback for ${entity.id}...`);
        const monthRange = getLast30DaysDateRange();

        const monthInsights = await entity.getInsights(
          [
            "impressions",
            "clicks",
            "reach",
            "spend",
            "actions",
            "inline_link_clicks",
            "inline_post_engagement",
            "video_30_sec_watched_actions",
            "video_p25_watched_actions",
            "video_thruplay_watched_actions",
            "video_continuous_2_sec_watched_actions",
          ],
          {
            time_range: monthRange,
            breakdowns: [],
          }
        );

        const monthResult = (monthInsights?.[0] as InsightResult) || null;
        if (monthResult && hasValidInsightsData(monthResult)) {
          console.log(`✅ Fallback insights (30-day) fetched for ${entity.id}`);
          return monthResult;
        }

        // STRATEGY 5: Try with minimal metrics and shorter range
        console.log(`🔄 Trying minimal metrics for ${entity.id}...`);
        const minimalRange = {
          since: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split("T")[0],
          until: new Date().toISOString().split("T")[0],
        };

        const minimalInsights = await entity.getInsights(
          ["impressions", "clicks", "spend"],
          {
            time_range: minimalRange,
          }
        );

        const minimalResult = (minimalInsights?.[0] as InsightResult) || null;
        if (minimalResult) {
          console.log(`✅ Minimal insights fetched for ${entity.id}`);
          return minimalResult;
        }

        console.log(
          `⚠️ No insights data available for ${entity.id} in any timeframe`
        );
        return null;
      } catch (insightsError: any) {
        console.error(
          `❌ Error fetching insights for ${entity.id}:`,
          insightsError
        );

        // If it's a permissions or data availability error, try a simpler request
        if (
          insightsError?.response?.error?.code === 100 ||
          insightsError?.response?.error?.message?.includes(
            "No data available"
          ) ||
          insightsError?.response?.error?.message?.includes(
            "Unsupported get request"
          )
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

// NEW: Helper function to validate if insights data is meaningful
function hasValidInsightsData(insights: InsightResult): boolean {
  if (!insights) return false;

  // Check if we have any meaningful metrics (not all zeros/nulls)
  const impressions = parseInt(insights.impressions || "0");
  const clicks = parseInt(insights.clicks || "0");
  const spend = parseFloat(insights.spend || "0");

  // Consider data valid if we have impressions OR spend OR clicks
  return impressions > 0 || spend > 0 || clicks > 0;
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

  // Set up timeout handler to prevent Vercel timeouts
  const timeoutHandler = setTimeout(() => {
    console.log(
      "⚠️ TIMEOUT WARNING: Function approaching Vercel timeout limit"
    );
    // Force garbage collection before timeout
    forceGarbageCollection();
  }, RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME - 5000); // 5 seconds before our limit

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

    // Log initial memory usage
    const initialMemory = getMemoryUsage();
    console.log(
      `🧠 Initial memory usage: ${initialMemory.used}MB (${initialMemory.percentage}%)`
    );

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

    // Log configuration for debugging
    console.log("🔧 Worker Configuration:", {
      maxProcessingTime: RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME,
      safetyBuffer: RATE_LIMIT_CONFIG.SAFETY_BUFFER,
      maxItemsPerChunk: RATE_LIMIT_CONFIG.MAX_ITEMS_PER_CHUNK,
      maxMemoryUsage: RATE_LIMIT_CONFIG.MAX_MEMORY_USAGE,
      batchSize: RATE_LIMIT_CONFIG.BATCH_SIZE,
      timeCheckInterval: RATE_LIMIT_CONFIG.TIME_CHECK_INTERVAL,
      memoryCheckInterval: RATE_LIMIT_CONFIG.MEMORY_CHECK_INTERVAL,
    });

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
          currentIteration,
          payload.adsetIds || [] // Pass existing adset IDs from payload
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
        // Handle incremental sync
        if (action === "incrementalSync") {
          console.log("=== EXECUTING INCREMENTAL SYNC ===");
          console.log(`Incremental sync reason: ${payload.reason}`);
          console.log(`Incremental sync type: ${phase}`);

          result = await processIncrementalSync(
            accountId,
            supabase,
            timeframe,
            payload.requestId,
            payload,
            startTime,
            currentIteration
          );
        }
        // Legacy support for non-chunked jobs
        else if (action === "get24HourData" || action === "getData") {
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

    // Log final memory usage
    const finalMemory = getMemoryUsage();
    console.log(
      `🧠 Final memory usage: ${finalMemory.used}MB (${finalMemory.percentage}%)`
    );

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

    // Clear timeout handler on success
    clearTimeout(timeoutHandler);

    return Response.json({
      success: true,
      requestId: payload.requestId,
      phase,
      iteration: currentIteration,
      result,
      timestamp: new Date().toISOString(),
      memoryUsage: finalMemory,
    });
  } catch (error: any) {
    // Clear timeout handler on error
    clearTimeout(timeoutHandler);

    console.error("=== Background job failed ===");
    console.error("Error details:", error);
    console.error("Error stack:", error.stack);

    // Log memory usage on error
    const errorMemory = getMemoryUsage();
    console.log(
      `🧠 Memory usage at error: ${errorMemory.used}MB (${errorMemory.percentage}%)`
    );

    // Force garbage collection on error
    forceGarbageCollection();

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
        (error as any).message,
        {
          error: (error as any).message,
          stack: (error as any).stack,
          memoryUsage: errorMemory,
          timestamp: new Date().toISOString(),
        }
      );
      console.log("Job status updated to failed");
    } catch (updateError) {
      console.error("Error updating job status to failed:", updateError);
    }

    return Response.json(
      {
        success: false,
        error: (error as any).message || "Unknown error occurred",
        requestId: payload?.requestId || "unknown",
        memoryUsage: errorMemory,
        timestamp: new Date().toISOString(),
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

    // Process each campaign with enhanced time management
    for (let i = 0; i < campaigns.length; i++) {
      // Check time and item limits frequently
      if (shouldStopProcessing(startTime, i)) {
        console.log(
          `⏱️ Stopping campaigns processing after ${i} items due to time/item limits`
        );

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

        return {
          phase: "campaigns",
          status: "chunked",
          processed: i,
          total: campaigns.length,
          nextCursor,
        };
      }

      // Check for cancellation every 5 items
      if (i % RATE_LIMIT_CONFIG.TIME_CHECK_INTERVAL === 0) {
        if (await checkJobCancellation(supabase, requestId)) {
          console.log("Job cancelled during campaigns processing");
          return { phase: "campaigns", status: "cancelled" };
        }

        // Check memory usage periodically
        if (i % RATE_LIMIT_CONFIG.MEMORY_CHECK_INTERVAL === 0) {
          const memory = getMemoryUsage();
          console.log(
            `🧠 Memory check at campaign ${i}: ${memory.used}MB (${memory.percentage}%)`
          );

          if (shouldStopForMemory()) {
            console.log(
              "🛑 Stopping campaigns processing due to high memory usage"
            );

            // Get the proper next cursor from the campaigns object
            let nextCursor = "";
            try {
              if (campaigns.hasNext && campaigns.hasNext()) {
                const paging = campaigns.paging;
                nextCursor = paging?.cursors?.after || "";
                console.log(`Got next cursor from paging: ${nextCursor}`);
              }
            } catch (cursorError) {
              console.warn("Could not get next cursor:", cursorError);
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

            return {
              phase: "campaigns",
              status: "chunked_memory",
              processed: i,
              total: campaigns.length,
              nextCursor,
              memoryUsage: memory,
            };
          }

          // Force garbage collection every 20 items
          if (i % 20 === 0 && i > 0) {
            forceGarbageCollection();
          }
        }
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
          status:
            mapToValidEffectiveStatus(
              campaign.effective_status,
              campaign.configured_status
            ) || "UNKNOWN",
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
  iteration: number,
  existingAdsetIds: string[] = [] // Add parameter for existing adset IDs
) {
  // Check for cancellation at the start
  if (await checkJobCancellation(supabase, requestId)) {
    console.log("Job cancelled, stopping adsets phase");
    return { phase: "adsets", status: "cancelled" };
  }

  console.log("=== PROCESSING ADSETS PHASE ===");
  console.log(`Campaign IDs to process: ${campaignIds.length}`);
  console.log(
    `Existing adset IDs from previous iterations: ${existingAdsetIds.length}`
  );

  // Process campaigns in batches
  const batchSize = Math.min(RATE_LIMIT_CONFIG.BATCH_SIZE, campaignIds.length);
  const currentBatch = campaignIds.slice(0, batchSize);
  const remainingCampaigns = campaignIds.slice(batchSize);

  const processedAdsets = [];
  // Start with existing adset IDs from previous iterations
  const adsetIds = [...existingAdsetIds];
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
    // Check time and item limits more frequently
    if (shouldStopProcessing(startTime, i)) {
      console.log(
        `⏱️ Stopping adsets processing after ${i} campaigns due to time/item limits`
      );
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "adsets",
        campaignIds: [...currentBatch.slice(i), ...remainingCampaigns],
        adsetIds: adsetIds, // Include accumulated adset IDs
        after: "",
        iteration,
      });

      return {
        phase: "adsets",
        status: "chunked",
        processed: i,
        total: currentBatch.length,
        remaining: [...currentBatch.slice(i), ...remainingCampaigns].length,
      };
    }

    // Check for cancellation every 3 campaigns
    if (i % 3 === 0) {
      if (await checkJobCancellation(supabase, requestId)) {
        console.log("Job cancelled during adsets processing");
        return { phase: "adsets", status: "cancelled" };
      }
    }

    const campaignId = currentBatch[i];
    const progress =
      60 + Math.floor(((i + 1) / Math.max(1, currentBatch.length)) * 20); // 60% to 80%

    console.log(`Campaign ID: ${campaignId}`);
    console.log(`Progress: ${progress}%`);
    console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

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
            status: mapToValidEffectiveStatus(
              adset.status,
              adset.effective_status,
              adset.configured_status
            ),
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
        adsetIds: adsetIds, // Include accumulated adset IDs
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
  } else if (adsetIds.length > 0) {
    // All campaigns processed, now transition to ads phase
    console.log("🎯 ALL CAMPAIGNS PROCESSED - TRANSITIONING TO ADS PHASE");
    console.log(`Total adset IDs collected: ${adsetIds.length}`);

    try {
      const followUpResult = await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "ads",
        adsetIds: adsetIds,
        after: "",
        iteration,
      });

      if (followUpResult) {
        console.log("✅ Follow-up job created successfully for ads phase");
        return {
          processedAdsets: processedAdsets.length,
          phase: "adsets",
          after: after,
          remainingTime: getRemainingTime(startTime),
          completed: false,
          hasMoreAdsets: false,
          transitioningToAds: true,
          adsetIds: adsetIds.length,
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
            message:
              "Job completed - ads phase follow-up prevented by validation",
            totalPhases: 4,
            processedAdsets: processedAdsets.length,
            summary: {
              totalProcessed: processedAdsets.length,
              completedAt: new Date().toISOString(),
              reason:
                "Ads phase follow-up job validation prevented infinite loop",
            },
          }
        );
      }
    } catch (followUpError) {
      console.error(
        "❌ Error creating follow-up job for ads phase:",
        followUpError
      );
      console.log("🔄 Completing job due to follow-up job error");
      await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
        message: "Job completed due to ads phase follow-up job error",
        totalPhases: 4,
        processedAdsets: processedAdsets.length,
        error:
          followUpError instanceof Error
            ? followUpError.message
            : "Unknown error",
        summary: {
          totalProcessed: processedAdsets.length,
          completedAt: new Date().toISOString(),
          reason: "Ads phase follow-up job creation failed",
        },
      });
    }
  } else {
    // No adsets found, complete the job
    console.log("🎉 NO ADSETS FOUND - COMPLETING JOB");
    console.log(
      `Total adsets processed in this batch: ${processedAdsets.length}`
    );
    await updateJobStatus(supabase, requestId, "completed", 100, undefined, {
      message: "All phases completed - no adsets found",
      totalPhases: 4,
      processedAdsets: processedAdsets.length,
      summary: {
        totalProcessed: processedAdsets.length,
        completedAt: new Date().toISOString(),
        reason: "No adsets found to process",
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
    // Check time and item limits frequently
    if (shouldStopProcessing(startTime, i)) {
      console.log(
        `⏱️ Stopping ads processing after ${i} adsets due to time/item limits`
      );
      await createFollowUpJob({
        accountId,
        timeframe,
        action: "get24HourData",
        requestId,
        phase: "ads",
        adsetIds: adsetIds.slice(i), // Continue from current adset
        after: after,
        iteration,
      });

      return {
        phase: "ads",
        status: "chunked",
        processed: i,
        total: adsetsToProcess.length,
        remaining: adsetIds.length - i,
      };
    }

    // Check for cancellation every 2 adsets
    if (i % 2 === 0) {
      if (await checkJobCancellation(supabase, requestId)) {
        console.log("Job cancelled during ads processing");
        return { phase: "ads", status: "cancelled" };
      }
    }

    const adsetId = adsetsToProcess[i];
    console.log(
      `Getting ads for adset ${adsetId} (${i + 1}/${
        adsetsToProcess.length
      }), remaining time: ${getRemainingTime(startTime)}ms`
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

      // Process each ad with time management
      for (let j = 0; j < ads.length; j++) {
        const ad = ads[j];

        // Check time for each ad - stop if approaching limit
        if (shouldStopProcessing(startTime, processedAds.length)) {
          console.log(
            `⏱️ Time limit reached during ad processing, processed ${processedAds.length} ads`
          );

          // Create follow-up job to continue from where we left off
          await createFollowUpJob({
            accountId,
            timeframe,
            action: "get24HourData",
            requestId,
            phase: "ads",
            adsetIds: adsetIds.slice(i), // Continue from current adset
            after: after,
            iteration,
          });

          return {
            phase: "ads",
            status: "chunked_during_ads",
            processed: processedAds.length,
            currentAdset: i,
            totalAdsets: adsetsToProcess.length,
          };
        }

        try {
          console.log(
            `\n--- Processing ad ${j + 1}/${ads.length}: ${ad.id} ---`
          );
          console.log(`Ad name: ${ad.name}`);
          console.log(`Remaining time: ${getRemainingTime(startTime)}ms`);

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

          // Process creative details with retry logic
          let creativeDetails = null;
          let creativeType = "UNKNOWN";
          let assetFeedSpec = null;
          let imageUrl = null;
          let videoId = null;
          let thumbnailUrl = null;

          if (ad.creative && ad.creative.id) {
            console.log(
              `🎨 Processing creative ${ad.creative.id} for ad ${ad.id}`
            );

            try {
              // Use enhanced creative fetching with retry logic
              creativeDetails = await fetchCreativeDetails(ad, 300);

              if (creativeDetails) {
                console.log(
                  `✅ Creative details fetched for ${ad.creative.id}`
                );

                // Extract creative data
                creativeType = creativeDetails.creative_type || "UNKNOWN";
                assetFeedSpec = creativeDetails.asset_feed_spec;
                imageUrl = creativeDetails.image_url;
                videoId = creativeDetails.video_id;
                thumbnailUrl = creativeDetails.thumbnail_url;

                // CRITICAL: Ensure asset_feed_spec is present when we have creative_id
                if (!assetFeedSpec) {
                  console.warn(
                    `⚠️ No asset_feed_spec for creative ${ad.creative.id}, creating fallback`
                  );
                  assetFeedSpec = {
                    _fallback_source: "MISSING_ASSET_FEED_SPEC",
                    creative_id: ad.creative.id,
                    ad_id: ad.id,
                    error: "Creative fetched but no asset_feed_spec available",
                  };
                }
              } else {
                console.error(
                  `❌ Failed to fetch creative details for ${ad.creative.id}`
                );
                creativeType = "FETCH_FAILED";
                assetFeedSpec = {
                  _fallback_source: "CREATIVE_FETCH_FAILED",
                  creative_id: ad.creative.id,
                  ad_id: ad.id,
                  error: "Creative fetch returned null",
                };
              }
            } catch (creativeError) {
              console.error(
                `❌ Error processing creative ${ad.creative.id}:`,
                creativeError
              );
              creativeType = "FETCH_ERROR";
              assetFeedSpec = {
                _fallback_source: "CREATIVE_FETCH_ERROR",
                creative_id: ad.creative.id,
                ad_id: ad.id,
                error:
                  creativeError instanceof Error
                    ? creativeError.message
                    : "Unknown creative error",
              };
            }
          } else {
            console.log(`⚠️ No creative ID found for ad ${ad.id}`);
          }

          // Extract engagement metrics from insights
          let engagementMetrics = null;
          if (adInsights) {
            engagementMetrics = {
              // Standard engagement actions
              post_engagement:
                adInsights.actions?.find(
                  (action) => action.action_type === "post_engagement"
                )?.value || "0",
              page_engagement:
                adInsights.actions?.find(
                  (action) => action.action_type === "page_engagement"
                )?.value || "0",
              like:
                adInsights.actions?.find(
                  (action) => action.action_type === "like"
                )?.value || "0",
              comment:
                adInsights.actions?.find(
                  (action) => action.action_type === "comment"
                )?.value || "0",
              share:
                adInsights.actions?.find(
                  (action) => action.action_type === "share"
                )?.value || "0",

              // Video engagement (if applicable)
              video_view:
                adInsights.actions?.find(
                  (action) => action.action_type === "video_view"
                )?.value || "0",
              video_p25_watched:
                adInsights.video_p25_watched_actions?.[0]?.value || "0",
              video_p50_watched:
                adInsights.video_p50_watched_actions?.[0]?.value || "0",
              video_p75_watched:
                adInsights.video_p75_watched_actions?.[0]?.value || "0",
              video_p100_watched:
                adInsights.video_p100_watched_actions?.[0]?.value || "0",

              // Link engagement
              link_click:
                adInsights.actions?.find(
                  (action) => action.action_type === "link_click"
                )?.value || "0",
              outbound_click: adInsights.outbound_clicks?.[0]?.value || "0",

              // Other engagement metrics
              photo_view:
                adInsights.actions?.find(
                  (action) => action.action_type === "photo_view"
                )?.value || "0",
              landing_page_view:
                adInsights.actions?.find(
                  (action) => action.action_type === "landing_page_view"
                )?.value || "0",
            };
          }

          // Create comprehensive ad data structure
          const adData = {
            ad_id: ad.id,
            ad_set_id: adsetId,
            account_id: accountId,
            campaign_id: campaignId,
            name: ad.name || "",
            status: mapToValidEffectiveStatus(
              ad.status,
              ad.effective_status,
              ad.configured_status
            ),
            configured_status: ad.configured_status || null,
            effective_status: ad.effective_status || null,
            creative: ad.creative || null,
            creative_id: ad.creative?.id || null,
            creative_type: creativeType,
            asset_feed_spec: assetFeedSpec,
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
            template_url:
              creativeDetails?.template_url || ad.template_url || null,
            thumbnail_url: thumbnailUrl || ad.thumbnail_url || null,
            image_url: imageUrl,
            video_id: videoId,
            instagram_permalink_url:
              creativeDetails?.instagram_permalink_url ||
              ad.instagram_permalink_url ||
              null,
            effective_object_story_id:
              creativeDetails?.effective_object_story_id ||
              ad.effective_object_story_id ||
              null,
            url_tags: creativeDetails?.url_tags || ad.url_tags || null,
            // Insights data
            impressions: safeParseInt(adInsights?.impressions),
            clicks: safeParseInt(adInsights?.clicks),
            reach: safeParseInt(adInsights?.reach),
            spend: safeParseFloat(adInsights?.spend),
            // Engagement metrics
            engagement_metrics: engagementMetrics,
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

            // Save engagement metrics for this ad
            try {
              const currentDate = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
              await saveAdEngagementMetrics(
                supabase,
                ad.id,
                adInsights,
                currentDate
              );
            } catch (engagementError) {
              console.error(
                `⚠️ Failed to save engagement metrics for ad ${ad.id}:`,
                engagementError
              );
              // Don't increment totalErrors as this is not critical for main ad processing
            }
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

    // Clean up any empty engagement metrics rows
    try {
      const cleanupResult = await cleanupEmptyEngagementMetrics(
        supabase,
        requestId
      );
      console.log(
        `🧹 Cleanup completed: ${cleanupResult.deleted} empty rows removed`
      );
    } catch (cleanupError) {
      console.error("⚠️ Cleanup error (non-critical):", cleanupError);
    }

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

// Helper function to save ad engagement metrics
async function saveAdEngagementMetrics(
  supabase: any,
  adId: string,
  insights: InsightResult | null,
  date: string
) {
  try {
    console.log(`📊 Processing engagement metrics for ad ${adId}...`);

    // Skip saving if no insights data is available
    if (!insights) {
      console.log(
        `⏭️ Skipping engagement metrics for ad ${adId} - no insights data available`
      );
      return true; // Return true to indicate successful processing (just no data to save)
    }

    // Check if we have any meaningful engagement data
    const hasEngagementData =
      insights.inline_link_clicks ||
      insights.inline_post_engagement ||
      (insights.video_30_sec_watched_actions &&
        insights.video_30_sec_watched_actions.length > 0) ||
      (insights.video_p25_watched_actions &&
        insights.video_p25_watched_actions.length > 0) ||
      (insights.video_thruplay_watched_actions &&
        insights.video_thruplay_watched_actions.length > 0) ||
      (insights.video_continuous_2_sec_watched_actions &&
        insights.video_continuous_2_sec_watched_actions.length > 0) ||
      insights.actions?.some((action) =>
        [
          "page_engagement",
          "post_engagement",
          "comment",
          "video_view",
        ].includes(action.action_type)
      );

    if (!hasEngagementData) {
      console.log(
        `⏭️ Skipping engagement metrics for ad ${adId} - no meaningful engagement data found`
      );
      return true; // Return true to indicate successful processing (just no meaningful data)
    }

    // Create engagement data record only when we have meaningful data
    const engagementData = {
      ad_id: adId,
      date: date,
      // Direct metrics from insights
      inline_link_clicks: insights.inline_link_clicks
        ? safeParseInt(insights.inline_link_clicks)
        : null,
      inline_post_engagement: insights.inline_post_engagement
        ? safeParseInt(insights.inline_post_engagement)
        : null,

      // Video metrics from specific video action arrays
      video_30s_watched:
        insights.video_30_sec_watched_actions &&
        insights.video_30_sec_watched_actions.length > 0
          ? safeParseInt(insights.video_30_sec_watched_actions[0]?.value)
          : null,
      video_25_percent_watched:
        insights.video_p25_watched_actions &&
        insights.video_p25_watched_actions.length > 0
          ? safeParseInt(insights.video_p25_watched_actions[0]?.value)
          : null,
      video_50_percent_watched:
        insights.video_p50_watched_actions &&
        insights.video_p50_watched_actions.length > 0
          ? safeParseInt(insights.video_p50_watched_actions[0]?.value)
          : null,
      video_75_percent_watched:
        insights.video_p75_watched_actions &&
        insights.video_p75_watched_actions.length > 0
          ? safeParseInt(insights.video_p75_watched_actions[0]?.value)
          : null,
      video_95_percent_watched:
        insights.video_p95_watched_actions &&
        insights.video_p95_watched_actions.length > 0
          ? safeParseInt(insights.video_p95_watched_actions[0]?.value)
          : null,

      // Engagement metrics from actions array
      page_engagement: insights.actions?.find(
        (a: any) => a.action_type === "page_engagement"
      )?.value
        ? safeParseInt(
            insights.actions?.find(
              (a: any) => a.action_type === "page_engagement"
            )?.value
          )
        : null,
      post_engagement: insights.actions?.find(
        (a: any) => a.action_type === "post_engagement"
      )?.value
        ? safeParseInt(
            insights.actions?.find(
              (a: any) => a.action_type === "post_engagement"
            )?.value
          )
        : null,
      post_comments: insights.actions?.find(
        (a: any) => a.action_type === "comment"
      )?.value
        ? safeParseInt(
            insights.actions?.find((a: any) => a.action_type === "comment")
              ?.value
          )
        : null,

      // Video view metrics
      two_sec_video_views:
        insights.video_continuous_2_sec_watched_actions &&
        insights.video_continuous_2_sec_watched_actions.length > 0
          ? safeParseInt(
              insights.video_continuous_2_sec_watched_actions[0]?.value
            )
          : null,
      three_sec_video_views: insights.actions?.find(
        (a: any) => a.action_type === "video_view"
      )?.value
        ? safeParseInt(
            insights.actions?.find((a: any) => a.action_type === "video_view")
              ?.value
          )
        : null,
      thruplays:
        insights.video_thruplay_watched_actions &&
        insights.video_thruplay_watched_actions.length > 0
          ? safeParseInt(insights.video_thruplay_watched_actions[0]?.value)
          : null,

      // Cost metrics from cost_per_action_type
      cost_per_link_click: insights.cost_per_action_type?.find(
        (c: any) => c.action_type === "link_click"
      )?.value
        ? safeParseFloat(
            insights.cost_per_action_type?.find(
              (c: any) => c.action_type === "link_click"
            )?.value
          )
        : null,
      cost_per_post_engagement: insights.cost_per_action_type?.find(
        (c: any) => c.action_type === "post_engagement"
      )?.value
        ? safeParseFloat(
            insights.cost_per_action_type?.find(
              (c: any) => c.action_type === "post_engagement"
            )?.value
          )
        : null,
      cost_per_page_engagement: insights.cost_per_action_type?.find(
        (c: any) => c.action_type === "page_engagement"
      )?.value
        ? safeParseFloat(
            insights.cost_per_action_type?.find(
              (c: any) => c.action_type === "page_engagement"
            )?.value
          )
        : null,
      cost_per_thruplay: insights.cost_per_action_type?.find(
        (c: any) => c.action_type === "video_thruplay_watched"
      )?.value
        ? safeParseFloat(
            insights.cost_per_action_type?.find(
              (c: any) => c.action_type === "video_thruplay_watched"
            )?.value
          )
        : null,
      cost_per_2sec_view: insights.cost_per_action_type?.find(
        (c: any) => c.action_type === "video_continuous_2_sec_watched"
      )?.value
        ? safeParseFloat(
            insights.cost_per_action_type?.find(
              (c: any) => c.action_type === "video_continuous_2_sec_watched"
            )?.value
          )
        : null,
      cost_per_3sec_view: insights.cost_per_action_type?.find(
        (c: any) => c.action_type === "video_view"
      )?.value
        ? safeParseFloat(
            insights.cost_per_action_type?.find(
              (c: any) => c.action_type === "video_view"
            )?.value
          )
        : null,

      // Calculated metrics
      avg_watch_time_seconds:
        insights.video_avg_time_watched_actions &&
        insights.video_avg_time_watched_actions.length > 0
          ? safeParseFloat(insights.video_avg_time_watched_actions[0]?.value)
          : null,

      // VTR and Hook Rate (calculated)
      vtr_percentage:
        insights.video_p25_watched_actions &&
        insights.video_p25_watched_actions.length > 0 &&
        insights.impressions
          ? (safeParseInt(insights.video_p25_watched_actions[0]?.value) /
              safeParseInt(insights.impressions)) *
            100
          : null,
      hook_rate_percentage:
        insights.video_continuous_2_sec_watched_actions &&
        insights.video_continuous_2_sec_watched_actions.length > 0 &&
        insights.impressions
          ? (safeParseInt(
              insights.video_continuous_2_sec_watched_actions[0]?.value
            ) /
              safeParseInt(insights.impressions)) *
            100
          : null,

      // Metadata
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(`📊 Engagement data prepared for ad ${adId}:`, {
      insights_available: true,
      inline_link_clicks: engagementData.inline_link_clicks,
      video_30s_watched: engagementData.video_30s_watched,
      thruplays: engagementData.thruplays,
      page_engagement: engagementData.page_engagement,
      post_engagement: engagementData.post_engagement,
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
      return false;
    } else {
      console.log(
        `✅ Saved engagement metrics for ad ${adId} with meaningful data`
      );
      return true;
    }
  } catch (error) {
    console.error(
      `❌ Error processing engagement metrics for ad ${adId}:`,
      error
    );
    return false;
  }
}

// NEW: Function to specifically handle and fix zero spend/impressions issues
async function fixZeroSpendImpressions(
  accountId: string,
  supabase: any,
  requestId: string
): Promise<{ fixed: number; total: number; errors: string[] }> {
  console.log(
    `🔧 Starting zero spend/impressions fix for account ${accountId}`
  );

  const errors: string[] = [];
  let fixedCount = 0;
  let totalCount = 0;

  try {
    // Find ads with zero spend and zero impressions
    const { data: zeroAds, error: queryError } = await supabase
      .from("meta_ads")
      .select("ad_id, name, account_id")
      .eq("account_id", accountId)
      .eq("spend", 0)
      .eq("impressions", 0)
      .limit(50); // Process in batches

    if (queryError) {
      throw new Error(`Failed to query zero ads: ${queryError.message}`);
    }

    if (!zeroAds || zeroAds.length === 0) {
      console.log(
        `✅ No ads with zero spend/impressions found for account ${accountId}`
      );
      return { fixed: 0, total: 0, errors: [] };
    }

    totalCount = zeroAds.length;
    console.log(`🔍 Found ${totalCount} ads with zero spend/impressions`);

    // Initialize Facebook API
    const api = new FacebookAdsApi(process.env.FACEBOOK_ACCESS_TOKEN!);
    FacebookAdsApi.init(process.env.FACEBOOK_ACCESS_TOKEN!);

    for (const adRecord of zeroAds) {
      try {
        console.log(`🔧 Fixing ad ${adRecord.ad_id} (${adRecord.name})`);

        const ad = new Ad(adRecord.ad_id);

        // Try multiple strategies to get valid data
        let validInsights: InsightResult | null = null;

        // Strategy 1: 7-day range (most recent reliable data)
        try {
          validInsights = await getInsights(
            ad as any,
            supabase,
            accountId,
            "7d"
          );
        } catch (error) {
          console.log(`⚠️ 7-day range failed for ${adRecord.ad_id}`);
        }

        // Strategy 2: Lifetime data with minimal metrics
        if (!validInsights || !hasValidInsightsData(validInsights)) {
          try {
            const lifetimeInsights = await withRateLimitRetry(
              async () => {
                return ad.getInsights(["impressions", "clicks", "spend"], {
                  date_preset: "lifetime",
                });
              },
              {
                accountId,
                endpoint: "insights",
                callType: "READ",
                points: RATE_LIMIT_CONFIG.POINTS.INSIGHTS,
                supabase,
              }
            );
            validInsights = (lifetimeInsights?.[0] as InsightResult) || null;
          } catch (error) {
            console.log(`⚠️ Lifetime insights failed for ${adRecord.ad_id}`);
          }
        }

        if (validInsights && hasValidInsightsData(validInsights)) {
          // Update the ad record with valid data
          const { error: updateError } = await supabase
            .from("meta_ads")
            .update({
              impressions: safeParseInt(validInsights.impressions),
              clicks: safeParseInt(validInsights.clicks),
              spend: safeParseFloat(validInsights.spend),
              reach: safeParseInt(validInsights.reach),
              cpc: safeParseFloat(validInsights.cpc),
              cpm: safeParseFloat(validInsights.cpm),
              ctr: safeParseFloat(validInsights.ctr),
              frequency: safeParseFloat(validInsights.frequency),
              actions: validInsights.actions || [],
              action_values: validInsights.action_values || [],
              cost_per_action_type: validInsights.cost_per_action_type || [],
              updated_at: new Date(),
              last_insights_update: new Date(),
            })
            .eq("ad_id", adRecord.ad_id);

          if (updateError) {
            errors.push(
              `Failed to update ad ${adRecord.ad_id}: ${updateError.message}`
            );
          } else {
            fixedCount++;
            console.log(
              `✅ Fixed ad ${adRecord.ad_id} - Impressions: ${validInsights.impressions}, Spend: ${validInsights.spend}`
            );
          }
        } else {
          console.log(
            `⚠️ Could not get valid insights for ad ${adRecord.ad_id}`
          );
          errors.push(`No valid insights available for ad ${adRecord.ad_id}`);
        }

        // Add delay between requests to avoid rate limits
        await delay(500);
      } catch (error: any) {
        const errorMsg = `Error fixing ad ${adRecord.ad_id}: ${error.message}`;
        console.error(errorMsg);
        errors.push(errorMsg);
      }
    }

    console.log(
      `🔧 Zero spend/impressions fix completed. Fixed: ${fixedCount}/${totalCount}`
    );
    return { fixed: fixedCount, total: totalCount, errors };
  } catch (error: any) {
    const errorMsg = `Failed to fix zero spend/impressions: ${error.message}`;
    console.error(errorMsg);
    return { fixed: fixedCount, total: totalCount, errors: [errorMsg] };
  }
}

async function cleanupEmptyEngagementMetrics(
  supabase: any,
  requestId: string
): Promise<{ deleted: number; errors: string[] }> {
  try {
    console.log("🧹 Cleaning up empty engagement metrics rows...");

    // Delete rows where all engagement metrics are null
    const { data: deletedRows, error } = await supabase
      .from("ad_engagement_metrics")
      .delete()
      .is("inline_link_clicks", null)
      .is("inline_post_engagement", null)
      .is("video_30s_watched", null)
      .is("video_25_percent_watched", null)
      .is("video_50_percent_watched", null)
      .is("video_75_percent_watched", null)
      .is("video_95_percent_watched", null)
      .is("page_engagement", null)
      .is("post_engagement", null)
      .is("post_comments", null)
      .is("two_sec_video_views", null)
      .is("three_sec_video_views", null)
      .is("thruplays", null)
      .select("ad_id");

    if (error) {
      console.error("❌ Error cleaning up empty engagement metrics:", error);
      return { deleted: 0, errors: [error.message] };
    }

    const deletedCount = deletedRows?.length || 0;
    console.log(`✅ Cleaned up ${deletedCount} empty engagement metrics rows`);

    return { deleted: deletedCount, errors: [] };
  } catch (error) {
    console.error("❌ Error in cleanup function:", error);
    return {
      deleted: 0,
      errors: [
        error instanceof Error ? error.message : "Unknown cleanup error",
      ],
    };
  }
}

// Export the POST handler with QStash signature verification
export const POST = verifySignatureAppRouter(handler);

// NEW: GET endpoint to fix zero spend/impressions issues
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const action = url.searchParams.get("action");

    if (action === "health") {
      // Health check endpoint
      const memory = getMemoryUsage();
      const supabase = await createClient();

      // Check recent job statuses
      const { data: recentJobs, error } = await supabase
        .from("background_jobs")
        .select("status, created_at, error_message")
        .eq("job_type", "meta-marketing-sync")
        .gte(
          "created_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        ) // Last 24 hours
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("Error fetching recent jobs:", error);
      }

      return Response.json({
        status: "healthy",
        timestamp: new Date().toISOString(),
        memory: memory,
        circuitBreaker: metaApiCircuitBreaker.getStatus(),
        config: {
          maxProcessingTime: RATE_LIMIT_CONFIG.MAX_PROCESSING_TIME,
          safetyBuffer: RATE_LIMIT_CONFIG.SAFETY_BUFFER,
          maxItemsPerChunk: RATE_LIMIT_CONFIG.MAX_ITEMS_PER_CHUNK,
          maxMemoryUsage: RATE_LIMIT_CONFIG.MAX_MEMORY_USAGE,
        },
        environment: {
          workerDisabled: process.env.WORKER_DISABLED === "true",
          globalKillSwitch: process.env.GLOBAL_WORKER_KILL_SWITCH === "true",
          hasMetaToken: !!process.env.META_ACCESS_TOKEN,
        },
        recentJobs: recentJobs || [],
      });
    }

    if (action === "stats") {
      // Statistics endpoint
      const supabase = await createClient();

      const { data: jobStats, error } = await supabase
        .from("background_jobs")
        .select("status")
        .eq("job_type", "meta-marketing-sync")
        .gte(
          "created_at",
          new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
        );

      if (error) {
        console.error("Error fetching job stats:", error);
        return Response.json(
          { error: "Failed to fetch stats" },
          { status: 500 }
        );
      }

      const stats =
        jobStats?.reduce((acc: any, job: any) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        }, {}) || {};

      return Response.json({
        period: "last_24_hours",
        stats,
        total: jobStats?.length || 0,
        timestamp: new Date().toISOString(),
      });
    }

    return Response.json({
      message: "Meta Marketing Worker API",
      endpoints: {
        health: "?action=health",
        stats: "?action=stats",
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("Error in GET endpoint:", error);
    return Response.json(
      {
        error: "Internal server error",
        message: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

// Process incremental sync for specific objects
async function processIncrementalSync(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  payload: ChunkedJobPayload,
  startTime: number,
  iteration: number
) {
  console.log("=== STARTING INCREMENTAL SYNC ===");
  console.log(`Account: ${accountId}`);
  console.log(`Reason: ${payload.reason}`);
  console.log(`Type: ${payload.phase}`);

  await updateJobStatus(supabase, requestId, "processing", 10);

  try {
    switch (payload.phase) {
      case "campaigns":
        if (payload.campaignIds && payload.campaignIds.length > 0) {
          console.log(
            `🔄 Syncing ${payload.campaignIds.length} specific campaigns`
          );
          return await syncSpecificCampaigns(
            accountId,
            supabase,
            timeframe,
            requestId,
            payload.campaignIds,
            startTime
          );
        }
        break;

      case "adsets":
        if (payload.adsetIds && payload.adsetIds.length > 0) {
          console.log(`🔄 Syncing ${payload.adsetIds.length} specific adsets`);
          return await syncSpecificAdsets(
            accountId,
            supabase,
            timeframe,
            requestId,
            payload.adsetIds,
            startTime
          );
        }
        break;

      case "ads":
        if (payload.adIds && payload.adIds.length > 0) {
          console.log(`🔄 Syncing ${payload.adIds.length} specific ads`);
          return await syncSpecificAds(
            accountId,
            supabase,
            timeframe,
            requestId,
            payload.adIds,
            startTime
          );
        }
        break;

      default:
        throw new Error(`Unsupported incremental sync type: ${payload.phase}`);
    }

    await updateJobStatus(supabase, requestId, "completed", 100);
    return {
      phase: "incremental_sync",
      status: "completed",
      reason: payload.reason,
      type: payload.phase,
      processed: 0,
    };
  } catch (error) {
    console.error("❌ Incremental sync failed:", error);
    await updateJobStatus(
      supabase,
      requestId,
      "failed",
      0,
      (error as any).message
    );
    throw error;
  }
}

// Sync specific campaigns
async function syncSpecificCampaigns(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  campaignIds: string[],
  startTime: number
) {
  console.log(`📊 Fetching ${campaignIds.length} specific campaigns`);

  const account = new AdAccount(accountId);
  const dateRange = getDateRangeForTimeframe(timeframe);
  let processedCount = 0;

  for (const campaignId of campaignIds) {
    try {
      // Check time limits
      if (shouldStopProcessing(startTime, processedCount)) {
        console.log(
          "⏰ Time limit reached, stopping incremental campaign sync"
        );
        break;
      }

      console.log(`🔄 Syncing campaign: ${campaignId}`);

      // Fetch campaign details
      const campaign = await withRateLimitRetry(
        async () => {
          return new Campaign(campaignId).read([
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
            "stop_time",
          ]);
        },
        {
          accountId,
          endpoint: "campaign_details",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      // Get campaign insights
      const campaignInsights = await getInsights(
        campaign,
        supabase,
        accountId,
        timeframe
      );

      // Prepare campaign data
      const campaignData = {
        campaign_id: campaign.id,
        account_id: accountId,
        name: campaign.name || "",
        status:
          mapToValidEffectiveStatus(
            campaign.effective_status,
            campaign.configured_status
          ) || "UNKNOWN",
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
        cpc: safeParseFloat(campaignInsights?.cpc),
        cpm: safeParseFloat(campaignInsights?.cpm),
        ctr: safeParseFloat(campaignInsights?.ctr),
        frequency: safeParseFloat(campaignInsights?.frequency),
        cost_per_unique_click: safeParseFloat(
          campaignInsights?.cost_per_unique_click
        ),
        actions: campaignInsights?.actions || [],
        action_values: campaignInsights?.action_values || [],
        cost_per_action_type: campaignInsights?.cost_per_action_type || [],
        outbound_clicks: campaignInsights?.outbound_clicks || [],
        outbound_clicks_ctr: safeParseFloat(
          campaignInsights?.outbound_clicks_ctr?.[0]?.value
        ),
        website_ctr: campaignInsights?.website_ctr || [],
        website_purchase_roas: safeParseFloat(
          campaignInsights?.website_purchase_roas?.[0]?.value
        ),
        last_updated: new Date(),
        updated_at: new Date(),
      };

      // Upsert campaign
      const { error: campaignError } = await supabase
        .from("meta_campaigns")
        .upsert([campaignData], {
          onConflict: "campaign_id",
          ignoreDuplicates: false,
        });

      if (campaignError) {
        console.error(
          `❌ Error upserting campaign ${campaignId}:`,
          campaignError
        );
      } else {
        console.log(`✅ Campaign ${campaignId} synced successfully`);
        processedCount++;
      }

      await delay(RATE_LIMIT_CONFIG.CAMPAIGN_DELAY);
    } catch (error) {
      console.error(`❌ Error syncing campaign ${campaignId}:`, error);
    }
  }

  await updateJobStatus(supabase, requestId, "completed", 100);
  return {
    phase: "incremental_campaigns",
    status: "completed",
    processed: processedCount,
    total: campaignIds.length,
  };
}

// Sync specific adsets
async function syncSpecificAdsets(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  adsetIds: string[],
  startTime: number
) {
  console.log(`📊 Fetching ${adsetIds.length} specific adsets`);

  let processedCount = 0;

  for (const adsetId of adsetIds) {
    try {
      // Check time limits
      if (shouldStopProcessing(startTime, processedCount)) {
        console.log("⏰ Time limit reached, stopping incremental adset sync");
        break;
      }

      console.log(`🔄 Syncing adset: ${adsetId}`);

      // Fetch adset details
      const adset = await withRateLimitRetry(
        async () => {
          return new AdSet(adsetId).read([
            "name",
            "status",
            "configured_status",
            "effective_status",
            "campaign_id",
            "daily_budget",
            "lifetime_budget",
            "budget_remaining",
            "bid_strategy",
            "billing_event",
            "optimization_goal",
            "targeting",
            "start_time",
            "end_time",
            "created_time",
            "updated_time",
            "source_adset_id",
            "promoted_object",
            "recommendations",
            "bid_amount",
            "bid_info",
            "attribution_spec",
            "destination_type",
            "pacing_type",
          ]);
        },
        {
          accountId,
          endpoint: "adset_details",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      // Get adset insights
      const adsetInsights = await getInsights(
        adset,
        supabase,
        accountId,
        timeframe
      );

      // Prepare adset data (similar structure as in processAdsetsPhase)
      const adsetData = {
        adset_id: adset.id,
        account_id: accountId,
        campaign_id: adset.campaign_id,
        name: adset.name || "",
        status:
          mapToValidEffectiveStatus(
            adset.effective_status,
            adset.configured_status
          ) || "UNKNOWN",
        configured_status: adset.configured_status || null,
        effective_status: adset.effective_status || null,
        daily_budget: adset.daily_budget
          ? parseFloat(adset.daily_budget)
          : null,
        lifetime_budget: adset.lifetime_budget
          ? parseFloat(adset.lifetime_budget)
          : null,
        budget_remaining: adset.budget_remaining
          ? parseFloat(adset.budget_remaining)
          : null,
        bid_strategy: adset.bid_strategy || null,
        billing_event: adset.billing_event || null,
        optimization_goal: adset.optimization_goal || null,
        targeting: adset.targeting || null,
        start_time: adset.start_time
          ? new Date(adset.start_time).toISOString()
          : null,
        end_time: adset.end_time
          ? new Date(adset.end_time).toISOString()
          : null,
        created_time: adset.created_time
          ? new Date(adset.created_time).toISOString()
          : null,
        updated_time: adset.updated_time
          ? new Date(adset.updated_time).toISOString()
          : null,
        source_adset_id: adset.source_adset_id || null,
        promoted_object: adset.promoted_object || null,
        recommendations: adset.recommendations || null,
        bid_amount: adset.bid_amount ? parseFloat(adset.bid_amount) : null,
        bid_info: adset.bid_info || null,
        attribution_spec: adset.attribution_spec || null,
        destination_type: adset.destination_type || null,
        pacing_type: adset.pacing_type || null,
        // Insights data
        impressions: safeParseInt(adsetInsights?.impressions),
        clicks: safeParseInt(adsetInsights?.clicks),
        reach: safeParseInt(adsetInsights?.reach),
        spend: safeParseFloat(adsetInsights?.spend),
        cpc: safeParseFloat(adsetInsights?.cpc),
        cpm: safeParseFloat(adsetInsights?.cpm),
        ctr: safeParseFloat(adsetInsights?.ctr),
        frequency: safeParseFloat(adsetInsights?.frequency),
        cost_per_unique_click: safeParseFloat(
          adsetInsights?.cost_per_unique_click
        ),
        actions: adsetInsights?.actions || [],
        action_values: adsetInsights?.action_values || [],
        cost_per_action_type: adsetInsights?.cost_per_action_type || [],
        outbound_clicks: adsetInsights?.outbound_clicks || [],
        outbound_clicks_ctr: safeParseFloat(
          adsetInsights?.outbound_clicks_ctr?.[0]?.value
        ),
        website_ctr: adsetInsights?.website_ctr || [],
        website_purchase_roas: safeParseFloat(
          adsetInsights?.website_purchase_roas?.[0]?.value
        ),
        last_updated: new Date(),
        updated_at: new Date(),
      };

      // Upsert adset
      const { error: adsetError } = await supabase
        .from("meta_adsets")
        .upsert([adsetData], {
          onConflict: "adset_id",
          ignoreDuplicates: false,
        });

      if (adsetError) {
        console.error(`❌ Error upserting adset ${adsetId}:`, adsetError);
      } else {
        console.log(`✅ Adset ${adsetId} synced successfully`);
        processedCount++;
      }

      await delay(RATE_LIMIT_CONFIG.ADSET_DELAY);
    } catch (error) {
      console.error(`❌ Error syncing adset ${adsetId}:`, error);
    }
  }

  await updateJobStatus(supabase, requestId, "completed", 100);
  return {
    phase: "incremental_adsets",
    status: "completed",
    processed: processedCount,
    total: adsetIds.length,
  };
}

// Sync specific ads
async function syncSpecificAds(
  accountId: string,
  supabase: any,
  timeframe: string,
  requestId: string,
  adIds: string[],
  startTime: number
) {
  console.log(`📊 Fetching ${adIds.length} specific ads`);

  let processedCount = 0;

  for (const adId of adIds) {
    try {
      // Check time limits
      if (shouldStopProcessing(startTime, processedCount)) {
        console.log("⏰ Time limit reached, stopping incremental ad sync");
        break;
      }

      console.log(`🔄 Syncing ad: ${adId}`);

      // Fetch ad details
      const ad = await withRateLimitRetry(
        async () => {
          return new Ad(adId).read([
            "name",
            "status",
            "configured_status",
            "effective_status",
            "adset_id",
            "campaign_id",
            "creative",
            "tracking_specs",
            "conversion_specs",
            "tracking_and_conversion_specs",
            "source_ad_id",
            "recommendations",
            "created_time",
            "updated_time",
          ]);
        },
        {
          accountId,
          endpoint: "ad_details",
          callType: "READ",
          points: RATE_LIMIT_CONFIG.POINTS.READ,
          supabase,
        }
      );

      // Get ad insights
      const adInsights = await getInsights(ad, supabase, accountId, timeframe);

      // Process creative data
      let creativeType = null;
      let assetFeedSpec = null;

      if (ad.creative) {
        try {
          const creativeResult = await fetchCreative(ad.creative.id);
          if (creativeResult.success && creativeResult.data) {
            const processedCreative = processCreativeData(
              creativeResult.data,
              ad
            );
            creativeType = processedCreative.creative_type;
            assetFeedSpec = processedCreative.asset_feed_spec;
          }
        } catch (creativeError) {
          console.error(
            `Error fetching creative for ad ${adId}:`,
            creativeError
          );
        }
      }

      // Prepare ad data (similar structure as in processAdsPhase)
      const adData = {
        ad_id: ad.id,
        ad_set_id: ad.adset_id,
        account_id: accountId,
        campaign_id: ad.campaign_id,
        name: ad.name || "",
        status: mapToValidEffectiveStatus(
          ad.status,
          ad.effective_status,
          ad.configured_status
        ),
        configured_status: ad.configured_status || null,
        effective_status: ad.effective_status || null,
        creative: ad.creative || null,
        creative_id: ad.creative?.id || null,
        creative_type: creativeType,
        asset_feed_spec: assetFeedSpec,
        object_story_spec: ad.creative?.object_story_spec || null,
        tracking_specs: ad.tracking_specs || null,
        conversion_specs: ad.conversion_specs || null,
        tracking_and_conversion_specs: ad.tracking_and_conversion_specs || null,
        source_ad_id: ad.source_ad_id || null,
        recommendations: ad.recommendations || null,
        created_time: ad.created_time
          ? new Date(ad.created_time).toISOString()
          : null,
        updated_time: ad.updated_time
          ? new Date(ad.updated_time).toISOString()
          : null,
        // Insights data
        impressions: safeParseInt(adInsights?.impressions),
        clicks: safeParseInt(adInsights?.clicks),
        reach: safeParseInt(adInsights?.reach),
        spend: safeParseFloat(adInsights?.spend),
        cpc: safeParseFloat(adInsights?.cpc),
        cpm: safeParseFloat(adInsights?.cpm),
        ctr: safeParseFloat(adInsights?.ctr),
        frequency: safeParseFloat(adInsights?.frequency),
        cost_per_unique_click: safeParseFloat(
          adInsights?.cost_per_unique_click
        ),
        actions: adInsights?.actions || [],
        action_values: adInsights?.action_values || [],
        cost_per_action_type: adInsights?.cost_per_action_type || [],
        outbound_clicks: adInsights?.outbound_clicks || [],
        outbound_clicks_ctr: safeParseFloat(
          adInsights?.outbound_clicks_ctr?.[0]?.value
        ),
        website_ctr: adInsights?.website_ctr || [],
        website_purchase_roas: safeParseFloat(
          adInsights?.website_purchase_roas?.[0]?.value
        ),
        last_updated: new Date(),
        updated_at: new Date(),
      };

      // Upsert ad
      const { error: adError } = await supabase
        .from("meta_ads")
        .upsert([adData], {
          onConflict: "ad_id",
          ignoreDuplicates: false,
        });

      if (adError) {
        console.error(`❌ Error upserting ad ${adId}:`, adError);
      } else {
        console.log(`✅ Ad ${adId} synced successfully`);

        // Save engagement metrics if we have insights
        if (adInsights && hasValidInsightsData(adInsights)) {
          const today = new Date().toISOString().split("T")[0];
          await saveAdEngagementMetrics(supabase, adId, adInsights, today);
        }

        processedCount++;
      }

      await delay(RATE_LIMIT_CONFIG.AD_DELAY);
    } catch (error) {
      console.error(`❌ Error syncing ad ${adId}:`, error);
    }
  }

  await updateJobStatus(supabase, requestId, "completed", 100);
  return {
    phase: "incremental_ads",
    status: "completed",
    processed: processedCount,
    total: adIds.length,
  };
}
