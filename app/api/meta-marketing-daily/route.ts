import { NextResponse } from "next/server";
import {
  FacebookAdsApi,
  AdAccount,
  AdCreative,
} from "facebook-nodejs-business-sdk";
import { createClient } from "@/utils/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchCreative,
  processCreativeData,
  trackCreativeApiFetches,
  fetchCreativeDetails,
} from "@/utils/meta-marketing/creative-management";
import {
  startMetaMarketingBackgroundJob,
  MetaMarketingJobPayload,
} from "@/app/actions/meta-marketing-queue";
import { v4 as uuidv4 } from "uuid";

// Import these types for type checking but not for actual usage

// Helper functions to safely parse strings to numbers
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

// Interface for entities that support the getInsights method
interface InsightCapableEntity {
  id: string;
  getInsights: (
    fields: string[],
    options: Record<string, unknown>
  ) => Promise<unknown[]>;
}

// Interface for processed insights results
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

  // Engagement metrics - using correct field names
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

interface RateLimitInfo {
  usage_percent: number;
  call_count: number;
  total_cputime: number;
  total_time: number;
  estimated_time_to_regain_access: number;
  business_use_case?: string;
  reset_time_duration?: number;
}

// Enhanced rate limiting configuration based on Meta's documentation
const RATE_LIMIT_CONFIG = {
  // API Tier limits
  DEVELOPMENT: {
    MAX_SCORE: 60,
    DECAY_TIME: 300, // 300 seconds
    BLOCK_TIME: 300, // 300 seconds
    ADS_MANAGEMENT_HOURLY: 300, // 300 calls per hour in dev tier
    INSIGHTS_HOURLY: 600, // 600 calls per hour in dev tier
  },
  STANDARD: {
    MAX_SCORE: 9000,
    DECAY_TIME: 300, // 300 seconds
    BLOCK_TIME: 60, // 60 seconds
    ADS_MANAGEMENT_HOURLY: 100000, // 100k calls per hour in standard tier
    INSIGHTS_HOURLY: 190000, // 190k calls per hour in standard tier
  },
  // Operation costs
  POINTS: {
    READ: 1,
    WRITE: 3,
    INSIGHTS: 2, // Insights calls are more expensive
  },
  // Batch and delay settings
  BATCH_SIZE: 50,
  MIN_DELAY: 1000, // 1 second minimum delay
  BURST_DELAY: 2000, // 2 seconds for potential burst
  INSIGHTS_DELAY: 3000, // 3 seconds for insights calls
};

// Initialize Meta API configuration
const META_CONFIG = {
  accessToken: process.env.META_ACCESS_TOKEN!,
};

// Helper function to delay execution
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Helper function to calculate dynamic delay based on recent API usage
function calculateDynamicDelay(endpoint: string, points: number): number {
  const baseDelay = endpoint.includes("insights")
    ? RATE_LIMIT_CONFIG.INSIGHTS_DELAY
    : RATE_LIMIT_CONFIG.MIN_DELAY;

  // Increase delay as points accumulate
  const pointMultiplier = Math.ceil(points / 10); // Every 10 points increases delay
  return Math.min(baseDelay * pointMultiplier, 5000); // Cap at 5 seconds
}

// Queue system for rate limit handling
const rateLimitQueue = {
  isProcessing: false,
  lastErrorTime: 0,
  consecutiveErrors: 0,
  waitTime: 0,
};

// Enhanced backoff strategy with Meta's guidelines
function getBackoffDelay(retryCount: number, errorCode?: number): number {
  const baseDelay = 1000; // Start with 1 second
  const maxDelay = 300000; // Max 5 minutes

  // If we've hit consecutive rate limits, increase the base delay
  if (rateLimitQueue.consecutiveErrors > 0) {
    const consecutiveMultiplier = Math.min(
      Math.pow(2, rateLimitQueue.consecutiveErrors),
      16
    );
    return Math.min(baseDelay * consecutiveMultiplier, maxDelay);
  }

  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * 1000;
  return Math.min(exponentialDelay + jitter, maxDelay);
}

// Enhanced rate limit tracking
async function trackRateLimit(
  supabase: SupabaseClient,
  accountId: string,
  endpoint: string,
  headers: Record<string, string>
): Promise<void> {
  try {
    const usageHeader = headers["x-business-use-case-usage"];
    const accountUsage = headers["x-ad-account-usage"];
    const insightsThrottle = headers["x-fb-ads-insights-throttle"];

    let rateLimitInfo: Partial<RateLimitInfo> = {};

    if (usageHeader) {
      const usage = JSON.parse(usageHeader);
      rateLimitInfo = {
        usage_percent: usage.acc_id_util_pct,
        call_count: usage.call_count,
        total_cputime: usage.total_cputime,
        total_time: usage.total_time,
        estimated_time_to_regain_access: usage.estimated_time_to_regain_access,
        business_use_case: usage.business_use_case,
      };
    }

    if (accountUsage) {
      const usage = JSON.parse(accountUsage);
      rateLimitInfo.reset_time_duration = usage.reset_time_duration;
    }

    // Store rate limit info with timestamp for tracking
    await supabase.from("meta_rate_limits").upsert([
      {
        account_id: accountId,
        endpoint,
        ...rateLimitInfo,
        last_updated: new Date(),
        tier: process.env.META_API_TIER || "development",
      },
    ]);

    // If we're approaching limits, add artificial delay
    if (rateLimitInfo.usage_percent && rateLimitInfo.usage_percent > 80) {
      const delayTime = calculateDynamicDelay(
        endpoint,
        rateLimitInfo.call_count || 0
      );
      await delay(delayTime);
    }
  } catch (error) {
    console.error("Error tracking rate limit:", error);
  }
}

// Helper function to track API metrics
async function trackApiMetrics(
  supabase: SupabaseClient,
  accountId: string,
  endpoint: string,
  callType: string,
  points: number,
  success: boolean,
  errorCode?: string,
  errorMessage?: string
) {
  try {
    await supabase.from("meta_api_metrics").insert([
      {
        account_id: accountId,
        endpoint,
        call_type: callType,
        points_used: points,
        success,
        error_code: errorCode,
        error_message: errorMessage,
      },
    ]);
  } catch (error) {
    console.error("Error tracking API metrics:", error);
  }
}

// Enhanced retry mechanism with rate limit awareness
async function withRateLimitRetry<T>(
  operation: () => Promise<T>,
  context: {
    accountId: string;
    endpoint: string;
    callType: string;
    points: number;
    supabase: SupabaseClient;
  }
): Promise<T> {
  let retries = 0;
  const maxRetries = 5;
  const isInsights = context.endpoint.includes("insights");

  while (true) {
    try {
      // Check if we're in a rate limit cool-down period
      if (rateLimitQueue.isProcessing) {
        const timeSinceError = Date.now() - rateLimitQueue.lastErrorTime;
        if (timeSinceError < rateLimitQueue.waitTime) {
          const remainingWait = rateLimitQueue.waitTime - timeSinceError;
          console.log(
            `Rate limit cool-down in progress. Waiting ${remainingWait}ms before retry...`
          );
          await delay(remainingWait);
        }
      }

      // Add pre-emptive delay based on operation type
      const preDelay = calculateDynamicDelay(context.endpoint, context.points);
      await delay(preDelay);

      const result = await operation();

      // Reset rate limit queue on success
      rateLimitQueue.isProcessing = false;
      rateLimitQueue.consecutiveErrors = 0;
      rateLimitQueue.waitTime = 0;

      // Track successful API call
      await trackApiMetrics(
        context.supabase,
        context.accountId,
        context.endpoint,
        context.callType,
        context.points,
        true
      );

      return result;
    } catch (error: unknown) {
      const apiError = error as {
        response?: { error?: { code?: number; message?: string } };
      };
      const errorCode = apiError?.response?.error?.code;
      const isRateLimit = [17, 80000, 80003, 80004, 4, 613].includes(
        errorCode || 0
      );

      // Track failed API call
      await trackApiMetrics(
        context.supabase,
        context.accountId,
        context.endpoint,
        context.callType,
        context.points,
        false,
        errorCode?.toString(),
        apiError?.response?.error?.message
      );

      if (isRateLimit) {
        // Update rate limit queue
        rateLimitQueue.isProcessing = true;
        rateLimitQueue.lastErrorTime = Date.now();
        rateLimitQueue.consecutiveErrors++;

        // Calculate wait time based on consecutive errors
        rateLimitQueue.waitTime = getBackoffDelay(retries, errorCode);

        if (retries >= maxRetries) {
          console.log(
            `Max retries (${maxRetries}) reached for rate limit. Throwing error.`
          );
          throw error;
        }

        console.log(
          `Rate limit hit on ${context.endpoint}. Consecutive errors: ${
            rateLimitQueue.consecutiveErrors
          }. Waiting ${rateLimitQueue.waitTime}ms before retry ${
            retries + 1
          }/${maxRetries}...`
        );

        await delay(rateLimitQueue.waitTime);
        retries++;

        // For insights API, add extra delay
        if (isInsights) {
          await delay(RATE_LIMIT_CONFIG.INSIGHTS_DELAY);
        }

        continue;
      }

      // For non-rate limit errors, throw immediately
      throw error;
    }
  }
}

// Helper function to get date range for last 24 hours
function getLast24HoursDateRange() {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setHours(startDate.getHours() - 24);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// Helper function to get date range for last 6 months
function getLast6MonthsDateRange() {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setMonth(startDate.getMonth() - 6);
  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// Helper function to get date range based on timeframe
function getDateRangeForTimeframe(timeframe: string) {
  return timeframe === "24h"
    ? getLast24HoursDateRange()
    : getLast6MonthsDateRange();
}

// Helper function to get insights with rate limiting and error handling
async function getInsights(
  entity: InsightCapableEntity,
  supabase: SupabaseClient,
  accountId: string,
  timeframe: string = "24h"
): Promise<InsightResult | null> {
  return withRateLimitRetry(
    async () => {
      const dateRange = getDateRangeForTimeframe(timeframe);
      console.log(
        "Fetching insights for entity:",
        entity.id,
        "with date range:",
        dateRange,
        "timeframe:",
        timeframe
      );

      const insights = await entity.getInsights(
        [
          // Standard metrics
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

          // Engagement metrics - use correct field names from Facebook API
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

      const processedInsights = (insights?.[0] as InsightResult) || null;

      return processedInsights;
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

// Helper function to fetch creative details with retry mechanism and FORCE asset_feed_spec
async function fetchCreativeWithRetry(
  creativeId: string,
  supabase: SupabaseClient,
  accountId: string,
  maxRetries = 5 // Increased retries for critical data
): Promise<any> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(
        `🎨 Fetching creative ${creativeId} (attempt ${attempt}/${maxRetries})`
      );

      const creative = await withRateLimitRetry(
        async () => {
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

// Helper function to determine creative type with comprehensive fallbacks
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

// Enhanced function to save ad engagement metrics with comprehensive data
async function saveAdEngagementMetrics(
  supabase: SupabaseClient,
  adId: string,
  insights: any,
  date: string
) {
  try {
    console.log(`📊 Processing engagement metrics for ad ${adId}...`);

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
      // Engagement metrics from actions
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
            insights.actions.find((a: any) => a.action_type === "comment").value
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
      // Metadata
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    console.log(`📊 Engagement data prepared for ad ${adId}:`, {
      insights_available: insights ? true : false,
      inline_link_clicks: engagementData.inline_link_clicks,
      video_30s_watched: engagementData.video_30s_watched,
      thruplays: engagementData.thruplays,
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

// GET handler - now triggers background jobs instead of processing directly
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const accountId = searchParams.get("accountId");
    const timeframe = searchParams.get("timeframe") || "24h";

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Generate a unique request ID for tracking
    const requestId = uuidv4();

    // Create the job payload
    const jobPayload: MetaMarketingJobPayload = {
      accountId,
      timeframe,
      action: action || "getData",
      requestId,
    };

    // Check if there's already a running job for this account and action
    const { data: existingJobs } = await supabase
      .from("background_jobs")
      .select("*")
      .eq("job_type", "meta-marketing-sync")
      .in("status", ["queued", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingJobs && existingJobs.length > 0) {
      const existingJob = existingJobs[0];
      const timeSinceCreated =
        Date.now() - new Date(existingJob.created_at).getTime();

      // If there's a job created in the last 5 minutes, return its status
      if (timeSinceCreated < 5 * 60 * 1000) {
        return NextResponse.json({
          message: "Background job already in progress",
          requestId: existingJob.request_id,
          status: existingJob.status,
          progress: existingJob.progress,
          isBackgroundJob: true,
          existingJob: true,
        });
      }
    }

    // Create initial job record in database
    const { error: jobError } = await supabase.from("background_jobs").insert([
      {
        request_id: requestId,
        job_type: "meta-marketing-sync",
        status: "queued",
        progress: 0,
      },
    ]);

    if (jobError) {
      console.error("Error creating job record:", jobError);
      return NextResponse.json(
        { error: "Failed to create background job" },
        { status: 500 }
      );
    }

    // Start the background job
    const jobResult = await startMetaMarketingBackgroundJob(jobPayload);

    if (!jobResult.success) {
      // Update job status to failed
      await supabase
        .from("background_jobs")
        .update({
          status: "failed",
          error_message: jobResult.error,
        })
        .eq("request_id", requestId);

      return NextResponse.json({ error: jobResult.error }, { status: 500 });
    }

    return NextResponse.json({
      message: "Background job started successfully",
      requestId,
      messageId: jobResult.messageId,
      status: "queued",
      progress: 0,
      isBackgroundJob: true,
      estimatedDuration: "5-15 minutes",
      checkStatusUrl: `/api/meta-marketing-daily/status?requestId=${requestId}`,
    });
  } catch (error: any) {
    console.error("Error starting background job:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown error occurred",
      },
      { status: 500 }
    );
  }
}

// POST handler for creating campaigns and ad sets
export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const data = await request.json();

    // For POST operations, we can still process directly since they're typically quick
    // If these become long-running, you can also move them to background jobs

    const supabase = await createClient();

    // Generate request ID for tracking
    const requestId = uuidv4();

    // For now, we'll handle POST operations directly
    // You can extend this to use background jobs if needed

    switch (action) {
      case "createCampaign":
        // Direct processing for campaign creation
        return NextResponse.json({
          message: "Campaign creation not yet implemented in background mode",
          requestId,
        });

      case "createAdSet":
        // Direct processing for ad set creation
        return NextResponse.json({
          message: "Ad set creation not yet implemented in background mode",
          requestId,
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error:", error);
    if (error instanceof Error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "Unknown error occurred" },
      { status: 500 }
    );
  }
}

// Unified data fetching function to handle both timeframes
async function fetchData(
  accountId: string,
  supabase: any,
  timeframe: string = "24h"
) {
  try {
    // Initialize API with rate limit tracking
    const api = FacebookAdsApi.init(META_CONFIG.accessToken);
    api.setDebug(true);
    const account = new AdAccount(accountId);

    const dateRange = getDateRangeForTimeframe(timeframe);
    console.log(
      `Fetching ${timeframe} insights from ${dateRange.since} to ${dateRange.until}`
    );

    // Get account info with rate limiting
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

    console.log("Account Info:", accountInfo);

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

    console.log("Account Insights:", insights);

    // Store account data with proper type handling
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
      cost_per_unique_click: safeParseFloat(
        insights?.[0]?.cost_per_unique_click
      ),
      outbound_clicks: insights?.[0]?.outbound_clicks || [],
      outbound_clicks_ctr: safeParseFloat(insights?.[0]?.outbound_clicks_ctr),
      website_ctr: insights?.[0]?.website_ctr || [],
      website_purchase_roas: safeParseFloat(
        insights?.[0]?.website_purchase_roas
      ),
      last_updated: new Date(),
      is_data_complete: true,
      created_at: new Date(),
      updated_at: new Date(),
    };

    console.log("Prepared Account Data:", accountData);

    // Store in meta_account_insights table
    const { data: upsertData, error: accountError } = await supabase
      .from("meta_account_insights")
      .upsert([accountData], {
        onConflict: "account_id",
        ignoreDuplicates: false,
      })
      .select();

    if (accountError) {
      console.error("Supabase Error Details:", {
        error: accountError,
        code: accountError.code,
        message: accountError.message,
        details: accountError.details,
        hint: accountError.hint,
      });
      throw new Error(`Error storing account data: ${accountError.message}`);
    }

    console.log("Successfully stored account data:", upsertData);

    // Get campaigns
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

    const processedCampaigns = [];

    for (const campaign of campaigns) {
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
          start_time: campaign.start_time
            ? new Date(campaign.start_time)
            : null,
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
                  (sum: number, action: any) =>
                    sum + safeParseInt(action.value),
                  0
                )
              : null,
          last_updated: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
        };

        // Store in meta_campaigns table
        const { error: campaignError } = await supabase
          .from("meta_campaigns")
          .upsert([campaignData], {
            onConflict: "campaign_id",
            ignoreDuplicates: false,
          });

        if (campaignError) {
          console.error("Error storing campaign:", campaignError);
          continue;
        }

        // Process ad sets
        const adSets = await withRateLimitRetry(
          async () => {
            return campaign.getAdSets(
              [
                "name",
                "status",
                "daily_budget",
                "lifetime_budget",
                "bid_amount",
                "billing_event",
                "optimization_goal",
                "targeting",
                "bid_strategy",
                "attribution_spec",
                "promoted_object",
                "pacing_type",
                "configured_status",
                "effective_status",
                "destination_type",
                "frequency_control_specs",
                "is_dynamic_creative",
                "issues_info",
                "learning_stage_info",
                "source_adset_id",
                "targeting_optimization_types",
                "use_new_app_click",
                "start_time",
                "end_time",
              ],
              { limit: RATE_LIMIT_CONFIG.BATCH_SIZE }
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

        const campaignAdSets = [];

        for (const adSet of adSets) {
          const adSetInsights = await getInsights(
            adSet as InsightCapableEntity,
            supabase,
            accountId,
            timeframe
          );

          const adSetData = {
            ad_set_id: adSet.id,
            account_id: accountId,
            campaign_id: campaign.id,
            name: adSet.name,
            status: adSet.status,
            daily_budget: parseFloat(adSet.daily_budget) || 0,
            lifetime_budget: parseFloat(adSet.lifetime_budget) || 0,
            bid_amount: parseFloat(adSet.bid_amount) || 0,
            billing_event: adSet.billing_event,
            optimization_goal: adSet.optimization_goal,
            targeting: adSet.targeting,
            bid_strategy: adSet.bid_strategy,
            attribution_spec: adSet.attribution_spec,
            promoted_object: adSet.promoted_object,
            pacing_type: adSet.pacing_type || [],
            configured_status: adSet.configured_status,
            effective_status: adSet.effective_status,
            destination_type: adSet.destination_type,
            frequency_control_specs: adSet.frequency_control_specs,
            is_dynamic_creative: adSet.is_dynamic_creative,
            issues_info: adSet.issues_info || [],
            learning_stage_info: adSet.learning_stage_info,
            source_adset_id: adSet.source_adset_id,
            targeting_optimization_types:
              adSet.targeting_optimization_types || [],
            use_new_app_click: adSet.use_new_app_click,
            start_time: adSet.start_time ? new Date(adSet.start_time) : null,
            end_time: adSet.end_time ? new Date(adSet.end_time) : null,
            impressions: safeParseInt(adSetInsights?.impressions),
            clicks: safeParseInt(adSetInsights?.clicks),
            reach: safeParseInt(adSetInsights?.reach),
            spend: safeParseFloat(adSetInsights?.spend),
            conversions: adSetInsights?.actions
              ? adSetInsights.actions.reduce((acc: any, action: any) => {
                  acc[action.action_type] = action.value;
                  return acc;
                }, {})
              : null,
            cost_per_conversion:
              adSetInsights?.actions && adSetInsights.actions.length > 0
                ? safeParseFloat(adSetInsights.spend) /
                  adSetInsights.actions.reduce(
                    (sum: number, action: any) =>
                      sum + safeParseInt(action.value),
                    0
                  )
                : null,
            last_updated: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
          };

          // Store in meta_ad_sets table
          const { error: adSetError } = await supabase
            .from("meta_ad_sets")
            .upsert([adSetData], {
              onConflict: "ad_set_id",
              ignoreDuplicates: false,
            });

          if (adSetError) {
            console.error("Error storing ad set:", adSetError);
            continue;
          }

          // Process ads
          const ads = await withRateLimitRetry(
            async () => {
              return adSet.getAds(
                [
                  "name",
                  "status",
                  "creative",
                  "tracking_specs",
                  "conversion_specs",
                  "preview_shareable_link",
                  "effective_object_story_id",
                  "configured_status",
                  "effective_status",
                  "issues_info",
                  "source_ad_id",
                  "engagement_audience",
                  "object_story_spec",
                  "recommendations",
                  "tracking_and_conversion_specs",
                ],
                { limit: RATE_LIMIT_CONFIG.BATCH_SIZE }
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

          // Process ads with robust creative fetching and engagement metrics
          const processedAds = [];
          const today = new Date().toISOString().split("T")[0];

          for (const ad of ads) {
            try {
              console.log(`\n--- Processing ad ${ad.id} ---`);
              console.log(`Ad name: ${ad.name}`);
              console.log(`Ad status: ${ad.status}`);

              // Get insights for this ad - THIS IS CRITICAL FOR ENGAGEMENT METRICS
              const adInsights = await getInsights(
                ad as InsightCapableEntity,
                supabase,
                accountId,
                timeframe
              );

              // Extract creative ID and fetch creative details with retries
              let creativeDetails = null;
              let creativeId = null;
              let creativeType = "UNKNOWN";
              let assetFeedSpec = null;

              if (ad.creative && ad.creative.id) {
                creativeId = ad.creative.id;
                console.log(`🎨 Found creative ID: ${creativeId}`);

                // CRITICAL: Fetch creative details with FORCED asset_feed_spec
                creativeDetails = await fetchCreativeWithRetry(
                  creativeId,
                  supabase,
                  accountId
                );

                // ALWAYS ensure we have asset_feed_spec when we have creative_id
                if (creativeDetails) {
                  console.log(`✅ Creative details fetched for ${creativeId}`);
                  creativeType = determineCreativeType(creativeDetails, ad);

                  // FORCE asset_feed_spec - this should NEVER be null if we have creative_id
                  assetFeedSpec = creativeDetails.asset_feed_spec;

                  if (!assetFeedSpec) {
                    console.error(
                      `❌ CRITICAL ERROR: No asset_feed_spec for creative ${creativeId}!`
                    );
                    // Create emergency fallback
                    assetFeedSpec = {
                      _fallback_source: "EMERGENCY_CREATIVE_FALLBACK",
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

              console.log(`🎭 Determined creative type: ${creativeType}`);
              console.log(
                `📋 Asset feed spec status: ${
                  assetFeedSpec ? "PRESENT" : "NULL"
                }`
              );

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

              // Create comprehensive ad data structure
              const adData = {
                ad_id: ad.id,
                account_id: accountId,
                ad_set_id: adSet.id,
                campaign_id: campaign.id,
                name: ad.name,
                status: ad.status,
                creative: ad.creative || null,
                creative_id: creativeId,
                creative_type: creativeType,
                asset_feed_spec: assetFeedSpec, // This should ALWAYS be present if creative_id exists
                object_story_spec:
                  creativeDetails?.object_story_spec ||
                  ad.creative?.object_story_spec ||
                  null,
                tracking_specs: ad.tracking_specs || null,
                conversion_specs: ad.conversion_specs || null,
                preview_url: ad.preview_shareable_link || null,
                effective_object_story_id:
                  ad.effective_object_story_id ||
                  creativeDetails?.effective_object_story_id ||
                  null,
                configured_status: ad.configured_status || null,
                effective_status: ad.effective_status || null,
                issues_info: ad.issues_info || [],
                source_ad_id: ad.source_ad_id || null,
                engagement_audience: ad.engagement_audience || null,
                recommendations: ad.recommendations || [],
                tracking_and_conversion_specs:
                  ad.tracking_and_conversion_specs || null,
                template_url: creativeDetails?.template_url || null,
                thumbnail_url: creativeDetails?.thumbnail_url || null,
                image_url: creativeDetails?.image_url || null,
                video_id: creativeDetails?.video_id || null,
                instagram_permalink_url:
                  creativeDetails?.instagram_permalink_url || null,
                url_tags: creativeDetails?.url_tags || null,
                impressions: safeParseInt(adInsights?.impressions),
                clicks: safeParseInt(adInsights?.clicks),
                reach: safeParseInt(adInsights?.reach),
                spend: safeParseFloat(adInsights?.spend),
                conversions: adInsights?.actions
                  ? adInsights.actions.reduce(
                      (
                        acc: Record<string, string>,
                        action: { action_type: string; value: string }
                      ) => {
                        acc[action.action_type] = action.value;
                        return acc;
                      },
                      {}
                    )
                  : null,
                cost_per_conversion:
                  adInsights?.actions && adInsights.actions.length > 0
                    ? safeParseFloat(adInsights.spend) /
                      adInsights.actions.reduce(
                        (sum: number, action: { value: string }) =>
                          sum + safeParseInt(action.value),
                        0
                      )
                    : null,
                last_updated: new Date(),
                created_at: new Date(),
                updated_at: new Date(),
              };

              // Store the ad data
              const { error: adError } = await supabase
                .from("meta_ads")
                .upsert([adData], {
                  onConflict: "ad_id",
                  ignoreDuplicates: false,
                });

              if (adError) {
                console.error(`❌ Error storing ad ${ad.id}:`, adError);
              } else {
                console.log(`✅ Successfully stored ad ${ad.id}`);
                processedAds.push(adData);
              }

              // CRITICAL: ALWAYS save ad engagement metrics for EVERY ad
              console.log(`📊 Saving engagement metrics for ad ${ad.id}...`);
              try {
                await saveAdEngagementMetrics(
                  supabase,
                  ad.id,
                  adInsights,
                  today
                );
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

              // Add delay between ad processing
              await delay(RATE_LIMIT_CONFIG.MIN_DELAY);
            } catch (error) {
              console.error(`❌ Error processing ad ${ad.id}:`, error);
              continue;
            }
          }

          const adSetAds = processedAds;

          campaignAdSets.push({
            adSet: adSetData,
            ads: adSetAds,
          });
        }

        processedCampaigns.push({
          campaign: campaignData,
          adSets: campaignAdSets,
        });
      } catch (error) {
        console.error(`Error processing campaign ${campaign.id}:`, error);
        continue;
      }
    }

    return {
      accountData,
      campaigns: processedCampaigns,
    };
  } catch (error) {
    console.error(`Error in fetchData (timeframe: ${timeframe}):`, error);
    throw error;
  }
}

// Unit tests (these are kept in comments and can be moved to a proper test file)
/*
function testProcessEngagementMetrics() {
  // Test case 1: Basic functionality
  const mockInsights = {
    impressions: "1000",
    spend: "50",
    page_engagement: "200",
    post_comments: "20", 
    post_engagement: "300",
    video_3_sec_watched_actions: [{ action_type: 'video_view', value: '500' }],
    video_thruplay_watched_actions: [{ action_type: 'video_view', value: '300' }],
    video_30_sec_watched_actions: [{ action_type: 'video_view', value: '250' }],
    video_p25_watched_actions: [{ action_type: 'video_view', value: '400' }],
    video_p50_watched_actions: [{ action_type: 'video_view', value: '350' }],
    video_p75_watched_actions: [{ action_type: 'video_view', value: '300' }],
    video_p95_watched_actions: [{ action_type: 'video_view', value: '200' }],
    video_avg_time_watched_actions: [{ action_type: 'video_view', value: '15.5' }]
  };
  
  const result = processEngagementMetrics(mockInsights as any, 50);
  
  console.assert(result.page_engagement === 200, "page_engagement should be 200");
  console.assert(result.post_comments === 20, "post_comments should be 20");
  console.assert(result.post_engagement === 300, "post_engagement should be 300");
  console.assert(result.three_sec_video_views === 500, "three_sec_video_views should be 500");
  console.assert(result.thruplays === 300, "thruplays should be 300");
  console.assert(result.avg_watch_time_seconds === 15.5, "avg_watch_time_seconds should be 15.5");
  console.assert(result.cost_per_page_engagement === 0.25, "cost_per_page_engagement should be 0.25");
  console.assert(result.cost_per_thruplay === 0.17, "cost_per_thruplay should be 0.17 approx");
  console.assert(result.vtr_percentage === 30, "vtr_percentage should be 30");
  console.assert(result.hook_rate_percentage === 50, "hook_rate_percentage should be 50");
  
  // Test case 2: Missing data
  const emptyInsights = { impressions: "1000", spend: "50" };
  const emptyResult = processEngagementMetrics(emptyInsights as any, 50);
  
  console.assert(emptyResult.page_engagement === 0, "page_engagement should be 0 when missing");
  console.assert(emptyResult.cost_per_page_engagement === 0, "cost_per_page_engagement should be 0 when missing");
  
  // Test case 3: Division by zero
  const zeroImpressions = { impressions: "0", spend: "50", page_engagement: "0" };
  const zeroResult = processEngagementMetrics(zeroImpressions as any, 50);
  
  console.assert(zeroResult.vtr_percentage === 0, "vtr_percentage should be 0 when impressions is 0");
  console.assert(zeroResult.cost_per_page_engagement === 0, "cost_per_page_engagement should be 0 when engagement is 0");

  console.log("All processEngagementMetrics tests passed!");
}

// Uncomment to run tests in development environment
// if (process.env.NODE_ENV === "development") {
//   testProcessEngagementMetrics();
// }
*/
