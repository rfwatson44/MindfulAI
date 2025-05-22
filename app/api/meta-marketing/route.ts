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

// Mark route as dynamic
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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

// Helper function to get insights with rate limiting and error handling
async function getInsights(
  entity: InsightCapableEntity,
  supabase: SupabaseClient,
  accountId: string
): Promise<InsightResult | null> {
  return withRateLimitRetry(
    async () => {
      const dateRange = getLast6MonthsDateRange();
      console.log(
        "Fetching insights for entity:",
        entity.id,
        "with date range:",
        dateRange
      );

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

// Helper function to determine actual creative type
function determineActualCreativeType(details: any): string {
  if (!details || !details.object_type) {
    return "UNKNOWN";
  }

  if (details.object_type === "SHARE") {
    // For SHARE type, use better classification based on content
    if (details.video_id) {
      return "VIDEO";
    } else if (details.image_url || details.thumbnail_url) {
      return "IMAGE";
    }
  }

  // Return original type if not SHARE or no better classification available
  return details.object_type;
}

// Helper function to fetch creative details with retry mechanism
async function fetchCreativeWithRetry(
  creativeId: string,
  maxRetries = 3
): Promise<any> {
  try {
    // Use the enhanced creative fetching logic
    const fetchResult = await fetchCreative(creativeId, maxRetries);

    // Track API usage for metrics
    await trackCreativeApiFetches(
      await createClient(),
      "meta", // Generic tracking for now
      fetchResult.success,
      fetchResult.errorType
    );

    if (fetchResult.success) {
      // Process data with fallbacks, using actual creative data
      return processCreativeData(fetchResult.data, null);
    } else {
      // Process with fallbacks, using error info
      return processCreativeData(null, null, fetchResult.errorType);
    }
  } catch (error) {
    console.error(
      `Unexpected error in fetchCreativeWithRetry for ${creativeId}:`,
      error
    );
    return {
      thumbnail_url: null,
      creative_type: "UNKNOWN",
      asset_feed_spec: "UNEXPECTED_ERROR",
      url_tags: null,
      template_url: null,
      instagram_permalink_url: null,
      effective_object_story_id: null,
      video_id: null,
      image_url: null,
    };
  }
}

// Update the ad processing code to use parallel fetching with retries
// This replaces the existing for loop for processing ads
const processAdsWithParallelCreativeFetch = async (
  ads: any[],
  accountId: string,
  adSetId: string,
  campaignId: string,
  supabase: SupabaseClient
) => {
  // Process insights for all ads in parallel
  const adInsightsPromises = ads.map((ad) =>
    getInsights(ad as InsightCapableEntity, supabase, accountId).catch(
      (error) => {
        console.error(`Error fetching insights for ad ${ad.id}:`, error);
        return null;
      }
    )
  );
  const adInsightsResults = await Promise.all(adInsightsPromises);

  // Process creative details for all ads in parallel with a small delay between requests (300ms)
  // Using enhanced fetchCreativeDetails to get better fallbacks
  const adCreativePromises = ads.map((ad, index) => {
    if (ad.creative && ad.creative.id) {
      // Use a delay of index * 300ms to stagger requests
      return fetchCreativeDetails(ad, Math.min(index * 300, 5000)).catch(
        (error) => {
          console.error(`Error in creative fetch for ad ${ad.id}:`, error);
          return null;
        }
      );
    }
    return Promise.resolve(null);
  });

  const creativeResults = await Promise.all(adCreativePromises);

  // Combine ad data with insights and creative details
  const processedAds = ads.map((ad, index) => {
    const adInsights = adInsightsResults[index];
    const creativeDetails = creativeResults[index];

    // Create base ad record
    const adRecord = {
      ad_id: ad.id,
      account_id: accountId,
      ad_set_id: adSetId,
      campaign_id: campaignId,
      name: ad.name,
      status: ad.status,
      creative: ad.creative || null,
      tracking_specs: ad.tracking_specs || null,
      conversion_specs: ad.conversion_specs || null,
      preview_url: ad.preview_shareable_link || null,
      creative_id: ad.creative?.id || null,
      effective_object_story_id: ad.effective_object_story_id || null,
      configured_status: ad.configured_status || null,
      effective_status: ad.effective_status || null,
      issues_info: ad.issues_info || [],
      source_ad_id: ad.source_ad_id || null,
      engagement_audience: ad.engagement_audience || null,
      object_story_spec: ad.object_story_spec || null,
      recommendations: ad.recommendations || [],
      tracking_and_conversion_specs: ad.tracking_and_conversion_specs || null,
      // Add creative details if available
      ...(creativeDetails || {}),
    };

    // Only add insights if they're available
    if (adInsights) {
      const insightsData = adInsights as InsightResult;
      return {
        ...adRecord,
        impressions: safeParseInt(insightsData.impressions),
        clicks: safeParseInt(insightsData.clicks),
        reach: safeParseInt(insightsData.reach),
        spend: safeParseFloat(insightsData.spend),
        conversions: insightsData.actions
          ? insightsData.actions.reduce(
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
          insightsData.actions && insightsData.actions.length > 0
            ? safeParseFloat(insightsData.spend) /
              insightsData.actions.reduce(
                (sum: number, action: { value: string }) =>
                  sum + safeParseInt(action.value),
                0
              )
            : null,
        last_updated: new Date(),
        created_at: new Date(),
        updated_at: new Date(),
      };
    }

    // Return ad record without insights
    return {
      ...adRecord,
      last_updated: new Date(),
      created_at: new Date(),
      updated_at: new Date(),
    };
  });

  // Batch upsert the processed ads
  if (processedAds.length > 0) {
    const { error: adsUpsertError } = await supabase
      .from("meta_ads")
      .upsert(processedAds, {
        onConflict: "ad_id",
        ignoreDuplicates: false,
      });

    if (adsUpsertError) {
      console.error("Error upserting ads:", adsUpsertError);
    } else {
      console.log(`Successfully upserted ${processedAds.length} ads`);
    }
  }

  return processedAds;
};

// GET handler for 24-hour data
async function get24HourData(accountId: string, supabase: any) {
  try {
    // Use already initialized API
    const account = new AdAccount(accountId);

    const dateRange = getLast6MonthsDateRange();
    console.log(
      `Fetching 6 months insights from ${dateRange.since} to ${dateRange.until}`
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
          accountId
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
            accountId
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

          // Process ads with parallel creative fetching
          const adSetAds = await processAdsWithParallelCreativeFetch(
            ads,
            accountId,
            adSet.id,
            campaign.id,
            supabase
          );

          campaignAdSets.push({
            adSet: adSetData,
            ads: adSetAds,
          });

          await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
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
    console.error("Error in get24HourData:", error);
    throw error;
  }
}

// Helper function to check if data needs refresh (3 days threshold)
async function checkDataFreshness(
  supabase: any,
  accountId: string
): Promise<{ needsRefresh: boolean; isNewAccount: boolean }> {
  try {
    // Check account_insights table for last update
    const { data: accountData } = await supabase
      .from("meta_account_insights")
      .select("last_updated")
      .eq("account_id", accountId)
      .single();

    if (!accountData) {
      console.log(
        `No existing data found for account ${accountId}. Will fetch 12 months of data.`
      );
      return { needsRefresh: true, isNewAccount: true };
    }

    const lastUpdate = new Date(accountData.last_updated);
    const now = new Date();
    const daysSinceLastUpdate =
      (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24);

    console.log(
      `Last update for account ${accountId} was ${daysSinceLastUpdate.toFixed(
        1
      )} days ago`
    );
    return {
      needsRefresh: daysSinceLastUpdate > 3,
      isNewAccount: false,
    };
  } catch (error) {
    console.error("Error checking data freshness:", error);
    // If there's an error checking, assume we need to refresh to be safe
    return { needsRefresh: true, isNewAccount: true };
  }
}

// Helper function to get date range based on account status
function getDateRange() {
  const endDate = new Date();
  const startDate = new Date();

  // For new accounts, get 6 months of data
  startDate.setMonth(startDate.getMonth() - 6);

  return {
    since: startDate.toISOString().split("T")[0],
    until: endDate.toISOString().split("T")[0],
  };
}

// GET handler for account info and campaigns
export async function GET(request: Request) {
  const supabase = await createClient();

  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get("action");
    const accountId = searchParams.get("accountId");

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID is required" },
        { status: 400 }
      );
    }

    // Initialize Facebook API
    const api = FacebookAdsApi.init(META_CONFIG.accessToken);
    api.setDebug(true);

    switch (action) {
      case "get24HourData":
        const data = await get24HourData(accountId, supabase);
        return NextResponse.json({
          result: data,
          message: "Successfully fetched 24-hour data",
        });

      case "getAccountInfo":
        const accountInfo = await withRateLimitRetry(
          async () => {
            return new AdAccount(accountId).read([
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

        // Use appropriate date range based on account status
        const dateRange = getDateRange();
        console.log(
          `Fetching insights from ${dateRange.since} to ${dateRange.until}`
        );

        const insights = await withRateLimitRetry(
          async () => {
            return new AdAccount(accountId).getInsights(
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
        console.log({ accountId, insights });

        // Store enhanced account data
        const accountData = {
          account_id: accountId,
          name: accountInfo.name,
          account_status: accountInfo.account_status,
          amount_spent: parseFloat(accountInfo.amount_spent) || 0,
          balance: parseFloat(accountInfo.balance) || 0,
          currency: accountInfo.currency,
          spend_cap: parseFloat(accountInfo.spend_cap) || null,
          timezone_name: accountInfo.timezone_name,
          timezone_offset_hours_utc: accountInfo.timezone_offset_hours_utc,
          business_country_code: accountInfo.business_country_code,
          disable_reason: accountInfo.disable_reason,
          is_prepay_account: accountInfo.is_prepay_account,
          tax_id_status: accountInfo.tax_id_status,
          insights_start_date: new Date(dateRange.since),
          insights_end_date: new Date(dateRange.until),
          total_impressions: safeParseInt(insights?.[0]?.impressions ?? "0"),
          total_clicks: safeParseInt(insights?.[0]?.clicks ?? "0"),
          total_reach: safeParseInt(insights?.[0]?.reach ?? "0"),
          total_spend: parseFloat(insights?.[0]?.spend ?? "0"),
          average_cpc: parseFloat(insights?.[0]?.cpc ?? "0"),
          average_cpm: parseFloat(insights?.[0]?.cpm ?? "0"),
          average_ctr: parseFloat(insights?.[0]?.ctr ?? "0"),
          average_frequency: parseFloat(insights?.[0]?.frequency ?? "0"),
          actions: insights?.[0]?.actions || [],
          action_values: insights?.[0]?.action_values || [],
          cost_per_action_type: insights?.[0]?.cost_per_action_type || [],
          cost_per_unique_click: parseFloat(
            insights?.[0]?.cost_per_unique_click ?? "0"
          ),
          outbound_clicks: insights?.[0]?.outbound_clicks || [],
          outbound_clicks_ctr: parseFloat(
            insights?.[0]?.outbound_clicks_ctr ?? "0"
          ),
          website_ctr: insights?.[0]?.website_ctr || [],
          website_purchase_roas: parseFloat(
            insights?.[0]?.website_purchase_roas ?? "0"
          ),
          last_updated: new Date(),
        };
        console.log("ACCOUNT DATA", accountData);

        // Upsert with proper constraint
        const { error: upsertError } = await supabase
          .from("meta_account_insights")
          .upsert([accountData], {
            onConflict: "account_id",
            ignoreDuplicates: false,
          });

        if (upsertError) {
          throw new Error(
            `Error upserting account data: ${upsertError.message}`
          );
        }

        return NextResponse.json({
          result: { ...accountInfo, insights: insights?.[0] },
          cached: false,
          dateRange,
        });

      case "getCampaigns":
        // Fetch directly from Meta API with rate limiting
        const campaigns = await withRateLimitRetry(
          async () => {
            console.log(
              "Fetching campaigns from Meta API for account:",
              accountId
            );
            return new AdAccount(accountId).getCampaigns(
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
            console.log("Processing campaign:", campaign.id);

            // Get campaign insights with all new metrics
            const insights = await getInsights(
              campaign as InsightCapableEntity,
              supabase,
              accountId
            );

            // Store enhanced campaign data with all new columns aligned with Supabase schema
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
              // Metrics from insights
              impressions: safeParseInt(insights?.impressions),
              clicks: safeParseInt(insights?.clicks),
              reach: safeParseInt(insights?.reach),
              spend: safeParseFloat(insights?.spend),
              // Convert actions array to conversions object for our schema
              conversions: insights?.actions
                ? insights.actions.reduce((acc: any, action: any) => {
                    acc[action.action_type] = action.value;
                    return acc;
                  }, {})
                : null,
              // Calculate cost per conversion if we have conversions
              cost_per_conversion:
                insights?.actions && insights.actions.length > 0
                  ? safeParseFloat(insights.spend) /
                    insights.actions.reduce(
                      (sum: number, action: any) =>
                        sum + safeParseInt(action.value),
                      0
                    )
                  : null,
              last_updated: new Date(),
              created_at: new Date(), // Only set on first creation
              updated_at: new Date(),
            };

            const { error: campaignError } = await supabase
              .from("meta_campaigns")
              .upsert([campaignData], {
                onConflict: "campaign_id",
                ignoreDuplicates: false,
              })
              .match({
                campaign_id: campaign.id,
                account_id: accountId,
              });

            if (campaignError) {
              console.error("Error storing campaign:", campaignError);
              continue;
            }

            // Get and store ad sets with rate limiting
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
                accountId
              );

              // Store enhanced ad set data with account_id aligned with Supabase schema
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
                start_time: adSet.start_time
                  ? new Date(adSet.start_time)
                  : null,
                end_time: adSet.end_time ? new Date(adSet.end_time) : null,
                // Metrics from insights
                impressions: safeParseInt(adSetInsights?.impressions),
                clicks: safeParseInt(adSetInsights?.clicks),
                reach: safeParseInt(adSetInsights?.reach),
                spend: safeParseFloat(adSetInsights?.spend),
                // Convert actions array to conversions object for our schema
                conversions: adSetInsights?.actions
                  ? adSetInsights.actions.reduce((acc: any, action: any) => {
                      acc[action.action_type] = action.value;
                      return acc;
                    }, {})
                  : null,
                // Calculate cost per conversion if we have conversions
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

              const { error: adSetError } = await supabase
                .from("meta_ad_sets")
                .upsert([adSetData], {
                  onConflict: "ad_set_id",
                  ignoreDuplicates: false,
                })
                .match({
                  ad_set_id: adSet.id,
                  campaign_id: campaign.id,
                  account_id: accountId,
                });

              if (adSetError) {
                console.error("Error storing ad set:", adSetError);
                continue;
              }

              // Get and store ads with rate limiting
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

              // Process ads with parallel creative fetching
              const adSetAds = await processAdsWithParallelCreativeFetch(
                ads,
                accountId,
                adSet.id,
                campaign.id,
                supabase
              );

              campaignAdSets.push({
                adSet: adSetData,
                ads: adSetAds,
              });

              await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
            }

            processedCampaigns.push({
              campaign: campaignData,
              adSets: campaignAdSets,
            });

            await delay(RATE_LIMIT_CONFIG.BURST_DELAY);
          } catch (error) {
            console.error(`Error processing campaign ${campaign.id}:`, error);
            continue;
          }
        }

        return NextResponse.json({
          result: {
            campaigns: processedCampaigns,
            pagination: {
              page: 1,
              pageSize: RATE_LIMIT_CONFIG.BATCH_SIZE,
              total: processedCampaigns.length,
              fromApi: true,
            },
          },
        });

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error: any) {
    console.error("Error:", error);

    // Handle rate limit errors
    if (error?.response?.error?.code === 17) {
      return NextResponse.json(
        {
          error: "Rate limit reached. Please try again in a few minutes.",
          retryAfter: RATE_LIMIT_CONFIG.STANDARD.BLOCK_TIME,
        },
        { status: 429 }
      );
    }

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

    const account = new AdAccount(data.accountId);
    const supabase = await createClient();

    let result;
    let supabaseResult;

    switch (action) {
      case "createCampaign":
        try {
          result = await account.createCampaign(["id"], {
            name: data.name,
            objective: data.objective,
            status: data.status,
            special_ad_categories: [],
          });

          // Store in Supabase
          const campaignData = {
            campaign_id: result.id,
            account_id: data.accountId,
            name: data.name,
            status: data.status,
            objective: data.objective,
          };

          const { data: insertedData, error: supabaseError } = await supabase
            .from("meta_campaigns")
            .insert([campaignData]);

          if (supabaseError) {
            console.error("Supabase error:", supabaseError);
            throw new Error("Failed to store campaign data");
          }

          supabaseResult = insertedData;
        } catch (error) {
          console.error("Error creating campaign:", error);
          throw error;
        }
        break;

      case "createAdSet":
        try {
          result = await account.createAdSet(["id"], {
            name: data.name,
            campaign_id: data.campaignId,
            daily_budget: data.dailyBudget,
            start_time: data.startTime,
            end_time: data.endTime,
            bid_amount: data.bidAmount,
            billing_event: data.billingEvent,
            optimization_goal: data.optimizationGoal,
            targeting: data.targeting,
            status: data.status,
          });

          // Store in Supabase
          const adSetData = {
            ad_set_id: result.id,
            campaign_id: data.campaignId,
            name: data.name,
            status: data.status,
            daily_budget: data.dailyBudget,
            bid_amount: data.bidAmount,
            billing_event: data.billingEvent,
            optimization_goal: data.optimizationGoal,
            targeting: data.targeting,
            start_time: data.startTime ? new Date(data.startTime) : undefined,
            end_time: data.endTime ? new Date(data.endTime) : undefined,
          };

          const { data: insertedData, error: supabaseError } = await supabase
            .from("meta_ad_sets")
            .insert([adSetData]);

          if (supabaseError) {
            console.error("Supabase error:", supabaseError);
            throw new Error("Failed to store ad set data");
          }

          supabaseResult = insertedData;
        } catch (error) {
          console.error("Error creating ad set:", error);
          throw error;
        }
        break;

      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ result, supabaseResult });
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
